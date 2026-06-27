interface PdfTextItem {
  str: string
}

/** Join pdfjs text items into a single string (spaces within and across pages). */
export function joinPdfItems(pages: PdfTextItem[][]): string {
  return pages.map(items => items.map(i => i.str).join(' ')).join(' ')
}

/** Extract all text from a PDF (pure-JS pdfjs; no native deps, no worker). */
export async function extractPdfText(data: Uint8Array): Promise<string> {
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const doc = await getDocument({ data, useSystemFonts: true }).promise
  const pages: PdfTextItem[][] = []
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p)
    const tc = await page.getTextContent()
    const items = tc.items as Array<{ str?: string }>
    pages.push(
      items
        .filter(i => typeof i.str === 'string')
        .map(i => ({ str: i.str as string }))
    )
  }
  await doc.cleanup()
  return joinPdfItems(pages)
}
