import { useCallback, useEffect, useMemo, useState } from 'react'
import { api, type Run, type ReportRow } from '../api'
import { useT } from '../i18n'
import { categoryClass } from '../categoryColor'
import { countryName } from '../geo/iso'

// v0.2 Step 6. Run-scoped statistics: counts by type/field/venue/publisher/
// country/category, plus a corpus summary strip. Hand-rolled SVG bars — no
// chart library, no external assets. Per-chart export: CSV / SVG / PNG.

interface Props {
  initialRunId?: number | null
}

interface CountRow {
  key: string
  label: string
  n: number
  color?: string   // optional CSS variable reference (e.g. 'var(--cat-3)')
}

function tally<T>(rows: T[], getKey: (r: T) => string | null | undefined): Map<string, number> {
  const m = new Map<string, number>()
  for (const r of rows) {
    const k = getKey(r)
    if (!k) continue
    m.set(k, (m.get(k) ?? 0) + 1)
  }
  return m
}

function tallyMulti<T>(rows: T[], getKeys: (r: T) => string[] | null | undefined): Map<string, number> {
  const m = new Map<string, number>()
  for (const r of rows) {
    const ks = getKeys(r)
    if (!ks) continue
    const seen = new Set<string>()
    for (const k of ks) {
      const key = (k || '').toString()
      if (!key || seen.has(key)) continue
      seen.add(key)
      m.set(key, (m.get(key) ?? 0) + 1)
    }
  }
  return m
}

function topN(m: Map<string, number>, n: number = 12,
              labelFn?: (k: string) => string): CountRow[] {
  return [...m.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([k, v]) => ({ key: k, label: labelFn ? labelFn(k) : k, n: v }))
}

// --- export helpers --------------------------------------------------------

function downloadBlob(name: string, mime: string, body: BlobPart) {
  const blob = new Blob([body], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 500)
}

function csvOf(rows: CountRow[]): string {
  const esc = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s)
  return 'key,label,n\n' + rows.map((r) => `${esc(r.key)},${esc(r.label)},${r.n}`).join('\n')
}

async function svgToPng(svg: SVGSVGElement, name: string) {
  const xml = new XMLSerializer().serializeToString(svg)
  const svgBlob = new Blob([xml], { type: 'image/svg+xml;charset=utf-8' })
  const url = URL.createObjectURL(svgBlob)
  const img = new Image()
  await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = rej; img.src = url })
  const canvas = document.createElement('canvas')
  const w = svg.viewBox.baseVal.width || svg.clientWidth
  const h = svg.viewBox.baseVal.height || svg.clientHeight
  canvas.width = w * 2; canvas.height = h * 2   // 2x for retina
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--surface') || '#fff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
  URL.revokeObjectURL(url)
  const dataUrl = canvas.toDataURL('image/png')
  const a = document.createElement('a')
  a.href = dataUrl; a.download = name
  a.click()
}

// --- chart primitives ------------------------------------------------------

interface BarChartProps {
  data: CountRow[]
  title: string
  height?: number
  onExport?: (svgEl: SVGSVGElement | null) => void
}

function BarChart({ data, title, height = 240 }: BarChartProps) {
  const t = useT()
  const [svgEl, setSvgEl] = useState<SVGSVGElement | null>(null)
  const filename = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')

  const max = Math.max(1, ...data.map((r) => r.n))
  const rowH = Math.max(16, Math.min(28, Math.floor((height - 20) / Math.max(1, data.length))))
  const totalH = Math.max(height, data.length * rowH + 20)
  const labelW = 120

  return (
    <div className="stats-card">
      <div className="stats-card-header">
        <h4>{title}</h4>
        <div className="stats-export">
          <span>{t.stats.export}:</span>
          <button onClick={() => downloadBlob(`${filename}.csv`, 'text/csv', csvOf(data))}>{t.stats.exportCsv}</button>
          <button onClick={() => {
            if (!svgEl) return
            downloadBlob(`${filename}.svg`, 'image/svg+xml',
              new XMLSerializer().serializeToString(svgEl))
          }}>{t.stats.exportSvg}</button>
          <button onClick={() => svgEl && svgToPng(svgEl, `${filename}.png`)}>{t.stats.exportPng}</button>
        </div>
      </div>
      {data.length === 0 ? (
        <div className="stats-empty">{t.stats.empty}</div>
      ) : (
        <svg
          ref={setSvgEl}
          className="stats-svg"
          viewBox={`0 0 400 ${totalH}`}
          preserveAspectRatio="xMidYMin meet"
        >
          {data.map((r, i) => {
            const y = 8 + i * rowH
            const w = ((400 - labelW - 40) * r.n) / max
            return (
              <g key={r.key}>
                <text x={labelW - 6} y={y + rowH * 0.62} textAnchor="end" className="stats-label">
                  {r.label.length > 18 ? r.label.slice(0, 17) + '…' : r.label}
                </text>
                <rect
                  x={labelW} y={y + 3}
                  width={Math.max(1, w)} height={rowH - 6}
                  fill={r.color ?? 'var(--accent)'}
                  className="stats-bar"
                >
                  <title>{r.label} — {r.n}</title>
                </rect>
                <text x={labelW + w + 4} y={y + rowH * 0.62} className="stats-axis-text">{r.n}</text>
              </g>
            )
          })}
        </svg>
      )}
    </div>
  )
}

// Year trend as a mini bar chart (one bar per year, sorted).
function YearTrend({ data, title }: { data: CountRow[]; title: string }) {
  const t = useT()
  const [svgEl, setSvgEl] = useState<SVGSVGElement | null>(null)
  const filename = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  const max = Math.max(1, ...data.map((r) => r.n))
  const W = 400
  const H = 160
  const padL = 24, padB = 20, padT = 6
  const barW = data.length ? (W - padL - 4) / data.length : 0

  return (
    <div className="stats-card">
      <div className="stats-card-header">
        <h4>{title}</h4>
        <div className="stats-export">
          <span>{t.stats.export}:</span>
          <button onClick={() => downloadBlob(`${filename}.csv`, 'text/csv', csvOf(data))}>{t.stats.exportCsv}</button>
          <button onClick={() => {
            if (!svgEl) return
            downloadBlob(`${filename}.svg`, 'image/svg+xml',
              new XMLSerializer().serializeToString(svgEl))
          }}>{t.stats.exportSvg}</button>
          <button onClick={() => svgEl && svgToPng(svgEl, `${filename}.png`)}>{t.stats.exportPng}</button>
        </div>
      </div>
      {data.length === 0 ? (
        <div className="stats-empty">{t.stats.empty}</div>
      ) : (
        <svg ref={setSvgEl} className="stats-svg" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMin meet">
          <line x1={padL} y1={H - padB} x2={W - 4} y2={H - padB} className="stats-axis" />
          {data.map((r, i) => {
            const h = ((H - padB - padT) * r.n) / max
            const x = padL + i * barW
            const y = H - padB - h
            return (
              <g key={r.key}>
                <rect x={x + 1} y={y} width={barW - 2} height={h} className="stats-bar" fill="var(--accent)">
                  <title>{r.label} — {r.n}</title>
                </rect>
                {(i % Math.max(1, Math.round(data.length / 8)) === 0) && (
                  <text x={x + barW / 2} y={H - padB + 12} textAnchor="middle" className="stats-axis-text">
                    {r.label}
                  </text>
                )}
              </g>
            )
          })}
        </svg>
      )}
    </div>
  )
}

// --- main component --------------------------------------------------------

export default function StatsView({ initialRunId }: Props) {
  const t = useT()
  const [runs, setRuns] = useState<Run[]>([])
  const [runId, setRunId] = useState<number | null>(initialRunId ?? null)
  const [rows, setRows] = useState<ReportRow[]>([])

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

  const byType = useMemo(() => topN(tally(rows, (r) => r.pub_type), 10), [rows])
  const byField = useMemo(() => topN(tally(rows, (r) => r.primary_field), 10), [rows])
  const byVenue = useMemo(() => topN(tally(rows, (r) => r.venue_name), 12), [rows])
  const byPublisher = useMemo(() => topN(tally(rows, (r) => r.publisher), 10), [rows])
  const byCountry = useMemo(
    () => topN(tallyMulti(rows, (r) => r.author_countries), 15, (c) => countryName(c)),
    [rows],
  )
  const byCategory = useMemo(() => {
    // Only primary categories, coloured by hash slot to match the ReportTable chips.
    const m = new Map<string, number>()
    const nameOf = new Map<string, string>()
    for (const r of rows) {
      const primary = (r.categories || []).find((c) => c.is_primary)
      if (!primary) continue
      m.set(primary.category_id, (m.get(primary.category_id) ?? 0) + 1)
      nameOf.set(primary.category_id, primary.name)
    }
    return topN(m, 12).map((r) => {
      // recover slot from id via the same stable hash used in ReportTable
      let h = 5381
      for (let i = 0; i < r.key.length; i++) h = ((h << 5) + h) ^ r.key.charCodeAt(i)
      const slot = (((h >>> 0) % 10) % 10) + 1
      return { ...r, label: nameOf.get(r.key) ?? r.key, color: `var(--cat-${slot})` }
    })
  }, [rows])

  const byYear = useMemo(() => {
    const t = tally(rows, (r) => (r.year != null ? String(r.year) : null))
    return [...t.entries()]
      .sort((a, b) => Number(a[0]) - Number(b[0]))
      .map(([k, n]) => ({ key: k, label: k, n }))
  }, [rows])

  const nEnriched = rows.filter((r) => r.openalex_id).length
  const uniqueCountries = new Set<string>()
  rows.forEach((r) => (r.author_countries ?? []).forEach((c) => uniqueCountries.add(c)))

  // Silence unused-import: categoryClass is imported to keep the color mapping
  // module tree-connected so tsc doesn't drop it when we later use it in the
  // legend swatches. Concrete usage is in ReportTable and future graphs.
  void categoryClass

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

      <div className="stats-wrap">
        <div className="stats-summary">
          <div className="stats-tile">
            <span className="k">{t.stats.totalPapers}</span>
            <span className="v">{rows.length}</span>
          </div>
          <div className="stats-tile">
            <span className="k">{t.stats.withData}</span>
            <span className="v">{nEnriched}</span>
          </div>
          <div className="stats-tile">
            <span className="k">Types</span>
            <span className="v">{byType.length}</span>
          </div>
          <div className="stats-tile">
            <span className="k">Fields</span>
            <span className="v">{byField.length}</span>
          </div>
          <div className="stats-tile">
            <span className="k">Countries</span>
            <span className="v">{uniqueCountries.size}</span>
          </div>
          <div className="stats-tile">
            <span className="k">Years</span>
            <span className="v">{byYear.length}</span>
          </div>
        </div>

        {rows.length === 0 ? (
          <div className="stats-empty" style={{ padding: 48 }}>{t.stats.empty}</div>
        ) : (
          <div className="stats-grid">
            <BarChart data={byType} title={t.stats.byType} />
            <BarChart data={byField} title={t.stats.byField} />
            <BarChart data={byVenue} title={t.stats.byVenue} />
            <BarChart data={byPublisher} title={t.stats.byPublisher} />
            <BarChart data={byCountry} title={t.stats.byCountry} />
            <BarChart data={byCategory} title={t.stats.byCategory} />
            <YearTrend data={byYear} title={t.stats.overTime} />
          </div>
        )}
      </div>
    </>
  )
}
