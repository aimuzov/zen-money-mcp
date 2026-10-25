/**
 * Минимальный PDF с текстом в Юникоде, собранный в памяти: тестам импорта не
 * нужен бинарный фикстур. Шрифт Type0 без встроенных глифов, текст достаётся
 * через ToUnicode, поэтому кириллица и знак рубля переживают извлечение.
 * Каждая страница -- массив строк, каждая строка уходит отдельным Tj.
 */
export function makePdf(pages: string[][]): Uint8Array {
	const hex = (s: string) =>
		[...s]
			.map((ch) => {
				const code = ch.codePointAt(0)!

				if (code > 0xffff) throw new Error(`makePdf: только BMP, а не ${ch}`)

				return code.toString(16).padStart(4, '0')
			})
			.join('')

	const ranges = Array.from({ length: 256 }, (_, hi) => {
		const h = hi.toString(16).padStart(2, '0')

		return `<${h}00> <${h}ff> <${h}00>`
	})
	const cmap = [
		'/CIDInit /ProcSet findresource begin',
		'12 dict begin',
		'begincmap',
		'/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def',
		'/CMapName /Adobe-Identity-UCS def',
		'/CMapType 2 def',
		'1 begincodespacerange <0000> <ffff> endcodespacerange',
		// в одном блоке bfrange не больше 100 записей
		...Array.from({ length: Math.ceil(ranges.length / 100) }, (_, i) => {
			const chunk = ranges.slice(i * 100, (i + 1) * 100)

			return `${chunk.length} beginbfrange\n${chunk.join('\n')}\nendbfrange`
		}),
		'endcmap',
		'CMapName currentdict /CMap defineresource pop',
		'end',
		'end',
	].join('\n')

	const pageCount = pages.length
	// 1 каталог, 2 дерево страниц, 3 шрифт, 4 CID-шрифт, 5 дескриптор, 6 ToUnicode,
	// дальше по паре объектов (страница, содержимое) на страницу.
	const pageId = (i: number) => 7 + i * 2
	const objects: string[] = [
		'<< /Type /Catalog /Pages 2 0 R >>',
		`<< /Type /Pages /Count ${pageCount} /Kids [${pages.map((_, i) => `${pageId(i)} 0 R`).join(' ')}] >>`,
		'<< /Type /Font /Subtype /Type0 /BaseFont /TestSans /Encoding /Identity-H /DescendantFonts [4 0 R] /ToUnicode 6 0 R >>',
		'<< /Type /Font /Subtype /CIDFontType2 /BaseFont /TestSans /CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> /FontDescriptor 5 0 R /DW 500 >>',
		'<< /Type /FontDescriptor /FontName /TestSans /Flags 32 /FontBBox [0 0 1000 1000] /ItalicAngle 0 /Ascent 1000 /Descent 0 /CapHeight 1000 /StemV 80 >>',
		stream(cmap),
	]

	for (const lines of pages) {
		const ops = lines.map((line, i) => `${i === 0 ? '20 800 Td' : '0 -14 Td'} <${hex(line)}> Tj`)
		const content = ['BT', '/F1 10 Tf', ...ops, 'ET'].join('\n')

		objects.push(
			`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${objects.length + 2} 0 R >>`,
			stream(content),
		)
	}

	let out = '%PDF-1.4\n'
	const offsets: number[] = []

	for (const [i, body] of objects.entries()) {
		offsets.push(Buffer.byteLength(out, 'latin1'))
		out += `${i + 1} 0 obj\n${body}\nendobj\n`
	}

	const xref = Buffer.byteLength(out, 'latin1')

	out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
	out += offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')
	out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`

	return new Uint8Array(Buffer.from(out, 'latin1'))
}

function stream(body: string): string {
	return `<< /Length ${Buffer.byteLength(body, 'latin1')} >>\nstream\n${body}\nendstream`
}
