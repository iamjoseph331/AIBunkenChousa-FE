import { useEffect, useRef, useState } from 'react'
import { api, type CategoryDef, type Estimate, type RunRequest, type SubqueryDef } from '../api'
import { useT } from '../i18n'
import { formatDuration } from '../time'
import ProgressBar from './ProgressBar'

const MODELS = ['claude-opus-4-8', 'claude-sonnet-5', 'claude-haiku-4-5']

interface Props {
  onDone: (runId: number) => void
  onClose: () => void
  initialQuery?: string
  initialCategories?: CategoryDef[]
  initialSubqueries?: SubqueryDef[]
}

export default function NewRunForm({ onDone, onClose, initialQuery, initialCategories = [], initialSubqueries = [] }: Props) {
  const t = useT()
  const [req, setReq] = useState<RunRequest>({
    query: initialQuery ?? '', lang: 'auto', model: MODELS[0], mode: 'sync', categories: [],
  })
  const [estimate, setEstimate] = useState<Estimate | null>(null)
  const [busy, setBusy] = useState<'idle' | 'estimating' | 'running'>('idle')
  const [error, setError] = useState<string | null>(null)
  const [log, setLog] = useState<string[]>([])
  const [runId, setRunId] = useState<number | null>(null)
  const [loadingLastRun, setLoadingLastRun] = useState(false)
  const [progress, setProgress] = useState<{ done: number; total: number | null; label: string } | null>(null)
  const [startedAt, setStartedAt] = useState<number | null>(null)
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [lastPaper, setLastPaper] = useState<string | null>(null)
  const [categories, setCategories] = useState<CategoryDef[]>(() =>
    initialCategories.map((category, index) => ({ ...category, color_slot: category.color_slot ?? (index % 10) + 1 })),
  )
  const [subqueries, setSubqueries] = useState<SubqueryDef[]>(() => initialSubqueries.map((subquery) => ({ ...subquery })))
  const esRef = useRef<EventSource | null>(null)

  // Run-analysis language options (independent of the UI language).
  const LANGS: [string, string][] = [
    ['auto', t.newRun.langAuto],
    ['en', 'English'],
    ['ja', '日本語'],
    ['zh', '中文'],
  ]

  useEffect(() => () => esRef.current?.close(), [])

  useEffect(() => {
    if (startedAt == null || busy !== 'running') return
    const update = () => setElapsedSeconds(Math.max(0, Math.floor((Date.now() - startedAt) / 1000)))
    update()
    const timer = window.setInterval(update, 1000)
    return () => window.clearInterval(timer)
  }, [busy, startedAt])

  // Esc closes the modal (except while a run is streaming).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && busy !== 'running') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [busy, onClose])

  const patch = (p: Partial<RunRequest>) => {
    setEstimate(null)
    setReq((r) => ({ ...r, ...p }))
  }
  const payload = (): RunRequest => ({
    ...req,
    query: req.query?.trim() || null,
    categories: categories.filter((c) => (c.name || '').trim()),
    subqueries: subqueries.filter((sq) => (sq.label || '').trim() && (sq.question || '').trim()),
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

  async function useLastRunParameters() {
    setLoadingLastRun(true)
    setError(null)
    try {
      const [lastRun] = await api.runs()
      if (!lastRun) throw new Error(t.newRun.noPreviousRun)
      const [categoryData, subqueryData] = await Promise.all([
        api.categories(lastRun.id),
        api.subqueries(lastRun.id),
      ])
      setReq((current) => ({
        ...current,
        query: lastRun.query ?? '',
        lang: lastRun.lang,
        model: lastRun.model,
        mode: lastRun.mode === 'batch' ? 'batch' : 'sync',
      }))
      setCategories((categoryData.set?.categories ?? []).map((category) => ({
        name: category.name,
        definition: category.definition,
        color_slot: category.color_slot,
      })))
      setSubqueries((subqueryData.set?.subqueries ?? []).map((subquery) => ({
        id: subquery.id,
        label: subquery.label,
        question: subquery.question ?? '',
      })))
      setEstimate(null)
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e))
    } finally {
      setLoadingLastRun(false)
    }
  }

  async function start() {
    setBusy('running')
    setError(null)
    setLog([])
    setProgress(null)
    setLastPaper(null)
    setElapsedSeconds(0)
    setStartedAt(Date.now())
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
        setLastPaper(d.paper)
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
        setStartedAt(null)
        onDone(run_id)
      })
      on('error', (d) => {
        add(`● error — ${d.error}`)
        es.close()
        setBusy('idle')
        setProgress(null)
        setStartedAt(null)
        setError(d.error)
      })
      es.onerror = () => {
        add('● stream closed')
        es.close()
        setBusy('idle')
        setProgress(null)
        setStartedAt(null)
      }
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e))
      setBusy('idle')
      setStartedAt(null)
    }
  }

  // Once a run is underway, keep its monitor available without holding the
  // setup dialog over the rest of the app. The fixed panel remains mounted so
  // its EventSource and progress state continue uninterrupted.
  if (busy === 'running' && progress) {
    return (
      <aside className="run-monitor" aria-label={t.newRun.progressTitle} aria-live="polite" tabIndex={0}>
        <div className="run-monitor-tab">▸ <span>{t.newRun.progressTitle}</span></div>
        <div className="run-monitor-content">
          <div className="run-progress run-monitor-progress">
            <div className="run-progress-head">
              <div>
                <strong>{t.newRun.progressTitle}</strong>
                <span>{req.mode === 'batch' && progress.label === t.newRun.batchWaiting ? t.newRun.batchProgressHelp : t.newRun.progressHelp}</span>
              </div>
              <time>{t.newRun.elapsed.replace('{time}', formatDuration(elapsedSeconds))}</time>
            </div>
            <ProgressBar value={progress.done} total={progress.total} label={progress.label} />
            {lastPaper && <div className="run-progress-current">{t.newRun.currentPaper}: <strong>{lastPaper}</strong></div>}
          </div>
          {log.length > 0 && <pre className="run-log run-monitor-log">{log.join('\n')}</pre>}
        </div>
      </aside>
    )
  }

  return (
    <div className="modal-backdrop" onClick={busy === 'running' ? undefined : onClose}>
      <div className="modal newrun" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>{t.newRun.title}</h2>
          <button className="link newrun-last-params" onClick={useLastRunParameters} disabled={busy !== 'idle' || loadingLastRun}>
            {loadingLastRun ? t.newRun.loadingLastRun : t.newRun.useLastRun}
          </button>
          <button className="modal-close" onClick={onClose} disabled={busy === 'running'}>✕</button>
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

        <section className="newrun-taxonomy">
          <div className="newrun-editor">
            <div className="newrun-editor-head">
              <div><h3>{t.categories.title}</h3><p>{t.categories.editHint}</p></div>
              <button type="button" onClick={() => setCategories((items) => [
                ...items,
                { name: '', definition: '', color_slot: (items.length % 10) + 1 },
              ])} disabled={busy === 'running'}>{t.categories.addRow}</button>
            </div>
            <div className="newrun-editor-rows">
              {categories.map((category, index) => (
                <div className="newrun-category-row" key={index}>
                  <button
                    type="button"
                    className="category-slot-picker"
                    style={{ background: `var(--cat-${category.color_slot ?? (index % 10) + 1})` }}
                    aria-label={`${t.settings.categoryColor} ${index + 1}`}
                    title={t.settings.categoryColor}
                    onClick={() => {
                      setCategories((items) => items.map((item, itemIndex) => itemIndex === index
                        ? { ...item, color_slot: ((item.color_slot ?? index + 1) % 10) + 1 }
                        : item))
                    }}
                    disabled={busy === 'running'}
                  />
                  <input value={category.name} onChange={(event) => setCategories((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, name: event.target.value } : item))} placeholder={t.categories.namePlaceholder} disabled={busy === 'running'} />
                  <input value={category.definition ?? ''} onChange={(event) => setCategories((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, definition: event.target.value } : item))} placeholder={t.categories.defPlaceholder} disabled={busy === 'running'} />
                  <button type="button" className="sq-remove" aria-label={t.categories.remove} onClick={() => setCategories((items) => items.filter((_, itemIndex) => itemIndex !== index))} disabled={busy === 'running'}>✕</button>
                </div>
              ))}
            </div>
          </div>

          <div className="newrun-editor">
            <div className="newrun-editor-head">
              <div><h3>{t.subqueries.title}</h3><p>{t.subqueries.editHint}</p></div>
              <button type="button" onClick={() => setSubqueries((items) => [...items, { id: null, label: '', question: '' }])} disabled={busy === 'running'}>+ {t.subqueries.addRow}</button>
            </div>
            <div className="newrun-editor-rows">
              {subqueries.map((subquery, index) => (
                <div className="newrun-subquery-row" key={index}>
                  <input value={subquery.label} onChange={(event) => setSubqueries((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, label: event.target.value } : item))} placeholder={t.subqueries.labelPlaceholder} disabled={busy === 'running'} />
                  <input value={subquery.question} onChange={(event) => setSubqueries((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, question: event.target.value } : item))} placeholder={t.subqueries.questionPlaceholder} disabled={busy === 'running'} />
                  <button type="button" className="sq-remove" aria-label="Remove" onClick={() => setSubqueries((items) => items.filter((_, itemIndex) => itemIndex !== index))} disabled={busy === 'running'}>✕</button>
                </div>
              ))}
            </div>
          </div>
        </section>

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

        {estimate && (
          <section className="estimate" aria-label={t.newRun.estimate}>
            <div className="estimate-heading">
              <strong>{t.newRun.estimateReady}</strong>
              <span>{estimate.model}</span>
            </div>
            <div className="estimate-grid">
              <div className="estimate-item">
                <span>{t.newRun.estimateScope}</span>
                <strong>{estimate.n_papers} {t.newRun.papers}</strong>
                <small>~{estimate.input_tokens.toLocaleString()} {t.newRun.tokensIn} · ~{estimate.output_tokens_est.toLocaleString()} {t.newRun.tokensOut}</small>
              </div>
              <div className="estimate-item estimate-cost">
                <span>{t.newRun.estimateCost}</span>
                {req.mode === 'batch' ? (
                  <>
                    <strong>~${(estimate.usd_est / 2).toFixed(2)}</strong>
                    <small>{t.newRun.batchCost.replace('{amount}', `$${estimate.usd_est.toFixed(2)}`)}</small>
                  </>
                ) : <><strong>~${estimate.usd_est.toFixed(2)}</strong><small>{t.newRun.syncCost}</small></>}
              </div>
              <div className="estimate-item">
                <span>{t.newRun.estimateTiming}</span>
                {req.mode === 'batch' ? (
                  <><strong>{t.newRun.batchTiming}</strong><small>{t.newRun.batchTimingDetail}</small></>
                ) : estimate.duration_est_seconds == null ? (
                  <><strong>{formatDuration(null)}</strong><small>{t.newRun.noTimeHistory}</small></>
                ) : <><strong>~{formatDuration(estimate.duration_est_seconds)}</strong><small>{t.newRun.syncTiming}</small></>}
              </div>
            </div>
          </section>
        )}

        {error && <div className="form-error">{error}</div>}

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
