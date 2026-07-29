import type { ReportRow, SubqueryStance } from './api'

export interface SubqueryFilter {
  id: string
  stance: SubqueryStance
}

export function matchesSubqueryFilter(row: ReportRow, filter: SubqueryFilter | null): boolean {
  return !filter || row.subquery_answers?.[filter.id]?.stance === filter.stance
}
