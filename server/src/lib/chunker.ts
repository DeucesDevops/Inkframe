/**
 * Simple text chunking utility for resource ingestion.
 */
export function splitIntoChunks(text: string, maxWords: number = 400): string[] {
    const words = text.split(/\s+/)
    const chunks: string[] = []

    for (let i = 0; i < words.length; i += maxWords) {
        chunks.push(words.slice(i, i + maxWords).join(' '))
    }

    return chunks
}

/**
 * Extracts basic keywords from a chunk of text.
 * In a real app, this might use NLP or LLM, but this is a simplified version.
 */
export function extractKeywords(text: string): string[] {
    // Remove special characters, lowercase, and split
    const words = text.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/)

    // Filter out common stop words (very basic list)
    const stopWords = new Set(['the', 'and', 'a', 'to', 'of', 'is', 'in', 'it', 'you', 'that', 'with', 'for', 'are', 'on', 'as', 'be', 'at', 'this', 'by', 'an', 'was', 'if', 'not', 'or'])

    const frequency: Record<string, number> = {}

    words.forEach(word => {
        if (word.length > 3 && !stopWords.has(word)) {
            frequency[word] = (frequency[word] || 0) + 1
        }
    })

    // Sort by frequency and return top 10
    return Object.keys(frequency)
        .sort((a, b) => frequency[b] - frequency[a])
        .slice(0, 10)
}
