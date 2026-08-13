import { useEffect, useState } from 'react'
import { api, type AnalysisDetail, type Evidence, type EvidenceCheck, type PaperCategoryAssignment, type PaperSubqueryAnswer } from '../api'
import { ConfidenceDots, StanceBadge, StatusPill, TrustStrip } from './bits'
import { useT } from '../i18n'

interface Props {
  analysisId: number
  paperKey: string
  runId: number | null
  onClose: () => void
  onOpenPdf: (key: string, page: number, quote: string) => void
}

export default function DetailDrawer({ analysisId, paperKey, runId, onClose, onOpenPdf }: Props) {
  const [detail, setDetail] = useState<AnalysisDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [categories, setCategories] = useState<PaperCategoryAssignment[]>([])
  const [subqueryAnswers, setSubqueryAnswers] = useState<PaperSubqueryAnswer[]>([])
  const t = useT()

  useEffect(() => {
    setDetail(null)
    setError(null)
    setCategories([])
    setSubqueryAnswers([])
    api.analysis(analysisId).then(setDetail, (e) => setError(String(e)))
    if (runId != null) {
      api.paperCategories(runId, paperKey).then(setCategories, () => setCategories([]))
      api.paperSubqueries(runId, paperKey).then(setSubqueryAnswers, () => setSubqueryAnswers([]))
    }
  }, [analysisId, paperKey, runId])

  // Verification status keyed by field|page|quote so each rendered quote shows its pill.
  const checks = new Map<string, EvidenceCheck>()
  detail?.evidence.forEach((c) => checks.set(`${c.field}|${c.page}|${c.quote}`, c))

  const EvidenceList = ({ field, items }: { field: string; items: Evidence[] }) => (
    <ul className="ev-list">
      {items.map((ev, i) => {
        const check = checks.get(`${field}|${ev.page}|${ev.quote}`)
        const openPage = check?.found_page ?? ev.page
        return (
          <li key={i} className="ev-item">
            <blockquote>“{ev.quote}”</blockquote>
            <div className="ev-meta">
              <button className="pagelink" onClick={() => onOpenPdf(paperKey, openPage, ev.quote)}>
                p.{ev.page}{check?.found_page && check.found_page !== ev.page ? ` → ${check.found_page}` : ''} →
              </button>
              {check && <StatusPill status={check.status} />}
            </div>
          </li>
        )
      })}
      {items.length === 0 && <li className="ev-none">{t.drawer.noEvidence}</li>}
    </ul>
  )

  const StoredGrounding = ({ page, quote, field }: { page: number | null | undefined; quote: string | null | undefined; field?: string }) => {
    if (page == null || !quote) return <p className="ev-none">{t.drawer.noEvidence}</p>
    const check = field ? checks.get(`${field}|${page}|${quote}`) : undefined
    return <div className="ev-item"><blockquote>“{quote}”</blockquote><div className="ev-meta"><button className="pagelink" onClick={() => onOpenPdf(paperKey, check?.found_page ?? page, quote)}>p.{page} →</button>{check && <StatusPill status={check.status} />}</div></div>
  }

  return (
    <aside className="drawer">
      <div className="drawer-head">
        <div className="drawer-title">
          <h2>{detail?.extracted_title || detail?.filename || paperKey}</h2>
          <div className="drawer-sub">
            {detail?.filename ?? paperKey}
            {detail?.n_pages != null ? ` · ${detail.n_pages} pp` : ''}
          </div>
        </div>
        <button className="drawer-close" onClick={onClose} aria-label="Close">✕</button>
      </div>

      {error && <div className="drawer-error">{t.drawer.failed} {error}</div>}
      {!detail && !error && <div className="drawer-loading">{t.drawer.loading}</div>}

      {detail && (
        <div className="drawer-body">
          <div className="stat-row">
            <StanceBadge label={detail.stance_label} polarity={detail.polarity} />
            <span className="stat">{t.drawer.relevance} <b>{detail.relevance_score ?? '—'}</b><span className="stat-unit">/100</span></span>
            <span className="stat stat-inline">
              {t.drawer.confidence} <ConfidenceDots confidence={detail.confidence} /> <b>{detail.confidence ? t.confidence[detail.confidence] : '—'}</b>
            </span>
            <span className="stat stat-inline">
              {t.drawer.trust} <TrustStrip statuses={detail.evidence.map((c) => c.status)} verified={detail.n_verified} total={detail.n_evidence} />
            </span>
            <span className="stat">{t.drawer.extraction} <b>{detail.quality == null ? '—' : `${Math.round(detail.quality * 100)}%`}</b></span>
          </div>

          {detail.low_quality_pages.length > 0 && (
            <div className="warn">{t.drawer.lowQuality} {detail.low_quality_pages.join(', ')}</div>
          )}

          <section>
            <h3>{t.drawer.stance} · {t.stance[detail.analysis.stance.label]}</h3>
            <p className="reasoning">{detail.analysis.stance.reasoning}</p>
            <EvidenceList field="stance" items={detail.analysis.stance.evidence} />
          </section>

          <section>
            <h3>{t.drawer.relevance} · {detail.analysis.relevance.score}/100</h3>
            <p className="reasoning">{detail.analysis.relevance.rationale}</p>
          </section>

          <section>
            <h3>{t.drawer.summary}</h3>
            {detail.analysis.summary.map((b, i) => (
              <div key={i} className="bullet">
                <p className="point">• {b.point}</p>
                <EvidenceList field={`summary[${i + 1}]`} items={b.evidence} />
              </div>
            ))}
          </section>

          <section>
            <h3>{t.drawer.metadata}</h3>
            {(Object.entries(detail.analysis.metadata) as [string, AnalysisDetail['analysis']['metadata'][keyof AnalysisDetail['analysis']['metadata']]][]).map(
              ([name, f]) => (
                <div key={name} className="meta">
                  <div className="meta-head">
                    <span className="meta-name">{name.replace(/_/g, ' ')}</span>
                    <span className="meta-value">{f.not_reported ? <em>{t.drawer.notReported}</em> : f.value}</span>
                  </div>
                  {!f.not_reported && <EvidenceList field={`metadata.${name}`} items={f.evidence} />}
                </div>
              ),
            )}
          </section>

          {categories.length > 0 && (
            <section>
              <h3>{t.categories.title}</h3>
              {categories.map((category) => (
                <div key={category.category_id} className="drawer-grounding">
                  <div className="meta-head"><b>{category.name}</b><span className="meta-value">{Math.round(category.confidence * 100)}%</span></div>
                  {category.rationale && <p className="reasoning">{category.rationale}</p>}
                  <StoredGrounding page={category.evidence_page} quote={category.evidence_quote} field={`categories[${detail.analysis.categories?.findIndex((item) => item.category === category.name) ?? -1}]`} />
                </div>
              ))}
            </section>
          )}

          {subqueryAnswers.length > 0 && (
            <section>
              <h3>{t.subqueries.title}</h3>
              {subqueryAnswers.map((answer) => (
                <div key={answer.subquery_id} className="drawer-grounding">
                  <div className="meta-head"><b>{answer.label ?? answer.subquery_id}</b><span className={`sq-chip sq-chip-${answer.stance}`}>{t.subqueries.stance[answer.stance]}</span></div>
                  {answer.finding && <p className="reasoning">{answer.finding}</p>}
                  <StoredGrounding page={answer.evidence_page} quote={answer.evidence_quote} field={`subqueries.${answer.subquery_id}`} />
                </div>
              ))}
            </section>
          )}
        </div>
      )}
    </aside>
  )
}
