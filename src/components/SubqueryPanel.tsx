import { useCallback, useEffect, useMemo, useState } from 'react'
import { api, type SubqueryDef, type SubqueriesPayload } from '../api'
import { useT } from '../i18n'

// v0.3 — the SLR-flavoured twin of CategoryPanel, minus the classify button
// and the proposals queue. Subquery answers are produced ONLY by the Opus
// analysis pass; there is no cheap follow-up to trigger from here. Saving a
// new list mints a new subquery_set on the server (prior answers preserved
// for audit but no longer displayed as "current").

interface Props {
  runId: number | null
  onChanged?: () => void
}

// Two-column editable row for one subquery. Editing the label auto-updates the
// slug preview when the id field is left empty (server slugs from label).
function slugPreview(id: string | null | undefined, label: string): string {
  if (id && id.trim()) return id.trim().toLowerCase()
  return (label || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || '—'
}

export default function SubqueryPanel({ runId, onChanged }: Props) {
  const t = useT()
  const [payload, setPayload] = useState<SubqueriesPayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState(false)
  const [draft, setDraft] = useState<SubqueryDef[]>([])
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    if (runId == null) return
    try {
      const p = await api.subqueries(runId)
      setPayload(p)
      // Seed the draft from the current set so opening the panel shows what's
      // saved (not a blank editor).
      setDraft((p.set?.subqueries ?? []).map((sq) => ({
        id: sq.id, label: sq.label, question: sq.question ?? '',
      })))
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e))
    }
  }, [runId])

  useEffect(() => { load() }, [load])

  const save = async () => {
    if (runId == null) return
    // Only send rows with a non-empty label — empties would be dropped by the
    // backend anyway, but we keep the local editor free of ghosts.
    const filled = draft.filter((sq) => sq.label.trim() !== '')
    setSaving(true); setError(null)
    try {
      await api.saveSubqueries(runId, filled)
      await load()
      onChanged?.()
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e))
    } finally {
      setSaving(false)
    }
  }

  const totalPapers = useMemo(() => {
    // n_papers = sum of any single subquery's four buckets (they all cover the
    // same paper set). Fall back to 0 when nothing is stored yet.
    if (!payload?.counts) return 0
    const c = Object.values(payload.counts)[0]
    if (!c) return 0
    return c.n_yes + c.n_no + c.n_mixed + c.n_not_addressed
  }, [payload])

  if (runId == null) return null

  const setRow = (i: number, patch: Partial<SubqueryDef>) => {
    setDraft((d) => d.map((row, idx) => idx === i ? { ...row, ...patch } : row))
  }

  return (
    <div className="sq-panel">
      <button className="sq-header" onClick={() => setExpanded((v) => !v)}>
        <span>{t.subqueries.title}</span>
        <span className="ink-3">
          {payload?.set ? `${payload.set.subqueries.length} · ${totalPapers}p` : t.subqueries.empty}
        </span>
        <span className="ink-3">{expanded ? '▾' : '▸'}</span>
      </button>

      {expanded && (
        <div className="sq-body">
          <p className="sq-hint">{t.subqueries.editHint}</p>
          {error && <div className="app-error">{error}</div>}
          <div className="sq-rows">
            <div className="sq-row sq-row-head">
              <span>{t.subqueries.labelLabel}</span>
              <span>{t.subqueries.questionLabel}</span>
              <span>{t.subqueries.idLabel}</span>
              <span />
            </div>
            {draft.map((sq, i) => (
              <div key={i} className="sq-row">
                <input
                  type="text"
                  placeholder={t.subqueries.labelPlaceholder}
                  value={sq.label}
                  onChange={(e) => setRow(i, { label: e.target.value })}
                />
                <input
                  type="text"
                  placeholder={t.subqueries.questionPlaceholder}
                  value={sq.question}
                  onChange={(e) => setRow(i, { question: e.target.value })}
                />
                <input
                  type="text"
                  className="sq-id"
                  placeholder={slugPreview(sq.id, sq.label)}
                  value={sq.id ?? ''}
                  onChange={(e) => setRow(i, { id: e.target.value || null })}
                />
                <button
                  className="sq-remove"
                  aria-label="Remove"
                  onClick={() => setDraft((d) => d.filter((_, idx) => idx !== i))}
                >✕</button>
              </div>
            ))}
            <button
              className="sq-add"
              onClick={() => setDraft((d) => [...d, { id: null, label: '', question: '' }])}
            >+ {t.subqueries.addRow}</button>
          </div>
          <div className="sq-actions">
            <button className="primary" disabled={saving} onClick={save}>
              {saving ? '…' : t.subqueries.save}
            </button>
            <span className="ink-3">{t.subqueries.saveHint}</span>
          </div>

          {payload?.set && payload.set.subqueries.length > 0 && (
            <div className="sq-counts">
              <h5>{t.subqueries.distribution}</h5>
              {payload.set.subqueries.map((sq) => {
                const c = payload.counts[sq.id] ?? { n_yes: 0, n_no: 0, n_mixed: 0, n_not_addressed: 0, n_high_conf: 0 }
                const total = c.n_yes + c.n_no + c.n_mixed + c.n_not_addressed
                return (
                  <div key={sq.id} className="sq-count-row">
                    <div className="sq-count-label" style={{ borderLeftColor: `var(--cat-${sq.color_slot})` }}>
                      <b>{sq.label}</b>
                      <span className="ink-3">{sq.question}</span>
                    </div>
                    <div className="sq-count-bars">
                      <span className="sq-count-yes" title={t.subqueries.stance.yes}>
                        {t.subqueries.stance.yes}: {c.n_yes}
                      </span>
                      <span className="sq-count-mixed" title={t.subqueries.stance.mixed}>
                        {t.subqueries.stance.mixed}: {c.n_mixed}
                      </span>
                      <span className="sq-count-no" title={t.subqueries.stance.no}>
                        {t.subqueries.stance.no}: {c.n_no}
                      </span>
                      <span className="sq-count-na" title={t.subqueries.stance.not_addressed}>
                        {t.subqueries.stance.not_addressed}: {c.n_not_addressed}
                      </span>
                      <span className="ink-3">{t.subqueries.total}: {total}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
