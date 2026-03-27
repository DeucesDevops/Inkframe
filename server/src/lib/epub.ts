import EPub from 'epub-gen-memory'

interface ChapterData {
  title: string
  content: string
  order: number
}

interface BookData {
  title: string
  author: string
  description: string
  chapters: ChapterData[]
}

export async function generateEpub(book: BookData): Promise<Buffer> {
  const options = {
    title: book.title,
    author: book.author || 'Unknown Author',
    publisher: 'Inkframe',
    description: book.description || '',
    content: book.chapters
      .sort((a, b) => a.order - b.order)
      .map(ch => ({
        title: ch.title,
        data: ch.content,
      })),
  }
  return Buffer.from(await EPub(options))
}
