import { Request, Response, NextFunction } from 'express'
import { z } from 'zod'
import { getProjectContext, getRelevantChunks } from '../lib/contextHelper.js'
import { executeSkillStream } from '../lib/skillExecutor.js'
import { prisma } from '../db/client.js'

const schema = z.object({
    projectId: z.string().uuid(),
    chapterNumber: z.number().int().min(1),
    sectionIndex: z.number().int().min(0)
})

export async function run(req: Request, res: Response, next: NextFunction) {
    try {
        const { projectId, chapterNumber, sectionIndex } = schema.parse(req.body)
        const project = await getProjectContext(projectId, req.userId)
        const context = project.context as Record<string, any>

        // Gracefully handle missing outline/sections for testing
        let outline = context.outline?.chapters?.find(
            (c: any) => c.number === chapterNumber
        )
        if (!outline) {
            outline = {
                title: `Placeholder Chapter ${chapterNumber}`,
                core_argument: "An exploration of the core themes.",
                sections: []
            }
        }

        const section = outline.sections?.[sectionIndex] || {
            title: `Introduction to Chapter ${chapterNumber}`,
            key_points: ["Set the stage for the reader", "Introduce key concepts"],
            word_count_target: 500
        }

        // Retrieve relevant resource chunks
        const keywords = section.key_points?.join(' ').split(' ') || []
        const chunks = await getRelevantChunks(projectId, keywords, 5)
        const chunkText = chunks.map(c => c.text).join('\n---\n')

        const voiceProfile = context.voice?.voice_profile_prompt || ''
        const readerCalibration = context.audience?.writing_calibration_block || ''

        const systemPrompt = `You are an expert nonfiction book writer.
[VOICE PROFILE]
${voiceProfile}
[/VOICE PROFILE]
[READER CALIBRATION]
${readerCalibration}
[/READER CALIBRATION]
After writing the section, append this exact block:
---
CONFIDENCE: [0.0-1.0]
FLAGS:
- [any issues or uncertainties]
RECOMMENDED_ACTION: [proceed|surface_to_user|invoke_agent]
---`

        const userPrompt = `Book: "${project.title}"
Chapter ${chapterNumber}: "${outline.title}"
Core argument: ${outline.core_argument}
Write the section titled: "${section.title}"
Key points to cover:
${section.key_points?.map((p: string) => `- ${p}`).join('\n')}
Target word count: ${section.word_count_target || 800} words (±10%)
Reference material (use where relevant):
---
${chunkText}
---
Do NOT use: "it is important to note", "furthermore", "in conclusion", "delve into".
Do NOT open with a definition.
Open with something that creates immediate engagement.`

        // Stream response back to client and capture full text
        const fullText = await executeSkillStream({
            skillName: 'chapter-writer',
            systemPrompt,
            userPrompt,
            projectId,
            stream: true,
            res
        })

        // Parse metadata block from the end of the text
        const metadataMatch = fullText.match(/---\nCONFIDENCE: ([\d.]+)\nFLAGS:\n([\s\S]*?)\nRECOMMENDED_ACTION: (.*)\n---/)
        
        let confidenceScore = 0.8
        let flags: string[] = []
        let cleanText = fullText

        if (metadataMatch) {
            confidenceScore = parseFloat(metadataMatch[1])
            flags = metadataMatch[2].trim().split('\n').map(f => f.replace(/^- /, '').trim()).filter(Boolean)
            // Remove metadata block from final text
            cleanText = fullText.split('---')[0].trim()
        }

        // Persist to Chapter model
        await prisma.chapter.update({
            where: { projectId_chapterNumber: { projectId, chapterNumber } },
            data: {
                draftText: cleanText,
                confidenceScore,
                flags,
                status: 'draft_generated',
                updatedAt: new Date()
            }
        })
    } catch (err) { next(err) }
}
