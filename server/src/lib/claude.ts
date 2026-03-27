import Anthropic from '@anthropic-ai/sdk'
import { Response } from 'express'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function streamCompletion(
  systemPrompt: string,
  userPrompt: string,
  res: Response
): Promise<void> {
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')

  const stream = await anthropic.messages.stream({
    model: 'claude-opus-4-5',
    max_tokens: 2048,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  })

  for await (const chunk of stream) {
    if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
      res.write(`data: ${JSON.stringify({ text: chunk.delta.text })}\n\n`)
    }
  }

  res.write('data: [DONE]\n\n')
  res.end()
}

export async function complete(systemPrompt: string, userPrompt: string): Promise<string> {
  const msg = await anthropic.messages.create({
    model: 'claude-opus-4-5',
    max_tokens: 4096,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  })
  const block = msg.content[0]
  return block.type === 'text' ? block.text : ''
}
