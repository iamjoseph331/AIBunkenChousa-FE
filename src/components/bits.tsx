import type { Confidence, EvidenceStatus, StanceLabel } from '../api'
import { useT } from '../i18n'

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
