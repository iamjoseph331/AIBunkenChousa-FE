import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  api,
  type ConceptEdge,
  type ConceptEstimate,
  type ConceptGraphData,
  type ConceptNode,
  type ConceptSeed,
  type ReportRow,
  type Run,
  type SubqueryDefStored,
} from '../api'
import { computeLayout, type Pos } from './graphLayout'
import { useT } from '../i18n'
import type { YearRange } from '../time'
import ProgressBar from './ProgressBar'
import PdfViewer from './PdfViewer'
import { CategoryPie } from './bits'
import type { SubqueryFilter } from '../subqueryFilter'
import { matchesSubqueryFilter } from '../subqueryFilter'
import SubqueryFilterControl from './SubqueryFilterControl'
import { primaryCategory, type ConceptNodeColorMode } from '../categoryColor'

const VW = 960
const VH = 620

function radius(n: ConceptNode): number {
  return 9 + ((n.relevance ?? 0) / 100) * 10
}

// v0.3 cluster-by state — one selector value:
//   'category' — group by the run's user-defined primary category (default).
//   'none' — no clustering.
//   'stance' — group nodes by stance toward the query (same as node color).
//   `sq:${id}` — group nodes by the paper's answer stance to that subquery.
type ClusterMode = 'none' | 'stance' | string

interface Props {
  runId: number | null
  onRunIdChange: (id: number) => void
  yearRange: YearRange | null
  includeUndated: boolean
  slider?: ReactNode
  subqueryFilter: SubqueryFilter | null
  onSubqueryFilterChange: (filter: SubqueryFilter | null) => void
  nodeColorMode: ConceptNodeColorMode
}

/** Phase 3 concept graph. Nodes are a run's most-relevant papers (colored by stance
 * toward the query, sized by relevance); edges are LLM-classified relations between
 * papers' claims — blue = supporting, red = opposing (neutral pairs aren't drawn).
 * The build costs money, so it is gated behind an explicit Start + cost-confirm.
 *
 * v0.3: adds a year filter (App-level slider) and a cluster-by selector that
 * feeds the shared graphLayout `groups` param to pull same-answer nodes closer. */
export default function ConceptGraph({ runId, onRunIdChange, yearRange, includeUndated, slider, subqueryFilter, onSubqueryFilterChange, nodeColorMode }: Props) {
  const t = useT()
  const [runs, setRuns] = useState<Run[]>([])
  const [graph, setGraph] = useState<ConceptGraphData | null>(null)
  const [reportRows, setReportRows] = useState<ReportRow[]>([])
  const [pos, setPos] = useState<Record<string, Pos>>({})
  const [cluster, setCluster] = useState<ClusterMode>(
    () => (localStorage.getItem('aibc-concept-cluster') as ClusterMode) || 'category',
  )
  const [estimate, setEstimate] = useState<ConceptEstimate | null>(null)
  const [seed, setSeed] = useState<ConceptSeed>('citation')
  // v0.2 Step 8b: subset-size slider. Larger n makes more meaningful
  // clustering possible but the pair count grows ~n²; the estimate above
  // updates live so the user sees the cost before committing.
  const [subsetSize, setSubsetSize] = useState<number>(() => {
    const raw = localStorage.getItem('aibc-concept-subset-size')
    const n = raw ? Number(raw) : 20
    return Number.isFinite(n) && n >= 20 && n <= 100 ? n : 20
  })
  const [estimating, setEstimating] = useState(false)
  const [building, setBuilding] = useState(false)
  const [progress, setProgress] = useState<{ done: number; total: number | null } | null>(null)
  const [log, setLog] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [selNode, setSelNode] = useState<string | null>(null)
  const [selEdge, setSelEdge] = useState<ConceptEdge | null>(null)
  const [pdf, setPdf] = useState<{ key: string; page: number } | null>(null)
  const svgRef = useRef<SVGSVGElement | null>(null)
  const esRef = useRef<EventSource | null>(null)
  const dragRef = useRef<string | null>(null)

  useEffect(() => {
    api.runs().then((rs) => {
      setRuns(rs)
      if (runId == null && rs.length > 0) onRunIdChange(rs[0].id)
    }, (e) => setError(String(e)))
    return () => esRef.current?.close()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const loadGraph = useCallback(async (id: number, n: number) => {
    try {
      const g = await api.conceptGraph(id, n)
      setGraph(g)
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e))
    }
  }, [])

  // Also pull the run's report rows so we can look up per-paper subquery
  // answers for clustering (the graph payload itself doesn't carry them).
  useEffect(() => {
    if (runId == null) return
    api.run(runId).then((d) => setReportRows(d.report), () => setReportRows([]))
  }, [runId])

  useEffect(() => {
    if (runId == null) return
    setSelNode(null)
    setSelEdge(null)
    setEstimate(null)
    loadGraph(runId, subsetSize)
  }, [runId, subsetSize, loadGraph])

  useEffect(() => localStorage.setItem('aibc-concept-cluster', cluster), [cluster])

  // Re-price the build when the user drags the slider, if the estimate panel
  // is open. Debounced by React's normal batching — cheap endpoint, no LLM.
  useEffect(() => {
    if (runId == null || !estimate) return
    let cancelled = false
    api.conceptEstimate(runId, seed, subsetSize).then(
      (e) => { if (!cancelled) setEstimate(e) },
      () => { /* silent — the estimate panel just keeps its last value */ },
    )
    return () => { cancelled = true }
  }, [subsetSize, seed, runId, estimate])

  useEffect(() => {
    localStorage.setItem('aibc-concept-subset-size', String(subsetSize))
  }, [subsetSize])

  async function askBuild() {
    if (runId == null) return
    setEstimating(true)
    setError(null)
    try {
      setEstimate(await api.conceptEstimate(runId, seed, subsetSize))
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e))
    } finally {
      setEstimating(false)
    }
  }

  function runBuild() {
    if (runId == null) return
    setBuilding(true)
    setError(null)
    setLog([])
    setEstimate(null)
    setProgress({ done: 0, total: null })
    const es = new EventSource(api.conceptEventsUrl(runId))
    esRef.current = es
    const add = (l: string) => setLog((prev) => [...prev, l])
    const on = (name: string, fn: (d: any) => void) =>
      es.addEventListener(name, (e) => fn(JSON.parse((e as MessageEvent).data)))

    on('hello', () => add('▶ classifying candidate pairs…'))
    on('plan', (d) => { add(`● ${d.n_to_classify} to classify (${d.n_cached} cached)`); setProgress({ done: 0, total: d.n_to_classify ?? null }) })
    on('classified', (d) => {
      add(`${d.relation === 'supporting' ? '＋' : d.relation === 'opposing' ? '－' : '·'} ${d.relation} (${d.strength})`)
      setProgress((p) => (p ? { ...p, done: p.done + 1 } : p))
    })
    on('done', (d) => {
      add(`● done — ${d.counts?.supporting ?? 0} supporting, ${d.counts?.opposing ?? 0} opposing · $${(d.total_usd ?? 0).toFixed(3)}`)
      es.close()
      setBuilding(false)
      setProgress(null)
      loadGraph(runId, subsetSize)
    })
    on('error', (d) => {
      add(`● error — ${d.error}`)
      es.close()
      setBuilding(false)
      setProgress(null)
      setError(d.error)
    })
    es.onerror = () => { es.close(); setBuilding(false); setProgress(null) }

    api.buildConcept(runId, seed, subsetSize).catch((e) => {
      es.close()
      setBuilding(false)
      setError(String(e instanceof Error ? e.message : e))
    })
  }

  // --- drag (screen → viewBox) ----------------------------------------------
  const toSvg = useCallback((cx: number, cy: number): Pos => {
    const svg = svgRef.current
    if (!svg) return { x: 0, y: 0 }
    const pt = svg.createSVGPoint()
    pt.x = cx; pt.y = cy
    const ctm = svg.getScreenCTM()
    if (!ctm) return { x: 0, y: 0 }
    const p = pt.matrixTransform(ctm.inverse())
    return { x: p.x, y: p.y }
  }, [])
  function onPointerDown(key: string, e: React.PointerEvent) {
    e.stopPropagation()
    dragRef.current = key
    setSelNode(key)
    setSelEdge(null)
    ;(e.target as Element).setPointerCapture?.(e.pointerId)
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!dragRef.current) return
    setPos((prev) => ({ ...prev, [dragRef.current as string]: toSvg(e.clientX, e.clientY) }))
  }

  // v0.3 — visibility filter (year range) and cluster groups, mirroring the
  // triple-useMemo pattern in CitationGraph so orphan edges and stale
  // selections can't happen.
  const rowsByPaper = useMemo(() => new Map(reportRows.map((row) => [row.paper_key, row])), [reportRows])
  const visibleNodes = useMemo(
    () => (graph?.nodes ?? []).filter((n) => {
      if (n.year == null && !includeUndated) return false
      if (n.year != null && yearRange && !(n.year >= yearRange.lo && n.year <= yearRange.hi)) return false
      return matchesSubqueryFilter(rowsByPaper.get(n.key) ?? ({ subquery_answers: {} } as ReportRow), subqueryFilter)
    }),
    [graph, yearRange, includeUndated, rowsByPaper, subqueryFilter],
  )
  const visibleKeys = useMemo(() => new Set(visibleNodes.map((n) => n.key)), [visibleNodes])
  const drawn = useMemo(
    () => (graph?.edges ?? []).filter(
      (e) => e.relation !== 'neutral' && visibleKeys.has(e.source) && visibleKeys.has(e.target),
    ),
    [graph, visibleKeys],
  )
  const byKey = useMemo(() => new Map(visibleNodes.map((n) => [n.key, n])), [visibleNodes])

  // Look up subquery answers per paper for the cluster-by picker. The
  // currently-selected subquery set is on any report row; the concept graph
  // reads it out and joins per-paper answers by paper_key.
  const subquerySet: { id: number; subqueries: SubqueryDefStored[] } | null = reportRows[0]?.subquery_set ?? null
  const answersByPaper = useMemo(() => {
    const m = new Map<string, Record<string, string>>()
    for (const r of reportRows) {
      const answers: Record<string, string> = {}
      for (const [sqId, a] of Object.entries(r.subquery_answers ?? {})) {
        answers[sqId] = a.stance
      }
      m.set(r.paper_key, answers)
    }
    return m
  }, [reportRows])

  const groups: Record<string, string | null> | undefined = useMemo(() => {
    if (cluster === 'none') return undefined
    const g: Record<string, string | null> = {}
    for (const n of visibleNodes) {
      if (cluster === 'category') {
        g[n.key] = primaryCategory(n.categories)?.category_id ?? null
      } else if (cluster === 'stance') {
        g[n.key] = n.stance ?? null
      } else if (cluster.startsWith('sq:')) {
        const sqId = cluster.slice(3)
        g[n.key] = answersByPaper.get(n.key)?.[sqId] ?? null
      }
    }
    return g
  }, [cluster, visibleNodes, answersByPaper])

  // Recompute the layout when the visible set OR clustering changes. Unlike
  // the original one-shot in loadGraph, this re-runs on every drag through
  // the year slider (320 iters × O(n²), fine for n ≤ 100).
  useEffect(() => {
    if (visibleNodes.length === 0) { setPos({}); return }
    setPos(computeLayout(visibleNodes, drawn, VW, VH, groups))
  }, [visibleNodes, drawn, groups])

  // Drop stale selection when a filter/cluster change hides the picked node/edge.
  useEffect(() => {
    if (selNode && !visibleKeys.has(selNode)) setSelNode(null)
  }, [selNode, visibleKeys])
  useEffect(() => {
    if (selEdge && (!visibleKeys.has(selEdge.source) || !visibleKeys.has(selEdge.target))) {
      setSelEdge(null)
    }
  }, [selEdge, visibleKeys])

  const counts = useMemo(() => {
    const c = { supporting: 0, opposing: 0, neutral: 0 }
    for (const e of drawn) c[e.relation]++
    return c
  }, [drawn])

  const sel = selNode ? byKey.get(selNode) : null
  const selEdges = sel ? drawn.filter((e) => e.source === sel.key || e.target === sel.key) : []
  const hasNodes = visibleNodes.length > 0
  const built = graph?.built

  return (
    <div className="cite">
      <div className="cite-toolbar">
        <div className="cite-toolbar-left">
          <label className="run-picker">
            {t.concept.run}
            <select value={runId ?? ''} onChange={(e) => onRunIdChange(Number(e.target.value))}>
              {runs.map((r) => (
                <option key={r.id} value={r.id}>
                  #{r.id} · {r.query ? r.query.slice(0, 36) : t.report.noQuery} · {r.n_papers ?? '?'}p
                </option>
              ))}
            </select>
          </label>
          <button className="primary" onClick={askBuild} disabled={building || estimating || runId == null}>
            {estimating ? t.concept.estimating : building ? t.concept.building : built ? t.concept.update : t.concept.start}
          </button>
          <div className="seed-toggle" role="group" aria-label={t.concept.seedLabel} title={t.concept.seedHint}>
            <button
              className={`seed-opt${seed === 'citation' ? ' on' : ''}`}
              aria-pressed={seed === 'citation'}
              disabled={building || estimating}
              onClick={() => { setSeed('citation'); setEstimate(null) }}
            >
              {t.concept.seedCitation}
            </button>
            <button
              className={`seed-opt${seed === 'similarity' ? ' on' : ''}`}
              aria-pressed={seed === 'similarity'}
              disabled={building || estimating}
              onClick={() => { setSeed('similarity'); setEstimate(null) }}
            >
              {t.concept.seedSimilarity}
            </button>
          </div>
          {/* v0.2 Step 8b: subset-size slider — snaps to 20/40/60/80/100 */}
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 'var(--fs-sm)', color: 'var(--ink-2)' }}
                 title="Number of top-relevance papers to include in the graph. Pair count grows ~n²; the estimate re-prices live.">
            nodes:
            <input
              type="range" min={20} max={100} step={20}
              value={subsetSize}
              onChange={(e) => setSubsetSize(Number(e.target.value))}
              disabled={building}
              style={{ width: 96 }}
            />
            <span style={{ fontVariantNumeric: 'tabular-nums', minWidth: 24, textAlign: 'right', color: 'var(--ink)' }}>
              {subsetSize}
            </span>
          </label>
          {/* v0.3 cluster-by selector: seed the shared graphLayout `groups`
              param so nodes sharing the picked answer sit closer. */}
          <label className="concept-cluster" title={t.subqueries.clusterBy}>
            {t.subqueries.clusterBy}:
            <select value={cluster} onChange={(e) => setCluster(e.target.value)}>
              <option value="category">{t.subqueries.clusterCategory}</option>
              <option value="none">{t.subqueries.clusterNone}</option>
              <option value="stance">{t.subqueries.clusterStance}</option>
              {subquerySet?.subqueries.map((sq) => (
                <option key={sq.id} value={`sq:${sq.id}`}>{t.subqueries.clusterSubquery}: {sq.label}</option>
              ))}
            </select>
          </label>
          <SubqueryFilterControl rows={reportRows} value={subqueryFilter} onChange={onSubqueryFilterChange} />
        </div>
        {graph && (
          <div className="cite-stats">
            <span><b>{visibleNodes.length}</b>{yearRange && graph.n_nodes !== visibleNodes.length && (
              <span className="ink-3"> /{graph.n_nodes}</span>
            )} {t.concept.papers}</span>
            <span className="concept-stat sup"><b>{counts.supporting}</b> {t.concept.supporting}</span>
            <span className="concept-stat opp"><b>{counts.opposing}</b> {t.concept.opposing}</span>
          </div>
        )}
      </div>
      {slider}

      {estimate && (
        <div className="concept-confirm">
          <span>
            <b>{estimate.n_to_classify}</b> {t.concept.newPairs}
            {estimate.n_cached > 0 && <> ({estimate.n_cached} {t.concept.cached})</>} {t.concept.with} <b>{estimate.model}</b> · ~
            <b>${estimate.usd_est.toFixed(3)}</b>
          </span>
          <div className="concept-confirm-actions">
            <button onClick={() => setEstimate(null)}>{t.concept.cancel}</button>
            <button className="primary" onClick={runBuild} disabled={estimate.n_to_classify === 0}>
              {estimate.n_to_classify === 0 ? t.concept.upToDate : t.concept.classifyBuild}
            </button>
          </div>
        </div>
      )}

      {error && <div className="app-error cite-error">{error}</div>}
      {building && progress && (
        <ProgressBar value={progress.done} total={progress.total} label={t.concept.progressLabel} />
      )}
      {building && log.length > 0 && <pre className="run-log cite-log">{log.join('\n')}</pre>}

      <div className="cite-body">
        <div className="cite-canvas">
          {!hasNodes ? (
            <div className="cite-empty">
              <p>{t.concept.noPapers}</p>
              <p className="cite-empty-sub">{t.concept.noPapersSub}</p>
            </div>
          ) : !built && !building ? (
            <div className="cite-empty">
              <p>{t.concept.notBuilt}</p>
              <p className="cite-empty-sub">
                {t.concept.notBuiltSub}
              </p>
            </div>
          ) : (
            <svg
              ref={svgRef}
              className="cite-svg"
              viewBox={`0 0 ${VW} ${VH}`}
              preserveAspectRatio="xMidYMid meet"
              onPointerMove={onPointerMove}
              onPointerUp={() => { dragRef.current = null }}
              onClickCapture={(event) => {
                const key = (event.target as Element).closest('[data-node-key]')?.getAttribute('data-node-key')
                setSelNode(key ?? null)
                setSelEdge(null)
              }}
            >
              {drawn.map((e, i) => {
                const a = pos[e.source]
                const b = pos[e.target]
                if (!a || !b) return null
                const active = sel && (e.source === sel.key || e.target === sel.key)
                const isSel = selEdge && selEdge.source === e.source && selEdge.target === e.target
                return (
                  <line
                    key={i}
                    x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                    className={`cedge cedge-${e.relation}${active || isSel ? ' active' : ''}${(selNode || selEdge) && !active && !isSel ? ' dim' : ''}`}
                    style={{ strokeWidth: 1 + e.strength }}
                    onClick={(ev) => { ev.stopPropagation(); setSelEdge(e); setSelNode(null) }}
                  >
                    <title>{`${e.relation} (${e.strength}/3): ${e.rationale ?? ''}`}</title>
                  </line>
                )
              })}
              {visibleNodes.map((n) => {
                const p = pos[n.key]
                if (!p) return null
                const r = radius(n)
                const isSel = selNode === n.key
                const dim = (selNode || selEdge) && !isSel &&
                  !selEdges.some((e) => e.source === n.key || e.target === n.key) &&
                  !(selEdge && (selEdge.source === n.key || selEdge.target === n.key))
                return (
                  <g
                    key={n.key}
                    transform={`translate(${p.x},${p.y})`}
                    className={`cite-node cnode-${n.stance ?? 'na'}${isSel ? ' sel' : ''}${dim ? ' dim' : ''}`}
                  >
                    <CategoryPie categories={n.categories} radius={r} stance={n.stance} selected={isSel} mode={nodeColorMode} />
                    <circle
                      r={r + 7}
                      className="graph-node-hit"
                      data-node-key={n.key}
                      fill="transparent"
                      pointerEvents="all"
                      onPointerDown={(e) => onPointerDown(n.key, e)}
                      onMouseDown={(e) => { e.stopPropagation(); setSelNode(n.key); setSelEdge(null) }}
                    />
                    <text y={r + 13} className="cite-label">
                      {n.title.length > 24 ? n.title.slice(0, 23) + '…' : n.title}
                    </text>
                  </g>
                )
              })}
            </svg>
          )}
        </div>

        {(sel || selEdge) && (
          <aside className="cite-detail">
            {selEdge ? (
              <>
                <div className="cite-detail-head">
                  <h3 className={`concept-rel concept-rel-${selEdge.relation}`}>{t.concept[selEdge.relation]} · {selEdge.strength}/3</h3>
                  <button className="modal-close" onClick={() => setSelEdge(null)}>✕</button>
                </div>
                <p className="concept-rationale">{selEdge.rationale ?? '—'}</p>
                <div className="cite-detail-list">
                  <button className="cite-link" onClick={() => { setSelNode(selEdge.source); setSelEdge(null) }}>
                    {byKey.get(selEdge.source)?.title ?? selEdge.source}
                  </button>
                  <button className="cite-link" onClick={() => { setSelNode(selEdge.target); setSelEdge(null) }}>
                    {byKey.get(selEdge.target)?.title ?? selEdge.target}
                  </button>
                </div>
              </>
            ) : sel && (
              <>
                <div className="cite-detail-head">
                  <h3>{sel.title}</h3>
                  <button className="modal-close" onClick={() => setSelNode(null)}>✕</button>
                </div>
                <div className="cite-detail-sub">
                  {sel.stance && <span className={`badge stance-${sel.stance}`}>{t.stance[sel.stance]}</span>}
                  {sel.authors && <span> · {sel.authors}</span>}
                  {sel.year && <span> · {sel.year}</span>}
                  {sel.relevance != null && <span> · relevance {sel.relevance}</span>}
                </div>
                <button className="cite-pdf-btn" onClick={() => setPdf({ key: sel.key, page: 1 })}>
                  📄 {t.pdf.open}
                </button>
                {selEdges.length > 0 ? (
                  <div className="cite-detail-list">
                    <h4>{t.concept.relations}</h4>
                    {selEdges.map((e, i) => {
                      const other = e.source === sel.key ? e.target : e.source
                      return (
                        <button key={i} className={`cite-link concept-edge-${e.relation}`} onClick={() => setSelNode(other)}>
                          <span className={`concept-rel-dot concept-rel-${e.relation}`} />
                          {byKey.get(other)?.title ?? other}
                        </button>
                      )
                    })}
                  </div>
                ) : (
                  <p className="ev-none">{t.concept.noRelations}</p>
                )}
              </>
            )}
          </aside>
        )}
      </div>

      {hasNodes && built && (
        <div className="cite-legend">
          <span className="cite-legend-item"><span className="cite-legend-line sup" /> {t.concept.legendSupporting}</span>
          <span className="cite-legend-item"><span className="cite-legend-line opp" /> {t.concept.legendOpposing}</span>
          <span className="cite-legend-item">{t.concept.legendNodeColor}</span>
          <span className="cite-legend-hint">{t.concept.legendHint}</span>
        </div>
      )}

      {pdf && (
        <div className="modal-backdrop" onClick={() => setPdf(null)}>
          <div className="modal pdf-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <div className="pdf-quote">{byKey.get(pdf.key)?.title ?? pdf.key}</div>
              <button className="modal-close" onClick={() => setPdf(null)}>✕</button>
            </div>
            <PdfViewer
              pdfUrl={api.pdfUrl(pdf.key)}
              page={pdf.page}
              onPageChange={(page) => setPdf((p) => (p ? { ...p, page } : p))}
            />
          </div>
        </div>
      )}
    </div>
  )
}
