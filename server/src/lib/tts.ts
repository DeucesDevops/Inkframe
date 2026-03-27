import { ElevenLabsClient } from 'elevenlabs'

const eleven = new ElevenLabsClient({ apiKey: process.env.ELEVENLABS_API_KEY })

export async function textToSpeech(text: string, voiceId: string): Promise<Buffer> {
  const chunks: Buffer[] = []

  const audioStream = await eleven.generate({
    voice: voiceId,
    text,
    model_id: 'eleven_multilingual_v2',
  })

  for await (const chunk of audioStream as AsyncIterable<Buffer>) {
    chunks.push(Buffer.from(chunk))
  }

  return Buffer.concat(chunks)
}
