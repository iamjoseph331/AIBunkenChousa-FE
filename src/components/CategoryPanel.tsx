import { useCallback, useEffect, useState } from 'react'
import { api, type CategoriesPayload, type CategoryDef, type CategoryDefStored } from '../api'
import { useT } from '../i18n'
import { categoryClass } from '../categoryColor'

// v0.2 Step 7. Collapsible panel above the Report table showing the run's
// current category set, per-category counts, and the pending-proposals queue.
// Editing the list mints a new set and offers to re-run the cheap classifier.

interface Props {
  runId: number
  /** Called after any mutation that could change the ReportRow.categories join
   * (save/classify/accept), so the parent can refresh the run detail. */
  onChanged?: () => void
}

export default function CategoryPanel({ runId, onChanged }: Props) {
  const t = useT()
  const [data, setData] = useState<CategoriesPayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState(true)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<CategoryDef[]>([])
  const [saving, setSaving] = useState(false)
  const [classifying, setClassifying] = useState(false)
  const [classifyLog, setClassifyLog] = useState<string[]>([])

  const reload = useCallback(async () => {
    try {
      const p = await api.categories(runId)
      setData(p)
      if (p.set) setDraft(p.set.categories.map((c) => ({ name: c.name, definition: c.definition ?? null })))
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e))
    }
  }, [runId])

  useEffect(() => { reload() }, [reload])

  const addRow = () => setDraft((d) => [...d, { name: '', definition: '' }])
  const removeRow = (i: number) => setDraft((d) => d.filter((_, j) => j !== i))
  const setRow = (i: number, patch: Partial<CategoryDef>) =>
    setDraft((d) => d.map((c, j) => (j === i ? { ...c, ...patch } : c)))

  async function save(alsoClassify: boolean) {
    setSaving(true)
    setError(null)
    try {
      const cleaned = draft.filter((c) => (c.name || '').trim())
      await api.saveCategories(runId, cleaned)
      await reload()
      setEditing(false)
      if (alsoClassify) await runClassify()
      onChanged?.()
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e))
    } finally {
      setSaving(false)
    }
  }

  async function runClassify() {
    setClassifying(true)
    setClassifyLog([])
    try {
      await api.classifyCategories(runId)
      // Subscribe to progress SSE for a rolling log.
      const es = new EventSource(api.categoryEventsUrl(runId))
      es.addEventListener('classified', (e) => {
        const d = JSON.parse((e as MessageEvent).data)
        setClassifyLog((l) => [...l.slice(-30), `✓ ${d.paper_key}  (+${d.n_assigned})`])
      })
      es.addEventListener('classify_error', (e) => {
        const d = JSON.parse((e as MessageEvent).data)
        setClassifyLog((l) => [...l.slice(-30), `✗ ${d.paper_key}  — ${d.error}`])
      })
      es.addEventListener('done', () => {
        es.close()
        setClassifying(false)
        reload()
        onChanged?.()
      })
      es.addEventListener('error', (e) => {
        // eslint-disable-next-line no-console
        console.warn('category events error', e)
        es.close()
        setClassifying(false)
      })
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e))
      setClassifying(false)
    }
  }

  async function act(proposalId: number, action: 'accept' | 'reject') {
    try {
      await api.actOnProposal(runId, proposalId, action)
      await reload()
      onChanged?.()
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e))
    }
  }

  const set = data?.set
  const cats: CategoryDefStored[] = set?.categories ?? []
  const counts = data?.counts ?? {}
  const proposals = data?.proposals ?? []

  return (
    <div className="cat-panel">
      <div className="cat-panel-header">
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button
            style={{ background: 'transparent', border: 0, cursor: 'pointer', color: 'var(--ink)', padding: 0 }}
            onClick={() => setExpanded((v) => !v)}
            aria-label={expanded ? 'collapse' : 'expand'}
          >
            {expanded ? '▾' : '▸'}
          </button>
          <h3>{t.categories.title}</h3>
          {proposals.length > 0 && <span className="cat-badge">{proposals.length}</span>}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {set && !editing && (
            <button className="link" onClick={() => setEditing(true)}>{t.categories.save}</button>
          )}
          {set && !classifying && (
            <button onClick={runClassify}>{t.categories.classify}</button>
          )}
        </div>
      </div>

      {error && <div className="app-error">{error}</div>}

      {expanded && (
        <div>
          {!set && !editing && (
            <div>
              <p className="ink-2" style={{ marginTop: 0 }}>{t.categories.empty}</p>
              <p className="ink-3" style={{ fontSize: 'var(--fs-sm)' }}>{t.categories.editHint}</p>
              <button onClick={() => { setDraft([{ name: '', definition: '' }]); setEditing(true) }}>
                {t.categories.addRow}
              </button>
            </div>
          )}

          {editing && (
            <div className="cat-editor">
              <p className="ink-3" style={{ fontSize: 'var(--fs-sm)', margin: '0 0 4px' }}>{t.categories.editHint}</p>
              {draft.map((c, i) => (
                <div className="cat-editor-row" key={i}>
                  <input
                    value={c.name}
                    onChange={(e) => setRow(i, { name: e.target.value })}
                    placeholder={t.categories.namePlaceholder}
                  />
                  <input
                    value={c.definition ?? ''}
                    onChange={(e) => setRow(i, { definition: e.target.value })}
                    placeholder={t.categories.defPlaceholder}
                  />
                  <button className="link" onClick={() => removeRow(i)}>{t.categories.remove}</button>
                </div>
              ))}
              <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                <button onClick={addRow}>{t.categories.addRow}</button>
                <div style={{ flex: 1 }} />
                <button className="link" onClick={() => { setEditing(false); reload() }}>cancel</button>
                <button onClick={() => save(false)} disabled={saving}>{t.categories.save}</button>
                <button className="primary" onClick={() => save(true)} disabled={saving}>{t.categories.saveAndClassify}</button>
              </div>
            </div>
          )}

          {set && !editing && (
            <div className="cat-panel-body">
              <ul className="cat-list">
                {cats.map((c) => {
                  const k = counts[c.id] ?? { n_total: 0, n_primary: 0 }
                  return (
                    <li className="cat-list-item" key={c.id}>
                      <span className="cat-list-name">
                        <span className="cat-dot" style={{ background: `var(--cat-${c.color_slot})` }} />
                        {c.name}
                        {c.origin === 'proposed' && <span className="cat-badge" style={{ marginLeft: 6 }}>proposed</span>}
                      </span>
                      <span className="cat-list-count">{k.n_primary}/{k.n_total}</span>
                    </li>
                  )
                })}
              </ul>

              <div>
                <h4 style={{ margin: '0 0 6px', fontSize: 'var(--fs-md)' }}>{t.categories.proposalsHeader}</h4>
                {proposals.length === 0 ? (
                  <p className="ink-3" style={{ fontSize: 'var(--fs-sm)', margin: 0 }}>—</p>
                ) : (
                  <div className="cat-proposals">
                    {proposals.map((p) => (
                      <div key={p.id} className="cat-proposal">
                        <div>
                          <div className="cat-proposal-name">{p.name}</div>
                          <div className="cat-proposal-why">{p.rationale ?? ''}</div>
                        </div>
                        <div className="cat-proposal-actions">
                          <button onClick={() => act(p.id, 'accept')}>{t.categories.accept}</button>
                          <button className="link" onClick={() => act(p.id, 'reject')}>{t.categories.reject}</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {classifying && (
            <div style={{ marginTop: 8 }}>
              <div className="ink-2" style={{ fontSize: 'var(--fs-sm)' }}>{t.categories.classifying}</div>
              <pre className="run-log" style={{ maxHeight: 120 }}>{classifyLog.join('\n')}</pre>
            </div>
          )}

          {/* Silence unused-import warning; categoryClass is used only in the
              table for per-row chips, but keeping this import path warm reflects
              the shared color source. */}
          <span style={{ display: 'none' }}>{categoryClass(1)}</span>
        </div>
      )}
    </div>
  )
}
