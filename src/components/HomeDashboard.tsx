import { useEffect, useState } from 'react'
import { api, type ReportRow, type Run, type StanceLabel } from '../api'
import { useT } from '../i18n'

const STANCES: StanceLabel[] = ['supportive', 'mixed', 'neutral', 'critical', 'not_addressed']

interface Summary {
  run: Run
  rows: ReportRow[]
}

/** Corpus-at-a-glance for the most recent completed run: stance mix, query
 *  coverage, quote-verification rate, and trust distribution. Read-only; reuses
 *  the run report the Report tab already serves. */
export default function HomeDashboard() {
  const t = useT()
  const [data, setData] = useState<Summary | null>(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const runs = await api.runs()
        const run = runs.find((r) => r.status === 'done') ?? runs[0]
        if (!run) { if (!cancelled) setLoaded(true); return }
        const d = await api.run(run.id)
        if (!cancelled) setData({ run, rows: d.report })
      } catch {
        /* leave empty */
      } finally {
        if (!cancelled) setLoaded(true)
      }
    })()
    return () => { cancelled = true }
  }, [])

  if (!loaded) return null
  if (!data || data.rows.length === 0) {
    return (
      <section className="home-section">
        <h3>{t.overview.heading}</h3>
        <p className="home-help">{t.overview.subtitle}</p>
        <div className="dash-empty">{t.overview.empty}</div>
      </section>
    )
  }

  const { run, rows } = data
  const n = rows.length

  const stanceCounts = STANCES.map((s) => ({
    key: s,
    n: rows.filter((r) => (r.stance_label ?? 'not_addressed') === s).length,
  }))
  const addressed = rows.filter((r) => r.stance_label && r.stance_label !== 'not_addressed').length
  const notAddressed = n - addressed

  const sumVerified = rows.reduce((a, r) => a + r.n_verified, 0)
  const sumEvidence = rows.reduce((a, r) => a + r.n_evidence, 0)
  const verRate = sumEvidence ? sumVerified / sumEvidence : 0

  const withEv = rows.filter((r) => r.n_evidence > 0)
  const bucket = (pct: number) => (pct >= 0.95 ? 'high' : pct >= 0.8 ? 'mid' : 'low')
  const trust = { high: 0, mid: 0, low: 0 }
  withEv.forEach((r) => { trust[bucket(r.n_verified / r.n_evidence)]++ })

  const runLabel = run.query ? run.query.slice(0, 48) : t.report.noQuery

  return (
    <section className="home-section">
      <div className="dash-head">
        <h3>{t.overview.heading}</h3>
        <span className="dash-run">{t.overview.run} #{run.id} · {runLabel}</span>
      </div>

      <div className="dash-grid">
        {/* papers + spend */}
        <div className="dash-card dash-kpis">
          <div className="dash-kpi">
            <span className="dash-num">{n}</span>
            <span className="dash-label">{t.overview.papers}</span>
          </div>
          <div className="dash-kpi">
            <span className="dash-num">${run.total_usd.toFixed(2)}</span>
            <span className="dash-label">{t.overview.cost}</span>
          </div>
        </div>

        {/* stance mix */}
        <div className="dash-card">
          <span className="dash-card-title">{t.overview.stanceMix}</span>
          <div className="dash-bar">
            {stanceCounts.map((s) =>
              s.n ? (
                <span
                  key={s.key}
                  className={`dash-seg seg-${s.key}`}
                  style={{ flexGrow: s.n }}
                  title={`${t.stance[s.key]}: ${s.n}`}
                />
              ) : null,
            )}
          </div>
          <div className="dash-legend">
            {stanceCounts.filter((s) => s.n).map((s) => (
              <span key={s.key} className="dash-legend-item">
                <span className={`dash-dot seg-${s.key}`} />
                {t.stance[s.key]} <b>{s.n}</b>
              </span>
            ))}
          </div>
        </div>

        {/* query coverage */}
        <div className="dash-card">
          <span className="dash-card-title">{t.overview.coverage}</span>
          <div className="dash-bar">
            {addressed > 0 && <span className="dash-seg seg-addressed" style={{ flexGrow: addressed }} />}
            {notAddressed > 0 && <span className="dash-seg seg-none" style={{ flexGrow: notAddressed }} />}
          </div>
          <div className="dash-legend">
            <span className="dash-legend-item"><span className="dash-dot seg-addressed" />{t.overview.addressed} <b>{addressed}</b></span>
            <span className="dash-legend-item"><span className="dash-dot seg-none" />{t.overview.notAddressed} <b>{notAddressed}</b></span>
          </div>
        </div>

        {/* quote verification */}
        <div className="dash-card">
          <span className="dash-card-title">{t.overview.verification}</span>
          <div className="dash-verline">
            <span className="dash-num dash-num-accent">{Math.round(verRate * 100)}%</span>
            <span className="dash-sub">{sumVerified}/{sumEvidence} {t.overview.ofQuotes}</span>
          </div>
          <div className="dash-meter">
            <span
              className={`dash-meter-fill ${verRate >= 0.95 ? 'lvl-high' : verRate >= 0.8 ? 'lvl-mid' : 'lvl-low'}`}
              style={{ width: `${verRate * 100}%` }}
            />
          </div>
        </div>

        {/* trust distribution */}
        <div className="dash-card">
          <span className="dash-card-title">{t.overview.trustDist}</span>
          <ul className="dash-dist">
            {([['high', t.overview.trustHigh], ['mid', t.overview.trustMid], ['low', t.overview.trustLow]] as const).map(
              ([k, label]) => {
                const v = trust[k]
                const pct = withEv.length ? (v / withEv.length) * 100 : 0
                return (
                  <li key={k} className="dash-dist-row">
                    <span className="dash-dist-label">{label}</span>
                    <span className="dash-dist-track">
                      <span className={`dash-dist-fill lvl-${k}`} style={{ width: `${pct}%` }} />
                    </span>
                    <span className="dash-dist-n num">{v}</span>
                  </li>
                )
              },
            )}
          </ul>
        </div>
      </div>
    </section>
  )
}
