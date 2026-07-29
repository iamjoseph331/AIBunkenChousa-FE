import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { api, type ReportRow, type Run, type RunDetail } from '../api'
import ReportTable from './ReportTable'
import DetailDrawer from './DetailDrawer'
import NewRunForm from './NewRunForm'
import AddPapersForm from './AddPapersForm'
import PdfViewer from './PdfViewer'
import { useT } from '../i18n'
import { formatDuration, type YearRange } from '../time'
import type { ImportanceWeights } from '../importance'
import type { SubqueryFilter } from '../subqueryFilter'

interface PdfState {
  key: string
  page: number
  quote: string
}

/** The report surface: run picker, sortable/filterable table, provenance drawer,
 * pdf click-through, and the free embedding re-rank. Extracted from App so the
 * top-level shell can host Home / Report / Citations tabs.
 *
 * v0.3: runId is now controlled by App so switching runs here also switches
 * Geo/Stats/Concepts, and the App-level year slider is threaded in as filter
 * props. */
interface Props {
  runId: number | null
  onRunIdChange: (id: number) => void
  weights: ImportanceWeights
  countryFilter?: { codes: string[]; label: string; mode: 'author' | 'target' } | null
  onClearCountryFilter: () => void
  yearRange: YearRange | null
  includeUndated: boolean
  subqueryFilter: SubqueryFilter | null
  /** App-rendered TimelineSlider; view renders it directly under its own run picker. */
  slider?: ReactNode
}

export default function ReportView({
  runId, onRunIdChange, weights, countryFilter, onClearCountryFilter,
  yearRange, includeUndated, subqueryFilter, slider,
}: Props) {
  const t = useT()
  const [runs, setRuns] = useState<Run[]>([])
  const [detail, setDetail] = useState<RunDetail | null>(null)
  const [selected, setSelected] = useState<ReportRow | null>(null)
  const [pdf, setPdf] = useState<PdfState | null>(null)
  const [showNewRun, setShowNewRun] = useState(false)
  const [showAddPapers, setShowAddPapers] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [embed, setEmbed] = useState<{ query: string; scores: Map<string, number> } | null>(null)
  const [reranking, setReranking] = useState(false)
  const [rerankError, setRerankError] = useState<string | null>(null)

  const loadRuns = useCallback(async (selectId?: number) => {
    try {
      const rs = await api.runs()
      setRuns(rs)
      // If nothing is selected yet, adopt the newest run so the picker is not blank.
      if (selectId != null) onRunIdChange(selectId)
      else if (runId == null && rs.length > 0) onRunIdChange(rs[0].id)
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e))
    }
  }, [onRunIdChange, runId])

  useEffect(() => {
    loadRuns()
    // Load once on mount; subsequent refreshes happen via explicit loadRuns(id).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (runId == null) return
    setSelected(null)
    setEmbed(null)
    setRerankError(null)
    api.run(runId).then(setDetail, (e) => setError(String(e)))
  }, [runId])

  // Esc closes the topmost surface: pdf modal → new-run modal → detail drawer.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape') return
      if (pdf) setPdf(null)
      else if (showAddPapers) setShowAddPapers(false)
      else if (showNewRun) setShowNewRun(false)
      else if (selected) setSelected(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [pdf, showNewRun, showAddPapers, selected])

  const doRerank = useCallback(
    async (query: string) => {
      if (runId == null) return
      setReranking(true)
      setRerankError(null)
      try {
        const res = await api.rerank(runId, query)
        setEmbed({ query, scores: new Map(res.scores.map((s) => [s.paper_key, s.embed_relevance])) })
      } catch (e) {
        setRerankError(String(e instanceof Error ? e.message : e))
      } finally {
        setReranking(false)
      }
    },
    [runId],
  )

  const currentRun = runs.find((r) => r.id === runId)

  return (
    <>
      <div className="subtoolbar">
        <label className="run-picker">
          {t.report.runLabel}
          <select value={runId ?? ''} onChange={(e) => { onClearCountryFilter(); onRunIdChange(Number(e.target.value)) }}>
            {runs.map((r) => (
              <option key={r.id} value={r.id}>
                #{r.id} · {r.query ? r.query.slice(0, 40) : t.report.noQuery} · {r.n_papers ?? '?'}p · {r.status}
              </option>
            ))}
          </select>
        </label>
        {runId != null && (
          <span className="export-links">
            <a href={api.exportUrl(runId, 'xlsx')}>xlsx</a>
            <a href={api.exportUrl(runId, 'csv')}>csv</a>
          </span>
        )}
        {runId != null && (
          <button className="subtoolbar-cta" onClick={() => setShowAddPapers(true)}>{t.report.addPapers}</button>
        )}
        <button className="primary subtoolbar-cta" onClick={() => setShowNewRun(true)}>{t.report.newRun}</button>
      </div>

      {slider}

      {error && <div className="app-error">{error}</div>}

      {currentRun && (
        <div className="run-meta">
          <span>{t.report.query}: <b>{currentRun.query ?? '—'}</b></span>
          <span>{t.report.model}: {currentRun.model}</span>
          <span>{t.report.lang}: {currentRun.lang}</span>
          <span>{t.report.mode}: {currentRun.mode}</span>
          <span>{t.report.total}: ${currentRun.total_usd.toFixed(3)}</span>
          <span>{t.report.time}: {formatDuration(currentRun.elapsed_seconds)}</span>
          {currentRun.status !== 'done' && <span className={`run-status ${currentRun.status}`}>{currentRun.status}</span>}
        </div>
      )}

      <main className={selected ? 'main with-drawer' : 'main'}>
        <div className="table-pane">
          {detail ? (
            <ReportTable
              rows={detail.report}
              onSelect={setSelected}
              selectedId={selected?.id}
              embedScores={embed?.scores}
              embedQuery={embed?.query}
              reranking={reranking}
              rerankError={rerankError}
              onRerank={doRerank}
              onClearRerank={() => {
                setEmbed(null)
                setRerankError(null)
              }}
              weights={weights}
              countryFilter={countryFilter}
              onClearCountryFilter={onClearCountryFilter}
              yearRange={yearRange}
              includeUndated={includeUndated}
              subqueryFilter={subqueryFilter}
            />
          ) : (
            <div className="loading">{runs.length ? t.report.loadingRun : t.report.noRuns}</div>
          )}
        </div>

        {selected && (
          <DetailDrawer
            analysisId={selected.id}
            paperKey={selected.paper_key}
            runId={runId}
            onClose={() => setSelected(null)}
            onOpenPdf={(key, page, quote) => setPdf({ key, page, quote })}
          />
        )}
      </main>

      {pdf && (
        <div className="modal-backdrop" onClick={() => setPdf(null)}>
          <div className="modal pdf-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <div className="pdf-quote">“{pdf.quote}”</div>
              <button className="modal-close" onClick={() => setPdf(null)}>✕</button>
            </div>
            <PdfViewer
              pdfUrl={api.pdfUrl(pdf.key)}
              page={pdf.page}
              quote={pdf.quote}
              onPageChange={(page) => setPdf((p) => (p ? { ...p, page } : p))}
            />
          </div>
        </div>
      )}

      {showNewRun && (
        <NewRunForm
          onClose={() => setShowNewRun(false)}
          onDone={(id) => {
            setShowNewRun(false)
            loadRuns(id)
          }}
        />
      )}

      {showAddPapers && runId != null && (
        <AddPapersForm
          runId={runId}
          onClose={() => setShowAddPapers(false)}
          onDone={() => {
            // Reload the run detail + run list so the new papers and updated
            // totals appear; keep the modal open so its log stays visible.
            api.run(runId).then(setDetail, (e) => setError(String(e)))
            loadRuns(runId)
          }}
        />
      )}
    </>
  )
}
