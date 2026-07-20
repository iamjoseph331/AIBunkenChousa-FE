import { useEffect, useMemo, useRef, useState } from 'react'
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnFiltersState,
  type SortingState,
} from '@tanstack/react-table'
import type { ReportRow, StanceLabel } from '../api'
import { StanceBadge, TrustStrip } from './bits'
import { useT } from '../i18n'

const col = createColumnHelper<ReportRow>()

const STANCES: StanceLabel[] = ['supportive', 'mixed', 'neutral', 'critical', 'not_addressed']

function isTyping(el: EventTarget | null): boolean {
  const n = el as HTMLElement | null
  if (!n) return false
  const tag = n.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || n.isContentEditable
}

interface Props {
  rows: ReportRow[]
  onSelect: (row: ReportRow) => void
  selectedId?: number
  embedScores?: Map<string, number>
  embedQuery?: string
  reranking?: boolean
  rerankError?: string | null
  onRerank: (query: string) => void
  onClearRerank: () => void
}

export default function ReportTable({
  rows,
  onSelect,
  selectedId,
  embedScores,
  embedQuery,
  reranking,
  rerankError,
  onRerank,
  onClearRerank,
}: Props) {
  const t = useT()
  const [sorting, setSorting] = useState<SortingState>([{ id: 'relevance_score', desc: true }])
  const [globalFilter, setGlobalFilter] = useState('')
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])
  const [rerankInput, setRerankInput] = useState('')
  const [activeIndex, setActiveIndex] = useState(-1)
  const scrollRef = useRef<HTMLDivElement>(null)
  const rowEls = useRef<(HTMLTableRowElement | null)[]>([])

  // When a re-rank lands, sort by the embedding-similarity column automatically.
  useEffect(() => {
    if (embedScores) setSorting([{ id: 'embed', desc: true }])
    else setSorting([{ id: 'relevance_score', desc: true }])
  }, [embedScores])

  const columns = useMemo(
    () => [
      // Embedding-similarity column: only present after a re-rank, so the table
      // stays clean until the user asks for it.
      ...(embedScores
        ? [
            col.accessor((r) => embedScores.get(r.paper_key) ?? -1, {
              id: 'embed',
              header: t.report.sim,
              cell: (c) => {
                const v = c.getValue()
                return <span className="num embed-cell">{v == null || v < 0 ? '—' : v}</span>
              },
              sortUndefined: 'last' as const,
            }),
          ]
        : []),
      col.accessor('filename', {
        header: t.report.paper,
        cell: (c) => <span className="cell-paper">{c.getValue() ?? c.row.original.paper_key}</span>,
        size: 260,
      }),
      col.accessor('year', {
        header: t.report.year,
        cell: (c) => <span className="num">{c.getValue() ?? '—'}</span>,
        sortUndefined: 'last',
        filterFn: (row, id, value) => !value || String(row.getValue(id)) === String(value),
      }),
      col.accessor('stance_label', {
        header: t.report.stance,
        cell: (c) => <StanceBadge label={c.getValue()} polarity={c.row.original.polarity} />,
        filterFn: (row, id, value) => !value || row.getValue(id) === value,
      }),
      col.accessor('relevance_score', {
        header: t.report.rel,
        cell: (c) => <span className="num">{c.getValue() ?? '—'}</span>,
        sortUndefined: 'last',
      }),
      col.accessor((r) => (r.n_evidence ? r.n_verified / r.n_evidence : 0), {
        id: 'trust',
        header: t.report.trust,
        cell: (c) => (
          <TrustStrip
            verified={c.row.original.n_verified}
            total={c.row.original.n_evidence}
          />
        ),
      }),
      col.accessor('confidence', {
        header: t.report.conf,
        cell: (c) => {
          const v = c.getValue()
          return <span className={`conf conf-${v ?? 'na'}`}>{v ? t.confidence[v] : '—'}</span>
        },
      }),
      col.accessor('method_type', {
        header: t.report.method,
        cell: (c) => <span className="cell-clip" title={c.getValue() ?? ''}>{c.getValue() ?? '—'}</span>,
        size: 220,
      }),
      col.accessor('location', {
        header: t.report.location,
        cell: (c) => <span className="cell-clip" title={c.getValue() ?? ''}>{c.getValue() ?? '—'}</span>,
        size: 150,
      }),
      col.accessor('quality', {
        header: t.report.extraction,
        cell: (c) => {
          const q = c.getValue()
          return <span className="num">{q == null ? '—' : `${Math.round(q * 100)}%`}</span>
        },
      }),
      col.accessor('usd', {
        header: t.report.cost,
        cell: (c) => <span className="num">{c.getValue() ? `$${c.getValue().toFixed(3)}` : '—'}</span>,
      }),
    ],
    [embedScores, t],
  )

  const table = useReactTable({
    data: rows,
    columns,
    state: { sorting, globalFilter, columnFilters },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    onColumnFiltersChange: setColumnFilters,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  })

  const modelRows = table.getRowModel().rows

  // Keyboard row navigation: ↑/↓ or j/k to move, Enter to open. Skips when the
  // user is typing in the filter / re-rank fields.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target)) return
      const n = modelRows.length
      if (!n) return
      if (e.key === 'ArrowDown' || e.key === 'j') {
        e.preventDefault()
        setActiveIndex((i) => Math.min(n - 1, i < 0 ? 0 : i + 1))
      } else if (e.key === 'ArrowUp' || e.key === 'k') {
        e.preventDefault()
        setActiveIndex((i) => Math.max(0, i < 0 ? 0 : i - 1))
      } else if (e.key === 'Enter' && activeIndex >= 0 && activeIndex < n) {
        e.preventDefault()
        onSelect(modelRows[activeIndex].original)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [modelRows, activeIndex, onSelect])

  // Keep the active row visible without using scrollIntoView.
  useEffect(() => {
    if (activeIndex < 0) return
    const c = scrollRef.current
    const el = rowEls.current[activeIndex]
    if (!c || !el) return
    const cr = c.getBoundingClientRect()
    const er = el.getBoundingClientRect()
    const headerH = 38
    if (er.top < cr.top + headerH) c.scrollTop += er.top - cr.top - headerH - 8
    else if (er.bottom > cr.bottom) c.scrollTop += er.bottom - cr.bottom + 8
  }, [activeIndex])

  // Reset the keyboard cursor when the filtered set changes.
  useEffect(() => {
    setActiveIndex(-1)
  }, [globalFilter, columnFilters, sorting, embedScores])

  const stanceFilter = (table.getColumn('stance_label')?.getFilterValue() as string) ?? ''
  const yearFilter = (table.getColumn('year')?.getFilterValue() as string) ?? ''
  const years = useMemo(
    () => [...new Set(rows.map((r) => r.year).filter((y): y is number => y != null))].sort((a, b) => b - a),
    [rows],
  )

  return (
    <div className="report">
      <div className="report-controls">
        <input
          className="search"
          placeholder={t.report.filterPapers}
          value={globalFilter}
          onChange={(e) => setGlobalFilter(e.target.value)}
        />
        <select
          className="facet"
          value={stanceFilter}
          onChange={(e) =>
            table.getColumn('stance_label')?.setFilterValue(e.target.value || undefined)
          }
        >
          <option value="">{t.report.allStances}</option>
          {STANCES.map((s) => (
            <option key={s} value={s}>{t.stance[s]}</option>
          ))}
        </select>
        <select
          className="facet"
          value={yearFilter}
          onChange={(e) => table.getColumn('year')?.setFilterValue(e.target.value || undefined)}
        >
          <option value="">{t.report.allYears}</option>
          {years.map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>

        <form
          className="rerank"
          onSubmit={(e) => {
            e.preventDefault()
            if (rerankInput.trim()) onRerank(rerankInput.trim())
          }}
        >
          <input
            className="rerank-input"
            placeholder={t.report.rerankPlaceholder}
            value={rerankInput}
            onChange={(e) => setRerankInput(e.target.value)}
            disabled={reranking}
          />
          <button type="submit" disabled={reranking || !rerankInput.trim()}>
            {reranking ? '…' : t.report.rerank}
          </button>
          {embedScores && (
            <button
              type="button"
              className="link"
              onClick={() => {
                setRerankInput('')
                onClearRerank()
              }}
            >
              {t.report.clear}
            </button>
          )}
        </form>

        <span className="report-count">{modelRows.length} / {rows.length}</span>
      </div>
      <div className="kbd-hint" aria-hidden="true">{t.report.hintKeys}</div>
      {embedQuery && (
        <div className="rerank-note">
          {t.report.rerankNotePre} <b>“{embedQuery}”</b> {t.report.rerankNotePost}
        </div>
      )}
      {rerankError && <div className="rerank-err">{t.report.rerankFailed} {rerankError}</div>}
      <div className="table-scroll" ref={scrollRef}>
        <table className="report-table">
          <thead>
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((h) => (
                  <th
                    key={h.id}
                    onClick={h.column.getToggleSortingHandler()}
                    style={{ width: h.getSize() }}
                    className={h.column.getCanSort() ? 'sortable' : ''}
                  >
                    {flexRender(h.column.columnDef.header, h.getContext())}
                    {{ asc: ' ▲', desc: ' ▼' }[h.column.getIsSorted() as string] ?? ''}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {modelRows.map((row, i) => (
              <tr
                key={row.id}
                ref={(el) => { rowEls.current[i] = el }}
                onClick={() => { setActiveIndex(i); onSelect(row.original) }}
                className={
                  (row.original.id === selectedId ? 'row-selected' : '') +
                  (i === activeIndex ? ' row-active' : '')
                }
              >
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>
                ))}
              </tr>
            ))}
            {modelRows.length === 0 && (
              <tr><td colSpan={columns.length} className="empty">{t.report.noMatch}</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
