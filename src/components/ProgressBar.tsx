interface Props {
  /** Completed count. */
  value: number
  /** Total to complete. null/0 → indeterminate (animated) bar. */
  total: number | null
  /** Optional caption shown above the bar (e.g. a phase label). */
  label?: string
}

/** A slim progress bar. Determinate when `total` is a positive number (fill =
 * value/total), otherwise an indeterminate sweep for phases with no known count. */
export default function ProgressBar({ value, total, label }: Props) {
  const determinate = total != null && total > 0
  const pct = determinate ? Math.min(100, Math.round((value / (total as number)) * 100)) : 0
  return (
    <div className="progress-wrap">
      <div className="progress-meta">
        <span>{label}</span>
        {determinate && <span className="progress-count">{value}/{total} · {pct}%</span>}
      </div>
      <div
        className={`progress${determinate ? '' : ' indeterminate'}`}
        role="progressbar"
        aria-valuenow={determinate ? value : undefined}
        aria-valuemin={0}
        aria-valuemax={determinate ? (total as number) : undefined}
      >
        <div className="progress-fill" style={determinate ? { width: `${pct}%` } : undefined} />
      </div>
    </div>
  )
}
