/**
 * Simple text chunking utility for resource ingestion.
 * Splits by word count but tries to respect sentence boundaries.
 */
export function splitIntoChunks(text: string, maxWords: number = 400): string[] {
    const sentences = text.match(/[^.!?]+[.!?]+/g) || [text]
    const chunks: string[] = []
    let currentChunk = ""
    let currentWordCount = 0

    for (const sentence of sentences) {
        const sentenceWords = sentence.trim().split(/\s+/).length
        if (currentWordCount + sentenceWords > maxWords && currentChunk !== "") {
            chunks.push(currentChunk.trim())
            currentChunk = ""
            currentWordCount = 0
        }
        currentChunk += " " + sentence
        currentWordCount += sentenceWords
    }

    if (currentChunk !== "") {
        chunks.push(currentChunk.trim())
    }

    return chunks
}

/**
 * Extracts keywords from a chunk of text.
 * Improved to handle common technical stop words and better frequency sorting.
 */
export function extractKeywords(text: string): string[] {
    // Remove special characters, lowercase, and split
    const words = text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/)

    // Expanded stop words
    const stopWords = new Set([
        'the', 'and', 'a', 'to', 'of', 'is', 'in', 'it', 'you', 'that', 'with', 'for', 'are', 'on', 'as', 'be', 'at', 'this', 'by', 'an', 'was', 'if', 'not', 'or',
        'from', 'which', 'but', 'how', 'they', 'we', 'our', 'what', 'there', 'their', 'about', 'who', 'been', 'would', 'could', 'should'
    ])

    const frequency: Record<string, number> = {}

    words.forEach(word => {
        if (word.length > 3 && !stopWords.has(word)) {
            frequency[word] = (frequency[word] || 0) + 1
        }
    })

    // Sort by frequency and return top 15
    return Object.keys(frequency)
        .sort((a, b) => frequency[b] - frequency[a])
        .slice(0, 15)
}
