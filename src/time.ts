export function formatDuration(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds)) return '—'
  const total = Math.max(0, Math.round(seconds))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

// v0.3 timeline slider + importance recency — one min/max helper both consume
// so the slider bounds match the recency-normalisation bounds.

export interface YearBounds { min: number; max: number }

export function yearBounds<T extends { year: number | null }>(rows: T[]): YearBounds | null {
  const ys: number[] = []
  for (const r of rows) if (r.year != null) ys.push(r.year)
  if (ys.length === 0) return null
  return { min: Math.min(...ys), max: Math.max(...ys) }
}

export interface YearRange { lo: number; hi: number }

/** Filter rows by year range with an explicit undated policy. Kept generic so
 * both ReportRow and ConceptNode consumers can pass their own type. */
export function filterByYear<T extends { year: number | null }>(
  rows: T[],
  range: YearRange | null,
  includeUndated: boolean,
): T[] {
  if (!range) return rows
  return rows.filter((r) => {
    if (r.year == null) return includeUndated
    return r.year >= range.lo && r.year <= range.hi
  })
}
