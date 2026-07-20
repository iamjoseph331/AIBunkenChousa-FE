import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  api,
  type ConceptEdge,
  type ConceptEstimate,
  type ConceptGraphData,
  type ConceptNode,
  type ConceptSeed,
  type Run,
} from '../api'
import { computeLayout, type Pos } from './graphLayout'
import { useT } from '../i18n'
import ProgressBar from './ProgressBar'
import PdfViewer from './PdfViewer'

const VW = 960
const VH = 620

function radius(n: ConceptNode): number {
  return 9 + ((n.relevance ?? 0) / 100) * 10
}

/** Phase 3 concept graph. Nodes are a run's most-relevant papers (colored by stance
 * toward the query, sized by relevance); edges are LLM-classified relations between
 * papers' claims — blue = supporting, red = opposing (neutral pairs aren't drawn).
 * The build costs money, so it is gated behind an explicit Start + cost-confirm. */
export default function ConceptGraph() {
  const t = useT()
  const [runs, setRuns] = useState<Run[]>([])
  const [runId, setRunId] = useState<number | null>(null)
  const [graph, setGraph] = useState<ConceptGraphData | null>(null)
  const [pos, setPos] = useState<Record<string, Pos>>({})
  const [estimate, setEstimate] = useState<ConceptEstimate | null>(null)
  const [seed, setSeed] = useState<ConceptSeed>('citation')
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
      setRunId((cur) => cur ?? rs[0]?.id ?? null)
    }, (e) => setError(String(e)))
    return () => esRef.current?.close()
  }, [])

  const loadGraph = useCallback(async (id: number) => {
    try {
      const g = await api.conceptGraph(id)
      setGraph(g)
      setPos(computeLayout(g.nodes, g.edges.filter((e) => e.relation !== 'neutral'), VW, VH))
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e))
    }
  }, [])

  useEffect(() => {
    if (runId == null) return
    setSelNode(null)
    setSelEdge(null)
    setEstimate(null)
    loadGraph(runId)
  }, [runId, loadGraph])

  async function askBuild() {
    if (runId == null) return
    setEstimating(true)
    setError(null)
    try {
      setEstimate(await api.conceptEstimate(runId, seed))
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
      loadGraph(runId)
    })
    on('error', (d) => {
      add(`● error — ${d.error}`)
      es.close()
      setBuilding(false)
      setProgress(null)
      setError(d.error)
    })
    es.onerror = () => { es.close(); setBuilding(false); setProgress(null) }

    api.buildConcept(runId, seed).catch((e) => {
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

  const byKey = useMemo(() => new Map((graph?.nodes ?? []).map((n) => [n.key, n])), [graph])
  const drawn = useMemo(() => (graph?.edges ?? []).filter((e) => e.relation !== 'neutral'), [graph])
  const counts = useMemo(() => {
    const c = { supporting: 0, opposing: 0, neutral: 0 }
    for (const e of graph?.edges ?? []) c[e.relation]++
    return c
  }, [graph])

  const sel = selNode ? byKey.get(selNode) : null
  const selEdges = sel ? drawn.filter((e) => e.source === sel.key || e.target === sel.key) : []
  const hasNodes = graph && graph.nodes.length > 0
  const built = graph?.built

  return (
    <div className="cite">
      <div className="cite-toolbar">
        <div className="cite-toolbar-left">
          <label className="run-picker">
            {t.concept.run}
            <select value={runId ?? ''} onChange={(e) => setRunId(Number(e.target.value))}>
              {runs.map((r) => (
                <option key={r.id} value={r.id}>
                  #{r.id} · {r.query ? r.query.slice(0, 36) : t.report.noQuery} · {r.n_papers ?? '?'}p
                </option>
              ))}
            </select>
          </label>
          <button className="primary" onClick={askBuild} disabled={building || estimating || runId == null}>
            {estimating ? t.concept.estimating : building ? t.concept.building : built ? t.concept.rebuild : t.concept.start}
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
        </div>
        {graph && (
          <div className="cite-stats">
            <span><b>{graph.n_nodes}</b> {t.concept.papers}</span>
            <span className="concept-stat sup"><b>{counts.supporting}</b> {t.concept.supporting}</span>
            <span className="concept-stat opp"><b>{counts.opposing}</b> {t.concept.opposing}</span>
          </div>
        )}
      </div>

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
              onClick={() => { setSelNode(null); setSelEdge(null) }}
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
              {graph!.nodes.map((n) => {
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
                    onPointerDown={(e) => onPointerDown(n.key, e)}
                    onClick={(e) => { e.stopPropagation(); setSelNode(n.key); setSelEdge(null) }}
                  >
                    <circle r={r} className="cnode-circle" />
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
