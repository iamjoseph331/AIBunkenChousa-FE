import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { geoNaturalEarth1, geoPath } from 'd3-geo'
import { feature } from 'topojson-client'
import { numericToAlpha2 } from 'i18n-iso-countries'
import world from 'world-atlas/countries-110m.json'
import { api, type Run, type ReportRow } from '../api'
import { ISO_META, countryName, type CountryMeta } from '../geo/iso'
import { useT } from '../i18n'
import { filterByYear, type YearRange } from '../time'
import type { SubqueryFilter } from '../subqueryFilter'
import { matchesSubqueryFilter } from '../subqueryFilter'
import SubqueryFilterControl from './SubqueryFilterControl'

type Mode = 'author' | 'target'

interface CountryEntry { code: string; meta: CountryMeta | null; count: number }
interface SubregionBucket { name: string; codes: string[]; total: number }
interface RegionBucket { continent: string; codes: string[]; subregions: SubregionBucket[]; total: number }
interface HoveredCountry { name: string; count: number | null }
interface Props {
  runId: number | null
  onRunIdChange: (id: number) => void
  yearRange: YearRange | null
  includeUndated: boolean
  slider?: ReactNode
  onFilter: (filter: { runId: number; codes: string[]; label: string; mode: Mode }) => void
  subqueryFilter: SubqueryFilter | null
  onSubqueryFilterChange: (filter: SubqueryFilter | null) => void
}

const VW = 960
const VH = 480
const countryFeatures = (feature(world as never, world.objects.countries as never) as unknown as GeoJSON.FeatureCollection).features
  .map((shape) => ({ shape, code: numericToAlpha2(String(shape.id).padStart(3, '0'))?.toUpperCase() }))
  .filter(({ code }) => code !== 'AQ')
const countryCollection: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: countryFeatures.map(({ shape }) => shape) }
const projection = geoNaturalEarth1().fitExtent([[12, 12], [VW - 12, VH - 12]], countryCollection)
const path = geoPath(projection)

function countByMode(rows: ReportRow[], mode: Mode): Map<string, number> {
  const counts = new Map<string, number>()
  for (const row of rows) {
    const countries = mode === 'author' ? row.author_countries : row.target_countries
    for (const code of new Set((countries ?? []).map((country) => country.toUpperCase()))) {
      if (code) counts.set(code, (counts.get(code) ?? 0) + 1)
    }
  }
  return counts
}

function rollUp(entries: CountryEntry[]): RegionBucket[] {
  const continents = new Map<string, { codes: string[]; total: number; subregions: Map<string, SubregionBucket> }>()
  for (const entry of entries) {
    if (!entry.meta) continue
    const continent = continents.get(entry.meta.continent) ?? { codes: [] as string[], total: 0, subregions: new Map<string, SubregionBucket>() }
    continent.codes.push(entry.code)
    continent.total += entry.count
    const subregion = continent.subregions.get(entry.meta.subregion) ?? { name: entry.meta.subregion, codes: [], total: 0 }
    subregion.codes.push(entry.code)
    subregion.total += entry.count
    continent.subregions.set(entry.meta.subregion, subregion)
    continents.set(entry.meta.continent, continent)
  }
  return [...continents.entries()].map(([continent, value]) => ({ continent, codes: value.codes, total: value.total, subregions: [...value.subregions.values()].sort((a, b) => b.total - a.total) })).sort((a, b) => b.total - a.total)
}

export default function GeoView({ runId, onRunIdChange, yearRange, includeUndated, slider, onFilter, subqueryFilter, onSubqueryFilterChange }: Props) {
  const t = useT()
  const [runs, setRuns] = useState<Run[]>([])
  const [rows, setRows] = useState<ReportRow[]>([])
  const [mode, setMode] = useState<Mode>('author')
  const [hovered, setHovered] = useState<HoveredCountry | null>(null)

  const loadRuns = useCallback(async () => {
    const loaded = await api.runs()
    setRuns(loaded)
    if (runId == null && loaded.length > 0) onRunIdChange(loaded[0].id)
  }, [runId, onRunIdChange])
  useEffect(() => { loadRuns() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [])
  useEffect(() => { if (runId != null) api.run(runId).then((data) => setRows(data.report), () => setRows([])) }, [runId])

  // v0.3: filter rows by the App-level year range BEFORE counting so bubbles
  // and sidebar buckets update live as the timeline slider drags. maxCount is
  // frozen against the unfiltered dataset so bubble radii don't "breathe" as
  // the range shrinks.
  const visibleRows = useMemo(() => filterByYear(rows, yearRange, includeUndated).filter((row) => matchesSubqueryFilter(row, subqueryFilter)), [rows, yearRange, includeUndated, subqueryFilter])
  const entries = useMemo(() => [...countByMode(visibleRows, mode).entries()].map(([code, count]) => ({ code, count, meta: ISO_META[code] ?? null })).sort((a, b) => b.count - a.count), [visibleRows, mode])
  const counts = useMemo(() => new Map(entries.map((entry) => [entry.code, entry.count])), [entries])
  const unfilteredMax = useMemo(() => {
    let m = 0
    for (const v of countByMode(rows, mode).values()) if (v > m) m = v
    return m
  }, [rows, mode])
  const maxCount = Math.max(1, unfilteredMax)
  const buckets = useMemo(() => rollUp(entries), [entries])
  const applyFilter = (codes: string[], label: string) => { if (runId != null) onFilter({ runId, codes, label, mode }) }

  return <>
    <div className="subtoolbar"><label className="run-picker">{t.report.runLabel}<select value={runId ?? ''} onChange={(event) => onRunIdChange(Number(event.target.value))}>{runs.map((run) => <option key={run.id} value={run.id}>#{run.id} · {run.query ? run.query.slice(0, 40) : t.report.noQuery} · {run.n_papers ?? '?'}p</option>)}</select></label></div>
    {slider}
    <div className="geo-wrap"><div><div className="geo-toolbar"><div className="seg" role="tablist"><button className={mode === 'author' ? 'on' : ''} onClick={() => setMode('author')}>{t.geo.author}</button><button className={mode === 'target' ? 'on' : ''} onClick={() => setMode('target')}>{t.geo.target}</button></div><SubqueryFilterControl rows={rows} value={subqueryFilter} onChange={onSubqueryFilterChange} /><span className="ink-3" style={{ fontSize: 'var(--fs-xs)' }}>{t.geo.clickToFilter}</span></div><div className="geo-svg-wrap"><svg className="geo-svg" viewBox={`0 0 ${VW} ${VH}`} role="img" aria-label={t.geo.title}><rect x="0" y="0" width={VW} height={VH} fill="var(--surface-2)" />{countryFeatures.map(({ shape, code }) => { const count = code ? counts.get(code) ?? null : null; const active = code && count != null; const name = code ? countryName(code) : String(shape.id); return <path key={String(shape.id)} d={path(shape) ?? ''} className={`geo-country${active ? ' on' : ''}`} role={active ? 'button' : undefined} tabIndex={active ? 0 : undefined} onPointerEnter={() => setHovered({ name, count })} onPointerLeave={() => setHovered(null)} onClick={() => { if (code && active) applyFilter([code], name) }} onKeyDown={(event) => { if (active && code && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); applyFilter([code], name) } }} /> })}{entries.filter((entry) => entry.meta).map((entry) => { const point = projection([entry.meta!.lon, entry.meta!.lat]); if (!point) return null; const scale = entry.count / maxCount; return <g key={entry.code} pointerEvents="none"><circle cx={point[0]} cy={point[1]} r={4 + Math.sqrt(scale) * 16} className="geo-marker" /><text x={point[0]} y={point[1] + 3} textAnchor="middle" className="geo-count">{entry.count}</text></g> })}</svg>{hovered && <div className="geo-tooltip"><b>{hovered.name}</b><span>{hovered.count == null ? 'No papers in this run' : `${hovered.count} ${hovered.count === 1 ? 'paper' : 'papers'} · click to filter Report`}</span></div>}{entries.length === 0 && <div className="geo-empty">{t.geo.empty}</div>}</div></div>
      <aside className="geo-side"><h4>{t.geo.regionsTitle}</h4><div className="caveat">{mode === 'author' ? t.geo.tabCaveatAuthor : t.geo.tabCaveatTarget}</div>{buckets.map((bucket) => <div key={bucket.continent} style={{ marginBottom: 8 }}><button className="geo-region continent geo-region-button" onClick={() => applyFilter(bucket.codes, bucket.continent)}><span>{bucket.continent}</span><span className="n">{bucket.total}</span></button>{bucket.subregions.map((subregion) => <button key={subregion.name} className="geo-region subregion geo-region-button" onClick={() => applyFilter(subregion.codes, subregion.name)}><span className="sub">{subregion.name}</span><span className="n">{subregion.total}</span></button>)}</div>)}{entries.length > 0 && <><h4 style={{ marginTop: 12 }}>Top countries</h4>{entries.slice(0, 20).map((entry) => <button key={entry.code} className="geo-region geo-country-link" onClick={() => applyFilter([entry.code], countryName(entry.code))}><span className="sub">{countryName(entry.code)}</span><span className="n">{entry.count}</span></button>)}</>}</aside>
    </div>
  </>
}
