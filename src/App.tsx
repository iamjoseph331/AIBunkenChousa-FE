import { useEffect, useState } from 'react'
import HomePage from './components/HomePage'
import ReportView from './components/ReportView'
import CitationGraph from './components/CitationGraph'
import ConceptGraph from './components/ConceptGraph'
import GeoView from './components/GeoView'
import StatsView from './components/StatsView'
import SettingsModal from './components/SettingsModal'
import { useLang, useT } from './i18n'
import { hasClaudeApiKey, setClaudeApiKey } from './api'
import { loadWeights, saveWeights, type ImportanceWeights } from './importance'
import './App.css'

type Tab = 'home' | 'report' | 'citations' | 'concepts' | 'geo' | 'stats'

const TAB_IDS: Tab[] = ['home', 'report', 'geo', 'stats', 'citations', 'concepts']

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
  const [toast, setToast] = useState<string | null>(null)
  // A run to open in the Report tab — set when the Home query bar starts one.
  const [reportRunId, setReportRunId] = useState<number | null>(null)
  const [reportCountryFilter, setReportCountryFilter] = useState<{ codes: string[]; label: string; mode: 'author' | 'target' } | null>(null)

  const { lang, setLang } = useLang()
  const t = useT()

  useEffect(() => localStorage.setItem('aibc-mode', mode), [mode])
  useEffect(() => localStorage.setItem('aibc-theme', theme), [theme])
  useEffect(() => localStorage.setItem('aibc-density', density), [density])
  useEffect(() => localStorage.setItem('aibc-tab', tab), [tab])
  useEffect(() => saveWeights(weights), [weights])
  useEffect(() => {
    if (!toast) return
    const id = window.setTimeout(() => setToast(null), 2400)
    return () => window.clearTimeout(id)
  }, [toast])

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

  return (
    <div
      className="app"
      data-mode={mode}
      data-theme={theme === 'slate' ? undefined : theme}
      data-density={density}
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
            setReportRunId(id)
            setTab('report')
          }}
        />
      )}
      {tab === 'report' && <ReportView initialRunId={reportRunId} weights={weights} countryFilter={reportCountryFilter} onClearCountryFilter={() => setReportCountryFilter(null)} />}
      {tab === 'geo' && <GeoView initialRunId={reportRunId} onFilter={(filter) => { setReportRunId(filter.runId); setReportCountryFilter({ codes: filter.codes, label: filter.label, mode: filter.mode }); setTab('report') }} />}
      {tab === 'stats' && <StatsView initialRunId={reportRunId} />}
      {tab === 'citations' && <CitationGraph />}
      {tab === 'concepts' && <ConceptGraph />}
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} lang={lang} setLang={setLang} mode={mode} setMode={setMode} theme={theme} setTheme={setTheme} density={density} setDensity={setDensity} claudeKeySaved={claudeKeySaved} onSaveClaudeKey={saveClaudeKey} weights={weights} setWeights={setWeights} />}
    </div>
  )
}
