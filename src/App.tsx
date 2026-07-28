import { useEffect, useState } from 'react'
import HomePage from './components/HomePage'
import ReportView from './components/ReportView'
import CitationGraph from './components/CitationGraph'
import ConceptGraph from './components/ConceptGraph'
import GeoView from './components/GeoView'
import StatsView from './components/StatsView'
import { useLang, useT } from './i18n'
import { hasClaudeApiKey, setClaudeApiKey } from './api'
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
  const [claudeKeyDraft, setClaudeKeyDraft] = useState('')
  const [claudeKeySaved, setClaudeKeySaved] = useState(() => hasClaudeApiKey())
  const [toast, setToast] = useState<string | null>(null)
  // A run to open in the Report tab — set when the Home query bar starts one.
  const [reportRunId, setReportRunId] = useState<number | null>(null)

  const { lang, setLang } = useLang()
  const t = useT()

  useEffect(() => localStorage.setItem('aibc-mode', mode), [mode])
  useEffect(() => localStorage.setItem('aibc-theme', theme), [theme])
  useEffect(() => localStorage.setItem('aibc-density', density), [density])
  useEffect(() => localStorage.setItem('aibc-tab', tab), [tab])
  useEffect(() => {
    if (!toast) return
    const id = window.setTimeout(() => setToast(null), 2400)
    return () => window.clearTimeout(id)
  }, [toast])

  function saveClaudeKey() {
    const saved = setClaudeApiKey(claudeKeyDraft)
    setClaudeKeySaved(saved)
    setClaudeKeyDraft('')
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

        <div className="topbar-controls">
          <form
            className="api-key-control"
            onSubmit={(e) => {
              e.preventDefault()
              saveClaudeKey()
            }}
            aria-label={t.controls.claudeApiKey}
          >
            <label htmlFor="claude-api-key">{t.controls.claudeApiKey}</label>
            <input
              id="claude-api-key"
              type="password"
              value={claudeKeyDraft}
              onChange={(e) => {
                setClaudeKeyDraft(e.target.value)
              }}
              placeholder={claudeKeySaved ? t.controls.claudeApiKeySavedPlaceholder : t.controls.claudeApiKeyPlaceholder}
              spellCheck={false}
              autoComplete="off"
            />
            <button type="submit" title={t.controls.saveClaudeApiKey}>
              {t.controls.saveClaudeApiKey}
            </button>
          </form>
          <div className="lang-toggle" role="group" aria-label={t.controls.language}>
            <button className={lang === 'en' ? 'on' : ''} onClick={() => setLang('en')}>EN</button>
            <button className={lang === 'ja' ? 'on' : ''} onClick={() => setLang('ja')}>日本語</button>
          </div>
          <select value={theme} onChange={(e) => setTheme(e.target.value)} aria-label="Theme">
            <option value="slate">Slate</option>
            <option value="graphite">Graphite</option>
            <option value="sepia">Sepia</option>
            <option value="nord">Nord</option>
          </select>
          <button
            onClick={() => setMode(mode === 'dark' ? 'light' : 'dark')}
            aria-label={mode === 'dark' ? t.controls.darkMode : t.controls.lightMode}
          >
            {mode === 'dark' ? '☾' : '☀'}
          </button>
          <button
            className="density-btn"
            onClick={() => setDensity(density === 'compact' ? 'comfortable' : 'compact')}
          >
            {density === 'compact' ? t.controls.compact : t.controls.comfortable}
          </button>
        </div>
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
      {tab === 'report' && <ReportView initialRunId={reportRunId} />}
      {tab === 'geo' && <GeoView initialRunId={reportRunId} />}
      {tab === 'stats' && <StatsView initialRunId={reportRunId} />}
      {tab === 'citations' && <CitationGraph />}
      {tab === 'concepts' && <ConceptGraph />}
    </div>
  )
}
