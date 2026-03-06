import { useState, useCallback } from 'react'

export function useSkillStream() {
    const [output, setOutput] = useState('')
    const [streaming, setStreaming] = useState(false)
    const [done, setDone] = useState(false)

    const stream = useCallback(async (endpoint: string, body: object) => {
        setOutput('')
        setStreaming(true)
        setDone(false)

        const token = typeof window !== 'undefined' ? localStorage.getItem('inkframe_token') : null

        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}${endpoint}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(body)
        })

        if (!res.body) return

        const reader = res.body.getReader()
        const decoder = new TextDecoder()

        while (true) {
            const { done: streamDone, value } = await reader.read()
            if (streamDone) break

            const lines = decoder.decode(value).split('\n')
            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    try {
                        const data = JSON.parse(line.slice(6))
                        if (data.done) {
                            setDone(true)
                            setStreaming(false)
                            break
                        }
                        if (data.text) {
                            setOutput(prev => prev + data.text)
                        }
                    } catch (e) {
                        console.error('Error parsing SSE data', e)
                    }
                }
            }
        }
    }, [])

    return { output, streaming, done, stream }
}
