import { useEffect, useRef, useState } from 'react'
import { api } from '../api'
import { useT } from '../i18n'
import { formatDuration } from '../time'
import ProgressBar from './ProgressBar'

interface UploadStatus {
  filename: string
  state: 'ok' | 'skip' | 'error'
  detail?: string
}

interface Props {
  runId: number
  onClose: () => void
  /** Called once the append finishes so the report can reload. */
  onDone: () => void
}

/** Append newly-dropped PDFs to an existing report. Uploads them into the corpus
 * folder, then POSTs /runs/{id}/add-papers, which analyses only the new papers with
 * the run's stored query/model/lang and links them in — the existing papers are
 * never re-run. Streams the same run-events SSE as a fresh run. */
export default function AddPapersForm({ runId, onClose, onDone }: Props) {
  const t = useT()
  const [dragActive, setDragActive] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploads, setUploads] = useState<UploadStatus[]>([])
  const [busy, setBusy] = useState(false)
  const [log, setLog] = useState<string[]>([])
  const [progress, setProgress] = useState<{ done: number; total: number | null; label: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement | null>(null)
  const esRef = useRef<EventSource | null>(null)

  useEffect(() => () => esRef.current?.close(), [])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !busy) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [busy, onClose])

  async function uploadFiles(files: File[]) {
    const pdfs = files.filter((f) => f.name.toLowerCase().endsWith('.pdf'))
    if (!pdfs.length) return
    setUploading(true)
    const results: UploadStatus[] = []
    for (const f of pdfs) {
      try {
        const r = await api.uploadPdf(f)
        results.push({ filename: r.filename, state: r.saved ? 'ok' : 'skip', detail: r.reason })
      } catch (e) {
        results.push({ filename: f.name, state: 'error', detail: String(e instanceof Error ? e.message : e) })
      }
    }
    setUploads((prev) => [...results, ...prev])
    setUploading(false)
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragActive(false)
    uploadFiles(Array.from(e.dataTransfer.files))
  }

  function addToReport() {
    setBusy(true)
    setError(null)
    setLog([])
    setProgress({ done: 0, total: null, label: t.addPapers.analyzing })
    const es = new EventSource(api.eventsUrl(runId))
    esRef.current = es
    const add = (line: string) => setLog((l) => [...l, line])
    const step = () => setProgress((p) => (p ? { ...p, done: p.done + 1 } : p))
    const on = (name: string, fn: (d: any) => void) =>
      es.addEventListener(name, (e) => fn(JSON.parse((e as MessageEvent).data)))

    on('hello', () => add(`▶ adding papers to run #${runId}`))
    on('analyzed', (d) => {
      add(`✓ ${d.paper}${d.reused ? ' (reused)' : ''}${d.trust != null ? ` — trust ${(d.trust * 100).toFixed(0)}%` : ''}`)
      step()
    })
    on('extract_error', (d) => { add(`✗ extract ${d.paper}: ${d.error}`); step() })
    on('analyze_error', (d) => { add(`✗ analyze ${d.paper}: ${d.error}`); step() })
    on('batch_submitted', (d) => {
      add(`⧗ batch ${d.batch_id} submitted (${d.n} papers)`)
      setProgress((p) => (p ? { ...p, label: t.newRun.batchWaiting } : p))
    })
    on('done', (d) => {
      add(`● done — ${d.n_added} added · $${(d.total_usd ?? 0).toFixed(3)} · ${formatDuration(d.elapsed_seconds)}`)
      es.close()
      setBusy(false)
      setProgress(null)
      onDone()
    })
    on('error', (d) => {
      add(`● error — ${d.error}`)
      es.close()
      setBusy(false)
      setProgress(null)
      setError(d.error)
    })
    es.onerror = () => { es.close(); setBusy(false); setProgress(null) }

    api.addPapers(runId).catch((e) => {
      es.close()
      setBusy(false)
      setProgress(null)
      setError(String(e instanceof Error ? e.message : e))
    })
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal newrun" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>{t.addPapers.title}</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <p className="home-help">{t.addPapers.lede}</p>

        <div
          className={`dropzone${dragActive ? ' drag-active' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setDragActive(true) }}
          onDragLeave={() => setDragActive(false)}
          onDrop={onDrop}
          onClick={() => fileRef.current?.click()}
          role="button"
          tabIndex={0}
        >
          <input
            ref={fileRef}
            type="file"
            accept="application/pdf"
            multiple
            hidden
            onChange={(e) => { uploadFiles(Array.from(e.target.files ?? [])); e.target.value = '' }}
          />
          <div className="dropzone-icon">⤓</div>
          <div className="dropzone-label">
            {uploading ? t.addPapers.uploading : dragActive ? t.addPapers.dropActive : t.addPapers.drop}
          </div>
        </div>

        {uploads.length > 0 && (
          <ul className="upload-list">
            {uploads.map((u, i) => (
              <li key={i} className={`upload-item upload-${u.state}`}>
                <span className="upload-mark">{u.state === 'ok' ? '✓' : u.state === 'skip' ? '•' : '✗'}</span>
                <span className="upload-name">{u.filename}</span>
                {u.detail && <span className="upload-detail">{u.detail}</span>}
              </li>
            ))}
          </ul>
        )}

        <p className="home-help">{t.addPapers.hint}</p>

        {error && <div className="form-error">{error}</div>}
        {progress && <ProgressBar value={progress.done} total={progress.total} label={progress.label} />}
        {log.length > 0 && <pre className="run-log">{log.join('\n')}</pre>}

        <div className="modal-actions">
          <button onClick={onClose} disabled={busy}>{t.addPapers.close}</button>
          <button className="primary" onClick={addToReport} disabled={busy || uploading}>
            {busy ? t.addPapers.adding : t.addPapers.add}
          </button>
        </div>
      </div>
    </div>
  )
}
