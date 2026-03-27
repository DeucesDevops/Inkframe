import { Request, Response, NextFunction } from 'express'
import { prisma } from '../db/client.js'
import { streamCompletion } from '../lib/claude.js'

const OUTLINE_PROMPT = `You are an expert book planner. Given a title and genre, generate a complete book outline with 8-12 chapters. For each chapter provide: a title, a 2-sentence summary of what happens, and 3 key points to cover. Format as structured JSON with a "chapters" array.`
const CONTINUE_PROMPT = `You are a skilled ghostwriter helping the user continue their book chapter. Match the existing writing style exactly — same tone, sentence length, vocabulary level, and narrative voice. Write the next 3-5 paragraphs that flow naturally from where the text ends. Do not summarise or change what came before.`
const REWRITE_PROMPT = `You are an expert editor. Rewrite the provided text to improve clarity, flow, and impact while preserving the original meaning and the author's unique voice.`
const SUMMARIZE_PROMPT = `You are an expert editor. Provide a concise, insightful summary of the chapter content provided. Capture the key points, themes, and narrative arc in 2-3 paragraphs.`
const TITLE_PROMPT = `You are a book marketing expert. Based on the description provided, suggest 5 compelling, marketable book titles that would attract readers. For each title, briefly explain why it works. Return JSON with a "titles" array of objects with "title" and "reason" fields.`

export const generateOutline = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { title, genre, bookId } = req.body
    if (!title) return res.status(400).json({ error: 'Title required' })
    if (bookId) {
      const book = await prisma.book.findFirst({ where: { id: bookId, userId: req.userId } })
      if (!book) return res.status(404).json({ error: 'Book not found' })
    }
    await streamCompletion(OUTLINE_PROMPT, `Title: ${title}\nGenre: ${genre || 'general'}`, res)
  } catch (err) { next(err) }
}

export const continueWriting = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { chapterTitle, existingContent } = req.body
    if (!existingContent) return res.status(400).json({ error: 'Content required' })
    const userPrompt = `Chapter: ${chapterTitle || 'Untitled'}\n\nExisting content:\n${existingContent}\n\nPlease continue writing from here.`
    await streamCompletion(CONTINUE_PROMPT, userPrompt, res)
  } catch (err) { next(err) }
}

export const rewriteText = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { selectedText, tone } = req.body
    if (!selectedText) return res.status(400).json({ error: 'Text required' })
    const userPrompt = tone
      ? `Rewrite the following text in a ${tone} tone:\n\n${selectedText}`
      : `Rewrite the following text:\n\n${selectedText}`
    await streamCompletion(REWRITE_PROMPT, userPrompt, res)
  } catch (err) { next(err) }
}

export const summarizeChapter = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { content, chapterTitle } = req.body
    if (!content) return res.status(400).json({ error: 'Content required' })
    const userPrompt = `Chapter: ${chapterTitle || 'Untitled'}\n\nContent:\n${content}`
    await streamCompletion(SUMMARIZE_PROMPT, userPrompt, res)
  } catch (err) { next(err) }
}

export const suggestTitles = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { description, genre } = req.body
    if (!description) return res.status(400).json({ error: 'Description required' })
    const userPrompt = `Genre: ${genre || 'general'}\nDescription: ${description}`
    await streamCompletion(TITLE_PROMPT, userPrompt, res)
  } catch (err) { next(err) }
}
