import { useCallback, useMemo, useRef, useState } from 'react'
import type { ReportRow } from '../api'
import { useT } from '../i18n'
import type { YearBounds, YearRange } from '../time'

// v0.3 timeline slider. Bars + selection + handles live in a stretched SVG
// (preserveAspectRatio=none) so they fill the container width; year tick
// labels and the hover-count callout are HTML overlays so text isn't
// distorted by the SVG stretch. Drag is smooth (continuous fractional years);
// years snap to whole numbers only on pointerup.

interface Props {
  rows: ReportRow[]
  bounds: YearBounds
  value: YearRange | null
  onChange: (range: YearRange | null) => void
  includeUndated: boolean
  onIncludeUndatedChange: (value: boolean) => void
}

// Viewbox in percent-of-width so bar x-positions map 1:1 to CSS percentages
// for the HTML overlay. Height is arbitrary — the CSS pins the container.
const VW = 100
const VH = 60

function ResetIcon() {
  return (
    <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true" focusable="false">
      <path d="M16.2 9.6a6.2 6.2 0 1 1-1.85-4.4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M16.5 3.1v4.1h-4.1" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export default function TimelineSlider({
  rows, bounds, value, onChange,
  includeUndated, onIncludeUndatedChange,
}: Props) {
  const t = useT()
  const svgRef = useRef<SVGSVGElement | null>(null)
  const dragging = useRef<null | 'lo' | 'hi' | 'both'>(null)
  const dragOffsetRef = useRef<number>(0)
  // Fractional (unrounded) range shown live during a drag. Null when idle —
  // then `committed` from props drives the render. On pointerup we round and
  // hand the whole-year range up to the parent.
  const [dragLive, setDragLive] = useState<{ lo: number; hi: number } | null>(null)
  const [hoverYear, setHoverYear] = useState<number | null>(null)

  const yearSpan = Math.max(0.001, bounds.max - bounds.min)

  const committed: { lo: number; hi: number } = useMemo(() => {
    if (value) return {
      lo: Math.max(bounds.min, Math.min(bounds.max, value.lo)),
      hi: Math.max(bounds.min, Math.min(bounds.max, value.hi)),
    }
    return { lo: bounds.min, hi: bounds.max }
  }, [value, bounds])

  const shown = dragLive ?? committed
  // Whole-year display copies — the readout at the top and the "which bars are
  // in range" test both round the fractional live positions so the user sees
  // years, not fractions, while dragging.
  const shownLoYear = Math.round(shown.lo)
  const shownHiYear = Math.round(shown.hi)

  const hist = useMemo(() => {
    const m = new Map<number, number>()
    for (const r of rows) if (r.year != null) m.set(r.year, (m.get(r.year) ?? 0) + 1)
    const out: { year: number; n: number }[] = []
    for (let y = bounds.min; y <= bounds.max; y++) out.push({ year: y, n: m.get(y) ?? 0 })
    return out
  }, [rows, bounds])
  const nUndated = useMemo(() => rows.filter((r) => r.year == null).length, [rows])
  const maxN = Math.max(1, ...hist.map((h) => h.n))

  // Fractional year at a given clientX, measured against the SVG's real
  // bounding box (not viewBox). Continuous — we only round on release.
  const eventToYear = useCallback((clientX: number): number => {
    const svg = svgRef.current
    if (!svg) return bounds.min
    const rect = svg.getBoundingClientRect()
    const frac = (clientX - rect.left) / Math.max(1, rect.width)
    return bounds.min + Math.max(0, Math.min(1, frac)) * yearSpan
  }, [bounds, yearSpan])

  // Year → percent of width. Also used as an SVG viewBox x coordinate because
  // the viewBox width is exactly 100.
  const yearToPct = useCallback(
    (y: number) => ((y - bounds.min) / yearSpan) * 100,
    [bounds, yearSpan],
  )

  const onPointerDown = (which: 'lo' | 'hi' | 'both') => (e: React.PointerEvent<Element>) => {
    e.preventDefault()
    ;(e.target as Element).setPointerCapture?.(e.pointerId)
    dragging.current = which
    const startShown = shown  // freeze at drag start for the 'both' offset
    if (which === 'both') dragOffsetRef.current = eventToYear(e.clientX) - startShown.lo
    setDragLive({ lo: startShown.lo, hi: startShown.hi })
  }

  const onPointerMove = (e: React.PointerEvent<Element>) => {
    if (!dragging.current) return
    const y = eventToYear(e.clientX)
    setDragLive((prev) => {
      const cur = prev ?? shown
      if (dragging.current === 'lo') {
        return { lo: Math.max(bounds.min, Math.min(cur.hi, y)), hi: cur.hi }
      }
      if (dragging.current === 'hi') {
        return { lo: cur.lo, hi: Math.min(bounds.max, Math.max(cur.lo, y)) }
      }
      // 'both' — shift the selection, preserving its width.
      const width = cur.hi - cur.lo
      const newLo = y - dragOffsetRef.current
      const clampedLo = Math.max(bounds.min, Math.min(bounds.max - width, newLo))
      return { lo: clampedLo, hi: clampedLo + width }
    })
  }

  const onPointerUp = (e: React.PointerEvent<Element>) => {
    (e.target as Element).releasePointerCapture?.(e.pointerId)
    if (!dragging.current) return
    dragging.current = null
    // Snap and emit — only now does the parent (and the persisted state) see a change.
    setDragLive((cur) => {
      if (!cur) return null
      const snap = { lo: Math.round(cur.lo), hi: Math.round(cur.hi) }
      if (snap.lo <= bounds.min && snap.hi >= bounds.max) onChange(null)
      else onChange(snap)
      return null
    })
  }

  const reset = () => { setDragLive(null); onChange(null) }

  // Ticks: first year (min publish year), last year, and every year %5==0.
  const tickYears = useMemo(() => {
    const s = new Set<number>([bounds.min, bounds.max])
    for (let y = bounds.min; y <= bounds.max; y++) if (y % 5 === 0) s.add(y)
    return [...s].sort((a, b) => a - b)
  }, [bounds])

  const active = value != null

  // Selection band edges (percent-of-width coordinates in the viewBox).
  const loX = yearToPct(shown.lo)
  const hiX = yearToPct(shown.hi)

  return (
    <div className="timeline-slider">
      <div className="timeline-labels">
        <span className="k">{t.time.rangeLabel}</span>
        <span className="v">{shownLoYear} – {shownHiYear}</span>
        {/* Reset stays in the flex flow as a fixed-size icon button so its
            appearance/disappearance never re-flows the top row's height. */}
        <button
          className="timeline-reset"
          onClick={reset}
          disabled={!active}
          aria-label={t.time.reset}
          title={t.time.reset}
        >
          <ResetIcon />
        </button>
        <label className="timeline-undated">
          <input
            type="checkbox"
            checked={includeUndated}
            onChange={(e) => onIncludeUndatedChange(e.target.checked)}
          />
          {t.time.includeUndated} {nUndated > 0 && <span className="ink-3">({nUndated})</span>}
        </label>
      </div>
      <div
        className="timeline-track"
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {/* Hover count callout — sits above the bar. Positioned by percent so
            it moves with any container width. `pointer-events: none` in CSS
            keeps it from stealing hover from the bar underneath. */}
        {hoverYear != null && (() => {
          const bar = hist.find((h) => h.year === hoverYear)
          if (!bar) return null
          const pct = yearToPct(hoverYear)
          return (
            <div className="timeline-hover" style={{ left: `${pct}%` }}>
              <b>{bar.n}</b>
              <span className="ink-3"> · {bar.year}</span>
            </div>
          )
        })()}

        <svg
          ref={svgRef}
          className="timeline-svg"
          viewBox={`0 0 ${VW} ${VH}`}
          preserveAspectRatio="none"
        >
          {/* The selection lives behind the bars so years remain hoverable. */}
          <rect
            x={loX} y={0}
            width={Math.max(0.1, hiX - loX)}
            height={VH}
            className="timeline-band"
            onPointerDown={onPointerDown('both')}
            onPointerEnter={() => setHoverYear(null)}
          />
          {/* histogram bars */}
          {hist.map((h, i) => {
            const barW = VW / Math.max(1, hist.length)
            const barH = ((VH - 6) * h.n) / maxN
            const x = i * barW
            const y = VH - barH
            const inRange = h.year >= shownLoYear && h.year <= shownHiYear
            return (
              <rect
                key={h.year}
                x={x + barW * 0.08} y={y}
                width={barW * 0.84} height={barH}
                className={`timeline-bar${inRange ? '' : ' timeline-bar-off'}${hoverYear === h.year ? ' timeline-bar-hover' : ''}`}
                onPointerEnter={() => setHoverYear(h.year)}
                onPointerLeave={() => setHoverYear((cur) => (cur === h.year ? null : cur))}
                onClick={(event) => {
                  event.stopPropagation()
                  setDragLive(null)
                  onChange({ lo: h.year, hi: h.year })
                }}
              />
            )
          })}
        </svg>

        {/* Fixed-size HTML handles avoid distortion from the SVG's stretched
            coordinate system while retaining pointer capture for smooth drags. */}
        {(['lo', 'hi'] as const).map((which) => {
          const pct = which === 'lo' ? loX : hiX
          return <button
            key={which}
            type="button"
            className="timeline-handle-dot"
            style={{ left: `${pct}%` }}
            onPointerDown={onPointerDown(which)}
            onClick={(event) => event.stopPropagation()}
            aria-label={which === 'lo' ? 'Drag start year' : 'Drag end year'}
          />
        })}

        {/* Tick labels — HTML so text renders at natural aspect ratio. */}
        <div className="timeline-ticks">
          {tickYears.map((y) => {
            const pct = yearToPct(y)
            // Align first tick to left edge, last to right, others centered —
            // avoids labels getting clipped at the container edges.
            const isFirst = y === bounds.min
            const isLast = y === bounds.max
            const transform = isFirst ? 'translateX(0)' : isLast ? 'translateX(-100%)' : 'translateX(-50%)'
            return (
              <span
                key={y}
                className="timeline-tick"
                style={{ left: `${pct}%`, transform }}
              >
                {y}
              </span>
            )
          })}
        </div>
      </div>
    </div>
  )
}
