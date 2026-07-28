import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api, type CitationGraph as Graph, type ExternalRef, type GraphNode } from '../api'
import { computeLayout, type Pos } from './graphLayout'
import { useT } from '../i18n'
import ProgressBar from './ProgressBar'
import PdfViewer from './PdfViewer'

const VW = 960
const VH = 620

function radius(n: GraphNode): number {
  return 8 + Math.min(n.in_degree, 8) * 3.5
}

export default function CitationGraph() {
  const t = useT()
  const [graph, setGraph] = useState<Graph | null>(null)
  const [grobid, setGrobid] = useState<{ alive: boolean; url: string } | null>(null)
  const [building, setBuilding] = useState(false)
  const [progress, setProgress] = useState<{ done: number; total: number | null } | null>(null)
  const [log, setLog] = useState<string[]>([])
  const [buildError, setBuildError] = useState<{ msg: string; grobid?: boolean } | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [externals, setExternals] = useState<ExternalRef[] | null>(null)
  const [hideIsolated, setHideIsolated] = useState(true)
  const [pdf, setPdf] = useState<{ key: string; page: number } | null>(null)
  const [pos, setPos] = useState<Record<string, Pos>>({})
  const svgRef = useRef<SVGSVGElement | null>(null)
  const esRef = useRef<EventSource | null>(null)
  const dragRef = useRef<string | null>(null)

  const refreshGrobid = useCallback(async () => {
    try {
      setGrobid(await api.grobidStatus())
    } catch { /* leave prior status */ }
  }, [])

  const loadGraph = useCallback(async () => {
    try {
      const g = await api.citationGraph()
      setGraph(g)
    } catch (e) {
      setBuildError({ msg: String(e instanceof Error ? e.message : e) })
    }
  }, [])

  useEffect(() => {
    refreshGrobid()
    loadGraph()
    return () => esRef.current?.close()
  }, [refreshGrobid, loadGraph])

  useEffect(() => {
    if (!selected) { setExternals(null); return }
    api.externalRefs(selected).then(setExternals, () => setExternals([]))
  }, [selected])

  function build(keys?: string[]) {
    setBuilding(true)
    setBuildError(null)
    setLog([])
    setProgress({ done: 0, total: null })
    const es = new EventSource(api.citationEventsUrl())
    esRef.current = es
    const add = (line: string) => setLog((l) => [...l, line])
    const step = () => setProgress((p) => (p ? { ...p, done: p.done + 1 } : p))
    const on = (name: string, fn: (d: any) => void) =>
      es.addEventListener(name, (e) => fn(JSON.parse((e as MessageEvent).data)))

    on('hello', () => add('▶ building citation graph…'))
    on('start', (d) => setProgress({ done: 0, total: d.total ?? null }))
    on('cited', (d) => { add(`✓ ${d.title ?? d.key} — ${d.n_refs} refs`); step() })
    on('cite_error', (d) => { add(`✗ ${d.key}: ${d.error}`); step() })
    on('matched', (d) => add(`● matched ${d.edges} intra-corpus edges`))
    on('done', () => {
      add('● done')
      es.close()
      setBuilding(false)
      setProgress(null)
      refreshGrobid()
      loadGraph()
    })
    on('error', (d) => {
      add(`● error — ${d.error}`)
      es.close()
      setBuilding(false)
      setProgress(null)
      setBuildError({ msg: d.error, grobid: d.grobid })
    })
    es.onerror = () => { es.close(); setBuilding(false); setProgress(null) }

    api.buildCitations(keys).catch((e) => {
      es.close()
      setBuilding(false)
      setBuildError({ msg: String(e instanceof Error ? e.message : e) })
    })
  }

  // --- drag (screen → viewBox coords) ---------------------------------------
  const toSvg = useCallback((clientX: number, clientY: number): Pos => {
    const svg = svgRef.current
    if (!svg) return { x: 0, y: 0 }
    const pt = svg.createSVGPoint()
    pt.x = clientX; pt.y = clientY
    const ctm = svg.getScreenCTM()
    if (!ctm) return { x: 0, y: 0 }
    const p = pt.matrixTransform(ctm.inverse())
    return { x: p.x, y: p.y }
  }, [])

  function onPointerDown(key: string, e: React.PointerEvent) {
    e.stopPropagation()
    dragRef.current = key
    setSelected(key)
    ;(e.target as Element).setPointerCapture?.(e.pointerId)
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!dragRef.current) return
    const p = toSvg(e.clientX, e.clientY)
    setPos((prev) => ({ ...prev, [dragRef.current as string]: p }))
  }
  function onPointerUp() { dragRef.current = null }

  const byKey = useMemo(() => new Map((graph?.nodes ?? []).map((n) => [n.key, n])), [graph])
  const sel = selected ? byKey.get(selected) : null
  const edges = graph?.edges ?? []
  const cites = sel ? edges.filter((e) => e.source === sel.key) : []
  const citedBy = sel ? edges.filter((e) => e.target === sel.key) : []
  const hasGraph = graph && graph.nodes.length > 0
  const built = (graph?.n_processed ?? 0) > 0
  // Papers not yet run through GROBID (no meta row → null status) — the incremental
  // targets. Only their references get resolved; existing matches stay put.
  const newKeys = useMemo(
    () => (graph?.nodes ?? []).filter((n) => !n.status).map((n) => n.key),
    [graph],
  )

  // isolated = no incoming and no outgoing intra-corpus citation
  const isolatedCount = useMemo(
    () => (graph?.nodes ?? []).filter((n) => n.in_degree === 0 && n.out_degree === 0).length,
    [graph],
  )
  const visibleNodes = useMemo(() => {
    const ns = graph?.nodes ?? []
    return hideIsolated ? ns.filter((n) => n.in_degree > 0 || n.out_degree > 0) : ns
  }, [graph, hideIsolated])
  const visibleKeys = useMemo(() => new Set(visibleNodes.map((n) => n.key)), [visibleNodes])
  const visibleEdges = useMemo(
    () => (graph?.edges ?? []).filter((e) => visibleKeys.has(e.source) && visibleKeys.has(e.target)),
    [graph, visibleKeys],
  )

  // (re)compute the force layout over the currently-visible subset — hiding
  // isolated nodes rearranges the survivors to fill the canvas.
  useEffect(() => {
    if (visibleNodes.length) setPos(computeLayout(visibleNodes, visibleEdges, VW, VH))
  }, [visibleNodes, visibleEdges])

  // if the selected node gets hidden, drop the selection
  useEffect(() => {
    if (selected && !visibleKeys.has(selected)) setSelected(null)
  }, [selected, visibleKeys])

  return (
    <div className="cite">
      <div className="cite-toolbar">
        <div className="cite-toolbar-left">
          <button className="primary" onClick={() => build()} disabled={building}>
            {building ? t.cite.building : built ? t.cite.rebuild : t.cite.build}
          </button>
          {built && newKeys.length > 0 && (
            <button onClick={() => build(newKeys)} disabled={building}>
              {t.cite.update} ({newKeys.length})
            </button>
          )}
          <span className={`grobid-chip ${grobid?.alive ? 'up' : 'down'}`} title={grobid?.url}>
            <span className="grobid-dot" /> {grobid?.alive ? t.cite.grobidUp : t.cite.grobidDown}
          </span>
          {!grobid?.alive && (
            <button onClick={refreshGrobid}>{t.cite.recheck}</button>
          )}
          {hasGraph && (isolatedCount > 0 || hideIsolated) && (
            <button
              className={`cite-toggle${hideIsolated ? ' on' : ''}`}
              aria-pressed={hideIsolated}
              onClick={() => setHideIsolated((v) => !v)}
            >
              {hideIsolated ? t.cite.showAll : `${t.cite.hideIsolated} (${isolatedCount})`}
            </button>
          )}
        </div>
        {graph && (
          <div className="cite-stats">
            <span><b>{graph.n_processed}</b>/{graph.n_papers} {t.cite.processed}</span>
            <span><b>{edges.length}</b> {t.cite.edges}</span>
          </div>
        )}
      </div>

      {buildError && (
        <div className="app-error cite-error">
          {buildError.msg}
          {buildError.grobid && (
            <div className="grobid-hint">
              {t.cite.grobidHint} <b>{t.cite.recheck}</b>:
              <code>docker run --rm -p 8070:8070 lfoppiano/grobid:0.8.0</code>
            </div>
          )}
        </div>
      )}

      {building && progress && (
        <ProgressBar value={progress.done} total={progress.total} label={t.cite.progressLabel} />
      )}
      {log.length > 0 && building && <pre className="run-log cite-log">{log.join('\n')}</pre>}

      <div className="cite-body">
        <div className="cite-canvas">
          {!hasGraph ? (
            <div className="cite-empty">
              <p>{t.cite.noGraph}</p>
              <p className="cite-empty-sub">
                {graph && graph.n_papers === 0 ? t.cite.noGraphRunFirst : t.cite.noGraphBuild}
              </p>
            </div>
          ) : (
            <svg
              ref={svgRef}
              className="cite-svg"
              viewBox={`0 0 ${VW} ${VH}`}
              preserveAspectRatio="xMidYMid meet"
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onClick={() => setSelected(null)}
            >
              <defs>
                <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                  <path d="M0,0 L10,5 L0,10 z" className="cite-arrow" />
                </marker>
              </defs>
              {visibleEdges.map((e, i) => {
                const a = pos[e.source]
                const b = pos[e.target]
                if (!a || !b) return null
                const rb = radius(byKey.get(e.target)!)
                // shorten the line so the arrowhead lands at the node's edge
                const dx = b.x - a.x, dy = b.y - a.y
                const d = Math.hypot(dx, dy) || 1
                const bx = b.x - (dx / d) * (rb + 6)
                const by = b.y - (dy / d) * (rb + 6)
                const active = sel && (e.source === sel.key || e.target === sel.key)
                return (
                  <line
                    key={i}
                    x1={a.x} y1={a.y} x2={bx} y2={by}
                    className={`cite-edge${active ? ' active' : ''}${selected && !active ? ' dim' : ''}`}
                    markerEnd="url(#arrow)"
                  />
                )
              })}
              {visibleNodes.map((n) => {
                const p = pos[n.key]
                if (!p) return null
                const r = radius(n)
                const isSel = selected === n.key
                const dim = selected && !isSel && !cites.some((e) => e.target === n.key) && !citedBy.some((e) => e.source === n.key)
                return (
                  <g
                    key={n.key}
                    transform={`translate(${p.x},${p.y})`}
                    className={`cite-node${isSel ? ' sel' : ''}${dim ? ' dim' : ''}${n.in_degree > 0 ? ' cited' : ''}`}
                    onPointerDown={(e) => onPointerDown(n.key, e)}
                    onClick={(e) => { e.stopPropagation(); setSelected(n.key) }}
                  >
                    <circle r={r} className="cite-circle" />
                    <text y={r + 13} className="cite-label">
                      {(n.title.length > 26 ? n.title.slice(0, 25) + '…' : n.title)}
                    </text>
                  </g>
                )
              })}
            </svg>
          )}
        </div>

        {sel && (
          <aside className="cite-detail">
            <div className="cite-detail-head">
              <h3>{sel.title}</h3>
              <button className="modal-close" onClick={() => setSelected(null)}>✕</button>
            </div>
            <div className="cite-detail-sub">
              {sel.authors && <span>{sel.authors}</span>}
              {sel.year && <span> · {sel.year}</span>}
            </div>
            <div className="cite-detail-stats">
              <span><b>{sel.in_degree}</b> {t.cite.inDegree}</span>
              <span><b>{sel.out_degree}</b> {t.cite.outDegree}</span>
              <span><b>{sel.external_refs}</b> {t.cite.extRefs}</span>
            </div>
            <button className="cite-pdf-btn" onClick={() => setPdf({ key: sel.key, page: 1 })}>
              📄 {t.pdf.open}
            </button>
            {citedBy.length > 0 && (
              <div className="cite-detail-list">
                <h4>{t.cite.citedBy}</h4>
                {citedBy.map((e, i) => (
                  <button key={i} className="cite-link" onClick={() => setSelected(e.source)}>
                    {byKey.get(e.source)?.title ?? e.source}
                  </button>
                ))}
              </div>
            )}
            {cites.length > 0 && (
              <div className="cite-detail-list">
                <h4>{t.cite.cites}</h4>
                {cites.map((e, i) => (
                  <button key={i} className="cite-link" onClick={() => setSelected(e.target)}>
                    {byKey.get(e.target)?.title ?? e.target}
                  </button>
                ))}
              </div>
            )}
            {externals && externals.length > 0 && (
              <div className="cite-detail-list">
                <h4>{t.cite.externalRefs} ({externals.length})</h4>
                <ul className="cite-ext-list">
                  {externals.slice(0, 40).map((r, i) => (
                    <li key={i}>{r.title || r.raw || t.cite.untitledRef}{r.year ? ` (${r.year})` : ''}</li>
                  ))}
                </ul>
              </div>
            )}
          </aside>
        )}
      </div>

      {hasGraph && (
        <div className="cite-legend">
          <span className="cite-legend-item"><span className="cite-legend-dot cited" /> {t.cite.legendCited}</span>
          <span className="cite-legend-item"><span className="cite-legend-dot" /> {t.cite.legendNotCited}</span>
          <span className="cite-legend-item"><span className="cite-legend-arrow">→</span> {t.cite.legendCites}</span>
          <span className="cite-legend-hint">{t.cite.legendHint}</span>
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
