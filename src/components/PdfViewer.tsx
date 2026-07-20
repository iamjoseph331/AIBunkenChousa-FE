import { useEffect, useRef, useState } from 'react'
import * as pdfjsLib from 'pdfjs-dist'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { useT } from '../i18n'

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl

interface Props {
  pdfUrl: string
  page: number
  quote?: string
  onPageChange?: (page: number) => void
}

/** Strip everything but letters/digits, lowercase. Makes quote-matching robust to
 *  the whitespace, hyphenation and column-order differences between pdf.js's text
 *  extraction and the PyMuPDF text the model quoted from. */
function alnum(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '')
}

export default function PdfViewer({ pdfUrl, page, quote, onPageChange }: Props) {
  const t = useT()
  const docRef = useRef<PDFDocumentProxy | null>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const textLayerRef = useRef<HTMLDivElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const [numPages, setNumPages] = useState(0)
  const [scale, setScale] = useState(1.4)
  const [error, setError] = useState<string | null>(null)
  const renderSeq = useRef(0)

  // Load (or reload) the document when the URL changes.
  useEffect(() => {
    let cancelled = false
    setError(null)
    const task = pdfjsLib.getDocument({ url: pdfUrl })
    task.promise.then(
      (doc) => {
        if (cancelled) return
        docRef.current = doc
        setNumPages(doc.numPages)
      },
      (err) => !cancelled && setError(String(err)),
    )
    return () => {
      cancelled = true
      task.destroy()
      docRef.current = null
    }
  }, [pdfUrl])

  // Render the requested page + text layer, then highlight the quote.
  useEffect(() => {
    const doc = docRef.current
    if (!doc || page < 1 || page > numPages) return
    const seq = ++renderSeq.current
    let cancelled = false

    ;(async () => {
      const pdfPage = await doc.getPage(page)
      if (cancelled || seq !== renderSeq.current) return
      const viewport = pdfPage.getViewport({ scale })
      const canvas = canvasRef.current!
      const dpr = window.devicePixelRatio || 1
      const ctx = canvas.getContext('2d')!
      canvas.width = Math.floor(viewport.width * dpr)
      canvas.height = Math.floor(viewport.height * dpr)
      canvas.style.width = `${viewport.width}px`
      canvas.style.height = `${viewport.height}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

      await pdfPage.render({ canvasContext: ctx, viewport, canvas }).promise
      if (cancelled || seq !== renderSeq.current) return

      // Text layer for selection + highlighting.
      const layer = textLayerRef.current!
      layer.replaceChildren()
      layer.style.width = `${viewport.width}px`
      layer.style.height = `${viewport.height}px`
      // pdf.js v6 sizes every span via font-size: calc(--total-scale-factor * --font-height).
      // Without this variable the spans fall back to the default font size and drift.
      layer.style.setProperty('--total-scale-factor', String(scale))

      const textContent = await pdfPage.getTextContent()
      if (cancelled || seq !== renderSeq.current) return
      const textLayer = new pdfjsLib.TextLayer({
        textContentSource: textContent,
        container: layer,
        viewport,
      })
      await textLayer.render()
      if (cancelled || seq !== renderSeq.current) return

      highlight(layer, quote)
    })().catch((err) => !cancelled && setError(String(err)))

    return () => {
      cancelled = true
    }
  }, [page, numPages, scale, quote])

  function highlight(layer: HTMLDivElement, q?: string) {
    const spans = Array.from(layer.querySelectorAll('span')) as HTMLSpanElement[]
    spans.forEach((s) => s.classList.remove('pdf-hl'))
    if (!q) return
    const needle = alnum(q)
    if (!needle) return

    // Concatenate normalized span text, remembering which span each char came from.
    let hay = ''
    const owner: number[] = []
    spans.forEach((span, i) => {
      for (const ch of span.textContent ?? '') {
        if (/[a-z0-9]/i.test(ch)) {
          hay += ch.toLowerCase()
          owner.push(i)
        }
      }
    })
    const at = hay.indexOf(needle)
    if (at < 0) return
    const touched = new Set(owner.slice(at, at + needle.length))
    let first: HTMLSpanElement | null = null
    touched.forEach((i) => {
      spans[i].classList.add('pdf-hl')
      if (!first) first = spans[i]
    })
    ;(first as HTMLSpanElement | null)?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }

  const go = (p: number) => {
    const next = Math.min(Math.max(1, p), numPages || 1)
    onPageChange?.(next)
  }

  return (
    <div className="pdf-viewer">
      <div className="pdf-toolbar">
        <button onClick={() => go(page - 1)} disabled={page <= 1}>{t.pdf.prev}</button>
        <span className="pdf-pageno">
          {t.pdf.page} {page}{numPages ? ` / ${numPages}` : ''}
        </span>
        <button onClick={() => go(page + 1)} disabled={numPages > 0 && page >= numPages}>{t.pdf.next}</button>
        <span className="pdf-spacer" />
        <button onClick={() => setScale((s) => Math.max(0.6, +(s - 0.2).toFixed(2)))}>−</button>
        <span className="pdf-zoom">{Math.round(scale * 100)}%</span>
        <button onClick={() => setScale((s) => Math.min(3, +(s + 0.2).toFixed(2)))}>+</button>
      </div>
      {error && <div className="pdf-error">{t.pdf.failed} {error}</div>}
      <div className="pdf-scroll" ref={wrapRef}>
        <div className="pdf-page">
          <canvas ref={canvasRef} />
          <div className="textLayer" ref={textLayerRef} />
        </div>
      </div>
    </div>
  )
}
