import { useCallback, useEffect, useMemo, useState } from 'react'
import { api, type Run, type ReportRow } from '../api'
import { ISO_META, countryName, type CountryMeta } from '../geo/iso'
import { useT } from '../i18n'

// v0.2 Step 5: run-scoped geographic distribution. Two lenses on the corpus:
// author countries (from OpenAlex enrichment) and study countries (from the
// analysis pass's target_geo). Counting is once per distinct country per paper,
// so totals exceed n_papers — labelled explicitly in the side panel.
//
// This is a dot-map, not a polygon choropleth. Ships zero geo dependencies;
// polygon choropleth is tracked as a v0.3 upgrade.

type Mode = 'author' | 'target'

interface CountryEntry {
  code: string
  meta: CountryMeta | null
  count: number
}

interface RegionBucket {
  continent: string
  subregions: Map<string, number>
  total: number
}

function countByMode(rows: ReportRow[], mode: Mode): Map<string, number> {
  const counts = new Map<string, number>()
  for (const r of rows) {
    const list = mode === 'author' ? r.author_countries : r.target_countries
    if (!list) continue
    // De-dup within a paper: count each country ONCE per paper.
    const seen = new Set<string>()
    for (const cc of list) {
      const upper = (cc || '').toUpperCase()
      if (!upper || seen.has(upper)) continue
      seen.add(upper)
      counts.set(upper, (counts.get(upper) ?? 0) + 1)
    }
  }
  return counts
}

function rollUp(entries: CountryEntry[]): RegionBucket[] {
  const map = new Map<string, RegionBucket>()
  let other = 0
  for (const e of entries) {
    if (!e.meta) { other += e.count; continue }
    const key = e.meta.continent
    let b = map.get(key)
    if (!b) {
      b = { continent: e.meta.continent, subregions: new Map(), total: 0 }
      map.set(key, b)
    }
    b.total += e.count
    b.subregions.set(e.meta.subregion, (b.subregions.get(e.meta.subregion) ?? 0) + e.count)
  }
  const out = [...map.values()].sort((a, b) => b.total - a.total)
  if (other > 0) {
    out.push({
      continent: 'Other',
      subregions: new Map([['Unmapped codes', other]]),
      total: other,
    })
  }
  return out
}

// Equirectangular projection into an 800×400 viewBox.
const VW = 960
const VH = 480
function project(lat: number, lon: number): [number, number] {
  const x = ((lon + 180) / 360) * VW
  const y = ((90 - lat) / 180) * VH
  return [x, y]
}

interface Props {
  /** Optional run-id. When null the tab shows the empty state. */
  initialRunId?: number | null
}

export default function GeoView({ initialRunId }: Props) {
  const t = useT()
  const [runs, setRuns] = useState<Run[]>([])
  const [runId, setRunId] = useState<number | null>(initialRunId ?? null)
  const [rows, setRows] = useState<ReportRow[]>([])
  const [mode, setMode] = useState<Mode>('author')

  const loadRuns = useCallback(async () => {
    const rs = await api.runs()
    setRuns(rs)
    setRunId((cur) => cur ?? rs[0]?.id ?? null)
  }, [])

  useEffect(() => { loadRuns() }, [loadRuns])

  useEffect(() => {
    if (runId == null) return
    api.run(runId).then((d) => setRows(d.report), () => setRows([]))
  }, [runId])

  const entries: CountryEntry[] = useMemo(() => {
    const counts = countByMode(rows, mode)
    return [...counts.entries()]
      .map(([code, count]) => ({ code, meta: ISO_META[code] ?? null, count }))
      .sort((a, b) => b.count - a.count)
  }, [rows, mode])
  const maxCount = Math.max(1, ...entries.map((e) => e.count))
  const totalOccurrences = entries.reduce((s, e) => s + e.count, 0)
  const buckets = rollUp(entries)

  return (
    <>
      <div className="subtoolbar">
        <label className="run-picker">
          {t.report.runLabel}
          <select value={runId ?? ''} onChange={(e) => setRunId(Number(e.target.value))}>
            {runs.map((r) => (
              <option key={r.id} value={r.id}>
                #{r.id} · {r.query ? r.query.slice(0, 40) : t.report.noQuery} · {r.n_papers ?? '?'}p
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="geo-wrap">
        <div>
          <div className="geo-toolbar">
            <div className="seg" role="tablist">
              <button className={mode === 'author' ? 'on' : ''} onClick={() => setMode('author')}>{t.geo.author}</button>
              <button className={mode === 'target' ? 'on' : ''} onClick={() => setMode('target')}>{t.geo.target}</button>
            </div>
            <span className="ink-3" style={{ fontSize: 'var(--fs-xs)' }}>{t.geo.clickToFilter}</span>
          </div>
          <div className="geo-svg-wrap">
            {entries.length === 0 ? (
              <div className="geo-empty">{t.geo.empty}</div>
            ) : (
              <svg className="geo-svg" viewBox={`0 0 ${VW} ${VH}`} role="img">
                {/* Ocean background */}
                <rect x={0} y={0} width={VW} height={VH} fill="var(--surface-2)" />
                {/* Simple latitude grid so the map reads as a map, not a scatter */}
                {[60, 30, 0, -30, -60].map((lat) => {
                  const [, y] = project(lat, 0)
                  return (
                    <line key={lat} x1={0} y1={y} x2={VW} y2={y}
                      stroke="var(--border)" strokeWidth={0.5} strokeDasharray="2 4" />
                  )
                })}
                {[-120, -60, 0, 60, 120].map((lon) => {
                  const [x] = project(0, lon)
                  return (
                    <line key={lon} x1={x} y1={0} x2={x} y2={VH}
                      stroke="var(--border)" strokeWidth={0.5} strokeDasharray="2 4" />
                  )
                })}
                {entries.filter((e) => e.meta).map((e) => {
                  const meta = e.meta!
                  const [cx, cy] = project(meta.lat, meta.lon)
                  const scale = e.count / maxCount
                  const r = 5 + Math.sqrt(scale) * 22
                  return (
                    <g key={e.code}>
                      <circle
                        cx={cx} cy={cy} r={r}
                        fill="var(--accent)"
                        fillOpacity={0.28 + scale * 0.55}
                        stroke="var(--accent)"
                        strokeWidth={1}
                      >
                        <title>{meta.name} — {e.count} papers</title>
                      </circle>
                      <text x={cx} y={cy + 3} textAnchor="middle" className="geo-count">
                        {e.count}
                      </text>
                    </g>
                  )
                })}
              </svg>
            )}
          </div>
        </div>

        <aside className="geo-side">
          <h4>{t.geo.regionsTitle}</h4>
          <div className="caveat">
            {mode === 'author' ? t.geo.tabCaveatAuthor : t.geo.tabCaveatTarget}
            {' '}
            <b>{totalOccurrences}</b> country-mentions across <b>{rows.length}</b> papers.
          </div>
          {buckets.map((b) => (
            <div key={b.continent} style={{ marginBottom: 8 }}>
              <div className="geo-region continent">
                <span>{b.continent}</span>
                <span className="n">{b.total}</span>
              </div>
              {[...b.subregions.entries()].sort((a, b) => b[1] - a[1]).map(([name, n]) => (
                <div key={name} className="geo-region subregion">
                  <span className="sub">{name}</span>
                  <span className="n">{n}</span>
                </div>
              ))}
            </div>
          ))}
          {entries.length > 0 && (
            <>
              <h4 style={{ marginTop: 12 }}>Top countries</h4>
              {entries.slice(0, 20).map((e) => (
                <div key={e.code} className="geo-region">
                  <span className="sub">{countryName(e.code)}</span>
                  <span className="n">{e.count}</span>
                </div>
              ))}
            </>
          )}
        </aside>
      </div>
    </>
  )
}
