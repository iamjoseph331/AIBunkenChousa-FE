// v0.2 Step 3: paper importance = tunable blend of citations, recency, and
// relevance. Computed client-side so the three sliders in the Report toolbar
// re-sort instantly. Inputs all come from a ReportRow that already has the
// OpenAlex enrichment join (Step 1b), so this file has no network dependency.

import type { ReportRow } from './api'

export interface ImportanceWeights {
  citations: number    // 0..1
  recency: number      // 0..1
  relevance: number    // 0..1
}

export const DEFAULT_WEIGHTS: ImportanceWeights = {
  citations: 0.35,
  recency: 0.15,
  relevance: 0.50,
}

export const WEIGHTS_STORAGE_KEY = 'aibc-importance-weights'

export function loadWeights(): ImportanceWeights {
  try {
    const raw = localStorage.getItem(WEIGHTS_STORAGE_KEY)
    if (!raw) return DEFAULT_WEIGHTS
    const w = JSON.parse(raw)
    // Guard against corrupted values — fall back to defaults on any mismatch.
    if (
      typeof w.citations === 'number' && typeof w.recency === 'number' && typeof w.relevance === 'number'
    ) return w
  } catch { /* fall through */ }
  return DEFAULT_WEIGHTS
}

export function saveWeights(w: ImportanceWeights): void {
  localStorage.setItem(WEIGHTS_STORAGE_KEY, JSON.stringify(w))
}

// --- score computation ------------------------------------------------------

/** citRate = cited_by_count / max(1, currentYear - year + 1). Returns null when
 * the paper has no OpenAlex enrichment (so importance can down-weight it rather
 * than pretending it's uncited). */
function citationRate(row: ReportRow, currentYear: number): number | null {
  if (row.cited_by_count == null) return null
  const year = row.year ?? currentYear
  const ageYears = Math.max(1, currentYear - year + 1)
  return row.cited_by_count / ageYears
}

export interface Scored {
  paper_key: string
  importance: number    // 0..1
  citScore: number      // 0..1 (0 when uncited/unindexed)
  recency: number       // 0..1
  relevance: number     // 0..1
  hasCitationData: boolean
}

/** Compute normalized importance for every row against a shared max. Rows with
 * no OpenAlex data score 0 on citations but keep their recency + relevance
 * contributions — we flag them via `hasCitationData` so the UI can mark them. */
export function scoreRows(
  rows: ReportRow[],
  weights: ImportanceWeights,
  currentYear: number = new Date().getFullYear(),
): Map<string, Scored> {
  const rates = rows.map(r => citationRate(r, currentYear))
  const maxRate = Math.max(0, ...rates.filter((v): v is number => v != null))
  const denomCit = maxRate > 0 ? Math.log1p(maxRate) : 1

  const years = rows.map(r => r.year).filter((v): v is number => v != null)
  const minYear = years.length ? Math.min(...years) : currentYear
  const maxYear = years.length ? Math.max(...years) : currentYear
  const yearSpan = Math.max(1, maxYear - minYear)

  const out = new Map<string, Scored>()
  rows.forEach((r, i) => {
    const rate = rates[i]
    const citScore = rate != null ? Math.log1p(rate) / denomCit : 0
    const recency = r.year != null ? (r.year - minYear) / yearSpan : 0
    const rel = (r.relevance_score ?? 0) / 100
    const importance =
      weights.citations * citScore +
      weights.recency * recency +
      weights.relevance * rel
    out.set(r.paper_key, {
      paper_key: r.paper_key,
      importance,
      citScore,
      recency,
      relevance: rel,
      hasCitationData: rate != null,
    })
  })
  return out
}
