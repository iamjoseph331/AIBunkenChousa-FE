import type { Confidence, EvidenceStatus, PaperCategoryAssignment, StanceLabel } from '../api'
import { useT } from '../i18n'
import { categoryVar, primaryCategory, type ConceptNodeColorMode } from '../categoryColor'

function arcPath(radius: number, start: number, end: number): string {
  const point = (angle: number) => [Math.cos(angle) * radius, Math.sin(angle) * radius]
  const [sx, sy] = point(start)
  const [ex, ey] = point(end)
  return `M 0 0 L ${sx} ${sy} A ${radius} ${radius} 0 ${end - start > Math.PI ? 1 : 0} 1 ${ex} ${ey} Z`
}

/** SVG node fill split by category confidence, with the independent stance
 * encoded by its outline. This keeps multi-label categorisation legible in the
 * graphs without losing the query-position signal. */
export function CategoryPie({ categories, radius, stance, selected = false, mode = 'pie' }: { categories?: PaperCategoryAssignment[]; radius: number; stance?: StanceLabel | null; selected?: boolean; mode?: ConceptNodeColorMode }) {
  const slices = (categories ?? []).slice(0, 8)
  const total = slices.reduce((sum, category) => sum + Math.max(category.confidence || 0, 0.1), 0)
  let angle = -Math.PI / 2
  const outline = stance ? `var(--st-${stance === 'not_addressed' ? 'na' : stance}-ink)` : 'var(--border-strong)'
  if (!slices.length) return <circle r={radius} className={`category-pie-outline${selected ? ' selected' : ''}`} fill="var(--surface-3)" stroke={outline} strokeWidth={1.8} />
  if (mode === 'primary') {
    const primary = primaryCategory(categories)
    return <circle r={radius} className={`category-pie-outline${selected ? ' selected' : ''}`} fill={primary ? categoryVar(primary.color_slot) : 'var(--surface-3)'} stroke={outline} strokeWidth={2.2}><title>{primary?.name ?? ''}</title></circle>
  }
  return <g><title>{slices.map((c) => c.name).join(' · ')}</title>{slices.map((category) => {
    const next = angle + (Math.PI * 2 * Math.max(category.confidence || 0, 0.1)) / total
    const path = arcPath(radius, angle, next)
    angle = next
    return <path key={category.category_id} d={path} fill={categoryVar(category.color_slot)} />
  })}<circle r={radius} className={`category-pie-outline${selected ? ' selected' : ''}`} fill="none" stroke={outline} strokeWidth={2.2} /></g>
}

export function StanceBadge({
  label,
  polarity,
}: {
  label: StanceLabel | null
  polarity: number | null
}) {
  const t = useT()
  if (!label) return <span className="badge badge-na">—</span>
  const arrow = polarity == null ? '' : polarity > 0 ? ' ↑' : polarity < 0 ? ' ↓' : ''
  return <span className={`badge stance-${label}`}>{t.stance[label]}{arrow}</span>
}

export function TrustBar({ verified, total }: { verified: number; total: number }) {
  const pct = total ? verified / total : 0
  const tone = pct >= 0.95 ? 'good' : pct >= 0.8 ? 'ok' : 'bad'
  return (
    <span className="trust" title={`${verified}/${total} evidence quotes verified`}>
      <span className="trust-track">
        <span className={`trust-fill trust-${tone}`} style={{ width: `${pct * 100}%` }} />
      </span>
      <span className="trust-label">{verified}/{total}</span>
    </span>
  )
}

/** Segmented trust strip — one cell per quote. In the drawer we pass the real
 *  per-quote `statuses`; in the table we only have counts, so cells are
 *  synthesized (verified ones filled, the rest shown as unverified). */
export function TrustStrip({
  statuses,
  verified,
  total,
}: {
  statuses?: EvidenceStatus[]
  verified: number
  total: number
}) {
  const cells: EvidenceStatus[] =
    statuses ??
    Array.from({ length: total }, (_, i): EvidenceStatus =>
      i < verified ? 'verified' : 'unverified',
    )
  return (
    <span className="trust-strip" title={`${verified}/${total} evidence quotes verified`}>
      <span className="trust-cells">
        {cells.map((s, i) => (
          <span key={i} className={`trust-cell trust-cell-${s}`} />
        ))}
      </span>
      <span className="trust-label num">{verified}/{total}</span>
    </span>
  )
}

export function ConfidenceDots({ confidence }: { confidence: Confidence | null }) {
  const n = confidence === 'high' ? 3 : confidence === 'medium' ? 2 : confidence === 'low' ? 1 : 0
  return (
    <span className="conf-dots" title={confidence ? `confidence: ${confidence}` : 'no confidence'}>
      {[0, 1, 2].map((i) => (
        <span key={i} className={`conf-dot${i < n ? ' on' : ''}`} />
      ))}
    </span>
  )
}

export function StatusPill({ status }: { status: EvidenceStatus }) {
  const t = useT()
  return <span className={`pill pill-${status}`}>{t.status[status] ?? status}</span>
}
