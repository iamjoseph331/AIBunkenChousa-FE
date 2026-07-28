import { useEffect, useRef, useState } from 'react'
import { api, type CategoryDef, type Estimate, type RunRequest } from '../api'
import { useT } from '../i18n'
import { formatDuration } from '../time'
import ProgressBar from './ProgressBar'

const MODELS = ['claude-opus-4-8', 'claude-sonnet-5', 'claude-haiku-4-5']

interface Props {
  onDone: (runId: number) => void
  onClose: () => void
  initialQuery?: string
}

export default function NewRunForm({ onDone, onClose, initialQuery }: Props) {
  const t = useT()
  const [req, setReq] = useState<RunRequest>({
    query: initialQuery ?? '', lang: 'auto', model: MODELS[0], mode: 'sync', categories: [],
  })
  // Local draft of categories — kept out of `req.categories` until the user has
  // typed something so the empty-list placeholder is real, not just for show.
  const [cats, setCats] = useState<CategoryDef[]>([])
  const [estimate, setEstimate] = useState<Estimate | null>(null)
  const [busy, setBusy] = useState<'idle' | 'estimating' | 'running'>('idle')
  const [error, setError] = useState<string | null>(null)
  const [log, setLog] = useState<string[]>([])
  const [runId, setRunId] = useState<number | null>(null)
  const [progress, setProgress] = useState<{ done: number; total: number | null; label: string } | null>(null)
  const esRef = useRef<EventSource | null>(null)

  // Run-analysis language options (independent of the UI language).
  const LANGS: [string, string][] = [
    ['auto', t.newRun.langAuto],
    ['en', 'English'],
    ['ja', '日本語'],
    ['zh', '中文'],
  ]

  useEffect(() => () => esRef.current?.close(), [])

  // Esc closes the modal (except while a run is streaming).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && busy !== 'running') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [busy, onClose])

  const patch = (p: Partial<RunRequest>) => setReq((r) => ({ ...r, ...p }))
  const payload = (): RunRequest => ({
    ...req,
    query: req.query?.trim() || null,
    categories: cats.filter((c) => (c.name || '').trim()),
  })

  async function doEstimate() {
    setBusy('estimating')
    setError(null)
    try {
      setEstimate(await api.estimate(payload()))
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e))
    } finally {
      setBusy('idle')
    }
  }

  async function start() {
    setBusy('running')
    setError(null)
    setLog([])
    setProgress(null)
    try {
      const { run_id, n_papers } = await api.startRun(payload())
      setRunId(run_id)
      setProgress({ done: 0, total: n_papers ?? null, label: t.newRun.analyzing })
      const es = new EventSource(api.eventsUrl(run_id))
      esRef.current = es
      const add = (line: string) => setLog((l) => [...l, line])
      const step = () => setProgress((p) => (p ? { ...p, done: p.done + 1 } : p))
      const on = (name: string, fn: (d: any) => void) =>
        es.addEventListener(name, (e) => fn(JSON.parse((e as MessageEvent).data)))

      on('hello', () => add(`▶ run #${run_id} started`))
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
        add(`● done — $${(d.total_usd ?? 0).toFixed(3)} · ${formatDuration(d.elapsed_seconds)}`)
        es.close()
        setBusy('idle')
        setProgress(null)
        onDone(run_id)
      })
      on('error', (d) => {
        add(`● error — ${d.error}`)
        es.close()
        setBusy('idle')
        setProgress(null)
        setError(d.error)
      })
      es.onerror = () => {
        add('● stream closed')
        es.close()
        setBusy('idle')
        setProgress(null)
      }
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e))
      setBusy('idle')
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal newrun" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>{t.newRun.title}</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <label className="field">
          <span>{t.newRun.query} <em>{t.newRun.queryOptional}</em></span>
          <input
            value={req.query ?? ''}
            onChange={(e) => patch({ query: e.target.value })}
            placeholder={t.newRun.queryPlaceholder}
            disabled={busy === 'running'}
          />
        </label>

        <div className="field-row">
          <label className="field">
            <span>{t.newRun.language}</span>
            <select value={req.lang} onChange={(e) => patch({ lang: e.target.value })} disabled={busy === 'running'}>
              {LANGS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
          <label className="field">
            <span>{t.newRun.model}</span>
            <select value={req.model} onChange={(e) => patch({ model: e.target.value })} disabled={busy === 'running'}>
              {MODELS.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </label>
          <label className="field">
            <span>{t.newRun.mode}</span>
            <select
              value={req.mode}
              onChange={(e) => patch({ mode: e.target.value as 'sync' | 'batch' })}
              disabled={busy === 'running'}
            >
              <option value="sync">{t.newRun.modeSync}</option>
              <option value="batch">{t.newRun.modeBatch}</option>
            </select>
          </label>
          <label className="field field-limit">
            <span>{t.newRun.limit}</span>
            <input
              type="number"
              min={1}
              value={req.limit ?? ''}
              onChange={(e) => patch({ limit: e.target.value ? Number(e.target.value) : null })}
              placeholder={t.newRun.all}
              disabled={busy === 'running'}
            />
          </label>
        </div>

        <div className="field">
          <span>{t.categories.title} <em>{t.newRun.queryOptional}</em></span>
          <div className="cat-editor">
            {cats.map((c, i) => (
              <div className="cat-editor-row" key={i}>
                <input
                  value={c.name}
                  onChange={(e) => setCats((cs) => cs.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
                  placeholder={t.categories.namePlaceholder}
                  disabled={busy === 'running'}
                />
                <input
                  value={c.definition ?? ''}
                  onChange={(e) => setCats((cs) => cs.map((x, j) => (j === i ? { ...x, definition: e.target.value } : x)))}
                  placeholder={t.categories.defPlaceholder}
                  disabled={busy === 'running'}
                />
                <button
                  type="button"
                  className="link"
                  onClick={() => setCats((cs) => cs.filter((_, j) => j !== i))}
                  disabled={busy === 'running'}
                >
                  {t.categories.remove}
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => setCats((cs) => [...cs, { name: '', definition: '' }])}
              disabled={busy === 'running'}
              style={{ alignSelf: 'flex-start' }}
            >
              {t.categories.addRow}
            </button>
          </div>
        </div>

        {estimate && (
          <div className="estimate">
            <b>{estimate.n_papers}</b> {t.newRun.papers} · ~{estimate.input_tokens.toLocaleString()} {t.newRun.tokensIn} +{' '}
            {estimate.output_tokens_est.toLocaleString()} {t.newRun.tokensOut} ·{' '}
            <b>~${estimate.usd_est.toFixed(2)}</b>
            {req.mode === 'batch' && <> → <b>~${(estimate.usd_est / 2).toFixed(2)}</b> {t.newRun.batched}</>}
            {' · '}
            {estimate.duration_est_seconds == null
              ? <><b>{formatDuration(null)}</b> {t.newRun.time} ({t.newRun.noTimeHistory})</>
              : <><b>~{formatDuration(estimate.duration_est_seconds)}</b> {t.newRun.time}</>}
          </div>
        )}

        {error && <div className="form-error">{error}</div>}

        {progress && <ProgressBar value={progress.done} total={progress.total} label={progress.label} />}

        {log.length > 0 && (
          <pre className="run-log">
            {log.join('\n')}
          </pre>
        )}

        <div className="modal-actions">
          <button onClick={doEstimate} disabled={busy !== 'idle'}>
            {busy === 'estimating' ? t.newRun.estimating : t.newRun.estimate}
          </button>
          <button className="primary" onClick={start} disabled={busy !== 'idle'}>
            {busy === 'running' ? t.newRun.running : t.newRun.start}
          </button>
          {runId && busy !== 'running' && (
            <button className="link" onClick={() => onDone(runId)}>{t.newRun.viewRun} #{runId} →</button>
          )}
        </div>
      </div>
    </div>
  )
}
