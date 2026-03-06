import { GoogleGenerativeAI } from '@google/generative-ai'
import { prisma } from '../db/client.js'
import { Response } from 'express'

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)
const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' })

interface SkillConfig {
    skillName: string
    systemPrompt: string
    userPrompt: string
    projectId: string
    stream?: boolean
    res?: Response // for streaming
}

// Standard (non-streaming) skill call
export async function executeSkill(config: SkillConfig) {
    const execution = await prisma.skillExecution.create({
        data: { projectId: config.projectId, skillName: config.skillName, status: 'running' }
    })
    const startTime = Date.now()
    try {
        const result = await model.generateContent({
            systemInstruction: config.systemPrompt,
            contents: [{ role: 'user', parts: [{ text: config.userPrompt }] }]
        })
        const output = result.response.text()
        await prisma.skillExecution.update({
            where: { id: execution.id },
            data: {
                status: 'complete',
                output: { text: output },
                durationMs: Date.now() - startTime
            }
        })
        return output
    } catch (error: any) {
        await prisma.skillExecution.update({
            where: { id: execution.id },
            data: { status: 'failed', error: error.message }
        })
        throw error
    }
}

// Streaming skill call — pipes directly to Express response
export async function executeSkillStream(config: SkillConfig) {
    if (!config.res) throw new Error('Response object required for streaming')

    config.res.setHeader('Content-Type', 'text/event-stream')
    config.res.setHeader('Cache-Control', 'no-cache')
    config.res.setHeader('Connection', 'keep-alive')

    const execution = await prisma.skillExecution.create({
        data: { projectId: config.projectId, skillName: config.skillName, status: 'running' }
    })

    let fullText = ''

    const streamResult = await model.generateContentStream({
        systemInstruction: config.systemPrompt,
        contents: [{ role: 'user', parts: [{ text: config.userPrompt }] }]
    })

    for await (const chunk of streamResult.stream) {
        const text = chunk.text()
        if (text) {
            fullText += text
            config.res.write(`data: ${JSON.stringify({ text })}\n\n`)
        }
    }

    config.res.write(`data: ${JSON.stringify({ done: true })}\n\n`)
    config.res.end()

    await prisma.skillExecution.update({
        where: { id: execution.id },
        data: { status: 'complete', output: { text: fullText } }
    })

    return fullText
}
