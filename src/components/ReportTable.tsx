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
import {
  scoreRows,
  loadWeights,
  saveWeights,
  DEFAULT_WEIGHTS,
  type ImportanceWeights,
  type Scored,
} from '../importance'
import { categoryClass } from '../categoryColor'

const col = createColumnHelper<ReportRow>()

const STANCES: StanceLabel[] = ['supportive', 'mixed', 'neutral', 'critical', 'not_addressed']

/** Stable 32-bit-ish hash for turning category ids into a 1..10 color slot when
 * we don't have the canonical color_slot on the row (the current join returns
 * the slot only via the CategoriesPayload, not per-row). Deterministic across
 * runs so the same category always gets the same color. */
function hashString(s: string): number {
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h) ^ s.charCodeAt(i)
  return h >>> 0
}

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
  // v0.2: default sort is by importance (weighted blend), replacing relevance_score.
  const [sorting, setSorting] = useState<SortingState>([{ id: 'importance', desc: true }])
  const [globalFilter, setGlobalFilter] = useState('')
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])
  const [rerankInput, setRerankInput] = useState('')
  const [activeIndex, setActiveIndex] = useState(-1)
  const [weights, setWeights] = useState<ImportanceWeights>(() => loadWeights())
  const scrollRef = useRef<HTMLDivElement>(null)
  const rowEls = useRef<(HTMLTableRowElement | null)[]>([])

  // When a re-rank lands, sort by the embedding-similarity column automatically.
  useEffect(() => {
    if (embedScores) setSorting([{ id: 'embed', desc: true }])
    else setSorting([{ id: 'importance', desc: true }])
  }, [embedScores])

  useEffect(() => { saveWeights(weights) }, [weights])
  const importanceMap = useMemo(() => scoreRows(rows, weights), [rows, weights])
  const setW = (patch: Partial<ImportanceWeights>) => setWeights((w) => ({ ...w, ...patch }))

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
      // v0.2 importance (Step 3) — first column so the default sort is visible.
      col.accessor((r) => importanceMap.get(r.paper_key)?.importance ?? 0, {
        id: 'importance',
        header: t.report.importance,
        cell: (c) => {
          const s: Scored | undefined = importanceMap.get(c.row.original.paper_key)
          const v = s?.importance ?? 0
          return (
            <span className={`cell-importance${s && !s.hasCitationData ? ' no-cite' : ''}`}
                  title={s && !s.hasCitationData ? t.report.noCitationDataMark : undefined}>
              <span className="imp-num">{Math.round(v * 100)}</span>
              <span className="imp-track"><span className="imp-fill" style={{ width: `${Math.round(v * 100)}%` }} /></span>
            </span>
          )
        },
        sortUndefined: 'last',
      }),
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
      // v0.2 categories (Step 7). Chips list — filter by presence of a specific category id.
      col.accessor(
        (r) => (r.categories && r.categories.length ? r.categories.map((c) => c.category_id).join(',') : ''),
        {
          id: 'categories',
          header: t.report.categories,
          cell: (c) => {
            const cats = c.row.original.categories
            if (!cats || cats.length === 0) return <span className="ink-3">—</span>
            return (
              <span className="cat-chips">
                {cats.slice(0, 4).map((cat) => {
                  // Recover the color slot from the id string via a stable hash into 1..10.
                  const slot = ((hashString(cat.category_id) % 10) + 10) % 10 + 1
                  return (
                    <span
                      key={cat.category_id}
                      className={`cat-chip ${categoryClass(slot)} ${cat.is_primary ? 'primary' : 'secondary'}`}
                      title={`${cat.name}${cat.is_primary ? ' (primary)' : ''}`}
                    >
                      {cat.name}
                    </span>
                  )
                })}
                {cats.length > 4 && <span className="cat-chip secondary">+{cats.length - 4}</span>}
              </span>
            )
          },
          filterFn: (row, _id, value) => {
            if (!value) return true
            const cats = row.original.categories
            return !!cats && cats.some((c) => c.category_id === value)
          },
          size: 240,
        },
      ),
      // v0.2 enrichment columns (Step 1)
      col.accessor('cited_by_count', {
        header: t.report.citations,
        cell: (c) => {
          const v = c.getValue()
          return <span className="num">{v == null ? '—' : v.toLocaleString()}</span>
        },
        sortUndefined: 'last',
      }),
      col.accessor('pub_type', {
        header: t.report.pubType,
        cell: (c) => {
          const v = c.getValue()
          return <span className="cell-clip" title={v ?? ''}>{v ?? '—'}</span>
        },
        filterFn: (row, id, value) => !value || row.getValue(id) === value,
      }),
      col.accessor('venue_name', {
        header: t.report.venue,
        cell: (c) => <span className="cell-clip" title={c.getValue() ?? ''}>{c.getValue() ?? '—'}</span>,
        size: 180,
      }),
      col.accessor('primary_field', {
        header: t.report.field,
        cell: (c) => <span className="cell-clip" title={c.getValue() ?? ''}>{c.getValue() ?? '—'}</span>,
        filterFn: (row, id, value) => !value || row.getValue(id) === value,
        size: 140,
      }),
      col.accessor((r) => (r.author_countries || []).join(','), {
        id: 'author_countries',
        header: t.report.authorCountries,
        cell: (c) => {
          const cs = c.row.original.author_countries
          if (!cs || cs.length === 0) return <span className="ink-3">—</span>
          return <span className="cell-clip" title={cs.join(', ')}>{cs.join(' ')}</span>
        },
        size: 140,
      }),
      col.accessor((r) => (r.target_countries || []).join(','), {
        id: 'target_countries',
        header: t.report.targetCountries,
        cell: (c) => {
          const cs = c.row.original.target_countries
          if (!cs || cs.length === 0) return <span className="ink-3">—</span>
          return <span className="cell-clip" title={cs.join(', ')}>{cs.join(' ')}</span>
        },
        size: 140,
      }),
      col.accessor('method_type', {
        header: t.report.method,
        cell: (c) => <span className="cell-clip" title={c.getValue() ?? ''}>{c.getValue() ?? '—'}</span>,
        size: 200,
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
    [embedScores, t, importanceMap],
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
  const typeFilter = (table.getColumn('pub_type')?.getFilterValue() as string) ?? ''
  const fieldFilter = (table.getColumn('primary_field')?.getFilterValue() as string) ?? ''
  const catFilter = (table.getColumn('categories')?.getFilterValue() as string) ?? ''
  const years = useMemo(
    () => [...new Set(rows.map((r) => r.year).filter((y): y is number => y != null))].sort((a, b) => b - a),
    [rows],
  )
  const types = useMemo(
    () => [...new Set(rows.map((r) => r.pub_type).filter((v): v is string => !!v))].sort(),
    [rows],
  )
  const fields = useMemo(
    () => [...new Set(rows.map((r) => r.primary_field).filter((v): v is string => !!v))].sort(),
    [rows],
  )
  const catFacets = useMemo(() => {
    const m = new Map<string, string>()
    for (const r of rows) for (const c of r.categories || []) m.set(c.category_id, c.name)
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]))
  }, [rows])

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
        {types.length > 0 && (
          <select
            className="facet"
            value={typeFilter}
            onChange={(e) => table.getColumn('pub_type')?.setFilterValue(e.target.value || undefined)}
          >
            <option value="">{t.report.allTypes}</option>
            {types.map((v) => (
              <option key={v} value={v}>{v}</option>
            ))}
          </select>
        )}
        {fields.length > 0 && (
          <select
            className="facet"
            value={fieldFilter}
            onChange={(e) => table.getColumn('primary_field')?.setFilterValue(e.target.value || undefined)}
          >
            <option value="">{t.report.allFields}</option>
            {fields.map((v) => (
              <option key={v} value={v}>{v}</option>
            ))}
          </select>
        )}
        {catFacets.length > 0 && (
          <select
            className="facet"
            value={catFilter}
            onChange={(e) => table.getColumn('categories')?.setFilterValue(e.target.value || undefined)}
          >
            <option value="">{t.report.allCategories}</option>
            {catFacets.map(([id, name]) => (
              <option key={id} value={id}>{name}</option>
            ))}
          </select>
        )}

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
      <div className="imp-sliders">
        <label>
          {t.report.weightCitations}
          <input
            type="range" min="0" max="1" step="0.05"
            value={weights.citations}
            onChange={(e) => setW({ citations: Number(e.target.value) })}
          />
          <span className="val">{weights.citations.toFixed(2)}</span>
        </label>
        <label>
          {t.report.weightRecency}
          <input
            type="range" min="0" max="1" step="0.05"
            value={weights.recency}
            onChange={(e) => setW({ recency: Number(e.target.value) })}
          />
          <span className="val">{weights.recency.toFixed(2)}</span>
        </label>
        <label>
          {t.report.weightRelevance}
          <input
            type="range" min="0" max="1" step="0.05"
            value={weights.relevance}
            onChange={(e) => setW({ relevance: Number(e.target.value) })}
          />
          <span className="val">{weights.relevance.toFixed(2)}</span>
        </label>
        <button className="imp-reset" onClick={() => setWeights(DEFAULT_WEIGHTS)}>
          {t.report.resetWeights}
        </button>
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
