import { useEffect, useState, type CSSProperties } from 'react'
import HomePage from './components/HomePage'
import ReportView from './components/ReportView'
import CitationGraph from './components/CitationGraph'
import ConceptGraph from './components/ConceptGraph'
import GeoView from './components/GeoView'
import StatsView from './components/StatsView'
import SettingsModal from './components/SettingsModal'
import TimelineSlider from './components/TimelineSlider'
import { useLang, useT } from './i18n'
import { api, hasClaudeApiKey, setClaudeApiKey, type ReportRow } from './api'
import { loadWeights, saveWeights, type ImportanceWeights } from './importance'
import { yearBounds, type YearRange } from './time'
import type { SubqueryFilter } from './subqueryFilter'
import { loadCategoryPalette, saveCategoryPalette } from './categoryColor'
import './App.css'

type Tab = 'home' | 'report' | 'citations' | 'concepts' | 'geo' | 'stats'

const TAB_IDS: Tab[] = ['home', 'report', 'geo', 'stats', 'citations', 'concepts']

// Which tabs consume the shared year slider — Home and Citations don't (Home
// has no run scope, Citations is corpus-wide and un-scored by year).
const YEAR_SLIDER_TABS: Tab[] = ['report', 'geo', 'stats', 'concepts']

function isTyping(el: EventTarget | null): boolean {
  const n = el as HTMLElement | null
  if (!n) return false
  const tag = n.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || n.isContentEditable
}

export default function App() {
  // Defaults: Nord palette, light ("bright") mode, comfortable density.
  // Saved user choices in localStorage still win on repeat visits.
  const [mode, setMode] = useState<'light' | 'dark'>(
    () => (localStorage.getItem('aibc-mode') as 'light' | 'dark') || 'light',
  )
  const [theme, setTheme] = useState(() => localStorage.getItem('aibc-theme') || 'nord')
  const [density, setDensity] = useState<'compact' | 'comfortable'>(
    () => (localStorage.getItem('aibc-density') as 'compact' | 'comfortable') || 'comfortable',
  )
  const [tab, setTab] = useState<Tab>(() => (localStorage.getItem('aibc-tab') as Tab) || 'home')
  const [claudeKeySaved, setClaudeKeySaved] = useState(() => hasClaudeApiKey())
  const [showSettings, setShowSettings] = useState(false)
  const [weights, setWeights] = useState<ImportanceWeights>(() => loadWeights())
  const [categoryPalette, setCategoryPalette] = useState<string[]>(() => loadCategoryPalette())
  const [toast, setToast] = useState<string | null>(null)
  // v0.3 shared run id — one authoritative selection across Report/Geo/Stats/
  // Concepts; picking a run in one view updates the others when they mount.
  const [runId, setRunId] = useState<number | null>(null)
  const [reportCountryFilter, setReportCountryFilter] = useState<{ codes: string[]; label: string; mode: 'author' | 'target' } | null>(null)
  const [subqueryFilter, setSubqueryFilter] = useState<SubqueryFilter | null>(null)
  // v0.3 year-range slider state. `null` = the slider is off / no filter applied.
  // `includeUndated` toggles whether year==null rows survive the filter.
  const [yearRange, setYearRange] = useState<YearRange | null>(() => {
    try {
      const raw = localStorage.getItem('aibc-year-range')
      if (raw) {
        const p = JSON.parse(raw)
        if (typeof p.lo === 'number' && typeof p.hi === 'number') return p
      }
    } catch { /* ignore */ }
    return null
  })
  const [includeUndated, setIncludeUndated] = useState<boolean>(
    () => localStorage.getItem('aibc-include-undated') !== '0',
  )
  // Rows for the slider's own bounds histogram. Fetched once per runId change;
  // views still fetch their own copies (the run-detail endpoint is local + cheap).
  const [sliderRows, setSliderRows] = useState<ReportRow[]>([])

  const { lang, setLang } = useLang()
  const t = useT()

  useEffect(() => localStorage.setItem('aibc-mode', mode), [mode])
  useEffect(() => localStorage.setItem('aibc-theme', theme), [theme])
  useEffect(() => localStorage.setItem('aibc-density', density), [density])
  useEffect(() => localStorage.setItem('aibc-tab', tab), [tab])
  useEffect(() => saveWeights(weights), [weights])
  useEffect(() => saveCategoryPalette(categoryPalette), [categoryPalette])
  useEffect(() => {
    if (yearRange) localStorage.setItem('aibc-year-range', JSON.stringify(yearRange))
    else localStorage.removeItem('aibc-year-range')
  }, [yearRange])
  useEffect(() => localStorage.setItem('aibc-include-undated', includeUndated ? '1' : '0'),
    [includeUndated])
  useEffect(() => {
    if (!toast) return
    const id = window.setTimeout(() => setToast(null), 2400)
    return () => window.clearTimeout(id)
  }, [toast])

  // Fetch rows for the slider whenever runId changes. Fires and forgets on
  // failure — the slider just falls back to empty bounds (hides itself).
  useEffect(() => {
    if (runId == null) { setSliderRows([]); return }
    // A year range belongs to a specific run. Starting a different run at its
    // actual earliest publication year is less surprising than carrying a
    // persisted range from a previous corpus.
    setYearRange(null)
    setSubqueryFilter(null)
    let cancelled = false
    api.run(runId).then(
      (d) => { if (!cancelled) setSliderRows(d.report) },
      () => { if (!cancelled) setSliderRows([]) },
    )
    return () => { cancelled = true }
  }, [runId])

  function saveClaudeKey(value: string) {
    const saved = setClaudeApiKey(value)
    setClaudeKeySaved(saved)
    setToast(saved ? t.controls.claudeApiKeySavedToast : t.controls.claudeApiKeyClearedToast)
  }

  // Keyboard: [ / ] and ← / → cycle tabs (when not typing in a field).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target)) return
      const dir =
        e.key === ']' || e.key === 'ArrowRight' ? 1 : e.key === '[' || e.key === 'ArrowLeft' ? -1 : 0
      if (!dir) return
      e.preventDefault()
      setTab((cur) => {
        const i = TAB_IDS.indexOf(cur)
        return TAB_IDS[(i + dir + TAB_IDS.length) % TAB_IDS.length]
      })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const bounds = yearBounds(sliderRows)
  const showSlider = YEAR_SLIDER_TABS.includes(tab) && bounds != null
  // Rendered once per turn; each view mounts it under its own run picker so
  // the slider lives with the data it filters. The App-level container has
  // no chrome — see .timeline-slider CSS (no background/border) — so it
  // blends into whichever view hosts it.
  const slider = showSlider ? (
    <TimelineSlider
      rows={sliderRows}
      bounds={bounds!}
      value={yearRange}
      onChange={setYearRange}
      includeUndated={includeUndated}
      onIncludeUndatedChange={setIncludeUndated}
    />
  ) : null
  const categoryPaletteStyle = Object.fromEntries(
    categoryPalette.map((color, index) => [`--cat-${index + 1}`, color]),
  ) as CSSProperties

  return (
    <div
      className="app"
      data-mode={mode}
      data-theme={theme === 'slate' ? undefined : theme}
      data-density={density}
      style={categoryPaletteStyle}
    >
      <header className="topbar">
        <h1>AIBunkenChousa <span className="subtitle">AI文献調査</span></h1>

        <nav className="tabs">
          {TAB_IDS.map((id) => (
            <button
              key={id}
              className={`tab${tab === id ? ' on' : ''}`}
              onClick={() => setTab(id)}
            >
              {t.nav[id]}
            </button>
          ))}
        </nav>

        <div className="topbar-controls"><button className="settings-trigger" onClick={() => setShowSettings(true)} aria-label={t.settings.title}>⚙</button></div>
      </header>

      {toast && <div className="app-toast" role="status">{toast}</div>}

      {tab === 'home' && (
        <HomePage
          onOpenRun={(id) => {
            setRunId(id)
            setTab('report')
          }}
        />
      )}
      {tab === 'report' && (
        <ReportView
          runId={runId} onRunIdChange={setRunId} weights={weights}
          countryFilter={reportCountryFilter}
          onClearCountryFilter={() => setReportCountryFilter(null)}
          subqueryFilter={subqueryFilter}
          yearRange={yearRange} includeUndated={includeUndated}
          slider={slider}
        />
      )}
      {tab === 'geo' && (
        <GeoView
          runId={runId} onRunIdChange={setRunId}
          yearRange={yearRange} includeUndated={includeUndated}
          slider={slider}
          subqueryFilter={subqueryFilter} onSubqueryFilterChange={setSubqueryFilter}
          onFilter={(filter) => {
            setRunId(filter.runId)
            setReportCountryFilter({ codes: filter.codes, label: filter.label, mode: filter.mode })
            setTab('report')
          }}
        />
      )}
      {tab === 'stats' && (
        <StatsView
          runId={runId} onRunIdChange={setRunId}
          yearRange={yearRange} includeUndated={includeUndated}
          slider={slider}
          subqueryFilter={subqueryFilter} onSubqueryFilterChange={setSubqueryFilter}
        />
      )}
      {tab === 'citations' && <CitationGraph />}
      {tab === 'concepts' && (
        <ConceptGraph
          runId={runId} onRunIdChange={setRunId}
          yearRange={yearRange} includeUndated={includeUndated}
          slider={slider}
          subqueryFilter={subqueryFilter} onSubqueryFilterChange={setSubqueryFilter}
        />
      )}
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} lang={lang} setLang={setLang} mode={mode} setMode={setMode} theme={theme} setTheme={setTheme} density={density} setDensity={setDensity} claudeKeySaved={claudeKeySaved} onSaveClaudeKey={saveClaudeKey} weights={weights} setWeights={setWeights} categoryPalette={categoryPalette} setCategoryPalette={setCategoryPalette} currentRunId={runId} onRunImported={(id) => { setRunId(id); setShowSettings(false); setTab('report') }} />}
    </div>
  )
}
