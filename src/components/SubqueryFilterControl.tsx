import type { ReportRow, SubqueryStance } from '../api'
import type { SubqueryFilter } from '../subqueryFilter'
import { useT } from '../i18n'

const STANCES: SubqueryStance[] = ['yes', 'no', 'mixed', 'not_addressed']

interface Props {
  rows: ReportRow[]
  value: SubqueryFilter | null
  onChange: (value: SubqueryFilter | null) => void
}

/** Shared, run-scoped answer facet. All data tabs receive the same value from
 * App, so a selected answer means the same subset everywhere. */
export default function SubqueryFilterControl({ rows, value, onChange }: Props) {
  const t = useT()
  const set = rows[0]?.subquery_set
  if (!set?.subqueries.length) return null
  const encoded = value ? `${value.id}:${value.stance}` : ''
  return (
    <select className="facet subquery-filter" value={encoded} onChange={(event) => {
      const raw = event.target.value
      if (!raw) { onChange(null); return }
      const separator = raw.lastIndexOf(':')
      onChange({ id: raw.slice(0, separator), stance: raw.slice(separator + 1) as SubqueryStance })
    }}>
      <option value="">{t.subqueries.allAnswers}</option>
      {set.subqueries.flatMap((subquery) => STANCES.map((stance) => (
        <option key={`${subquery.id}:${stance}`} value={`${subquery.id}:${stance}`}>
          {subquery.label}: {t.subqueries.stance[stance]}
        </option>
      )))}
    </select>
  )
}
