import puppeteer from 'puppeteer'

interface ChapterData {
  title: string
  content: string
  order: number
}

interface BookData {
  title: string
  author: string
  chapters: ChapterData[]
}

function buildHtmlTemplate(book: BookData, type: 'digital' | 'print'): string {
  const fontSz = type === 'print' ? '12pt' : '11pt'
  const chapters = book.chapters
    .sort((a, b) => a.order - b.order)
    .map(ch => `<h2 class="chapter-title">${ch.title}</h2><div class="chapter-body">${ch.content}</div>`)
    .join('<div class="page-break"></div>')

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  body { font-family: Georgia, serif; font-size: ${fontSz}; line-height: 1.7; color: #111; }
  h1.book-title { text-align: center; font-size: 2em; margin-bottom: 0.25em; }
  h2.chapter-title { font-size: 1.4em; margin-top: 2em; margin-bottom: 1em; }
  .chapter-body { text-indent: 1.5em; }
  .page-break { page-break-after: always; }
</style>
</head>
<body>
  <h1 class="book-title">${book.title}</h1>
  <p style="text-align:center;color:#555">by ${book.author}</p>
  <div class="page-break"></div>
  ${chapters}
</body>
</html>`
}

export async function generatePdf(book: BookData, type: 'digital' | 'print'): Promise<Buffer> {
  const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] })
  const page = await browser.newPage()
  await page.setContent(buildHtmlTemplate(book, type), { waitUntil: 'networkidle0' })

  const pdfBuffer = await page.pdf({
    format: type === 'print' ? undefined : 'A4',
    width:  type === 'print' ? '6in' : undefined,
    height: type === 'print' ? '9in' : undefined,
    margin: type === 'print'
      ? { top: '1in', bottom: '1in', left: '0.875in', right: '0.625in' }
      : { top: '1in', bottom: '1in', left: '1in', right: '1in' },
    printBackground: true,
  })

  await browser.close()
  return Buffer.from(pdfBuffer)
}
