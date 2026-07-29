import { useCallback, useEffect, useState } from 'react'
import { api, type Run, type Settings } from '../api'
import type { Lang } from '../i18n'
import { useT } from '../i18n'
import { DEFAULT_WEIGHTS, type ImportanceWeights } from '../importance'

type Section = 'language' | 'api' | 'appearance' | 'ranking' | 'corpus'
type Mode = 'light' | 'dark'
type Density = 'compact' | 'comfortable'

interface Props {
  onClose: () => void
  lang: Lang
  setLang: (lang: Lang) => void
  mode: Mode
  setMode: (mode: Mode) => void
  theme: string
  setTheme: (theme: string) => void
  density: Density
  setDensity: (density: Density) => void
  claudeKeySaved: boolean
  onSaveClaudeKey: (value: string) => void
  weights: ImportanceWeights
  setWeights: (weights: ImportanceWeights) => void
  categoryPalette: string[]
  setCategoryPalette: (palette: string[]) => void
  currentRunId: number | null
  onRunImported: (runId: number) => void
}

const SECTIONS: Section[] = ['language', 'api', 'appearance', 'ranking', 'corpus']

export default function SettingsModal(props: Props) {
  const t = useT()
  const [section, setSection] = useState<Section>('language')
  const [keyDraft, setKeyDraft] = useState('')
  const [settings, setSettings] = useState<Settings | null>(null)
  const [pathDraft, setPathDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const [folderError, setFolderError] = useState<string | null>(null)
  const [runs, setRuns] = useState<Run[]>([])
  const [shareRunId, setShareRunId] = useState<number | null>(props.currentRunId)
  const [importing, setImporting] = useState(false)
  const [runTransferError, setRunTransferError] = useState<string | null>(null)

  const loadSettings = useCallback(async () => {
    try {
      const data = await api.settings()
      setSettings(data)
      setPathDraft(data.papers_dir)
    } catch (error) {
      setFolderError(String(error instanceof Error ? error.message : error))
    }
  }, [])

  useEffect(() => { loadSettings() }, [loadSettings])
  useEffect(() => {
    api.runs().then((items) => {
      setRuns(items)
      setShareRunId((current) => current ?? props.currentRunId ?? items[0]?.id ?? null)
    }, (error) => setRunTransferError(String(error instanceof Error ? error.message : error)))
  }, [props.currentRunId])

  async function saveFolder() {
    setSaving(true)
    setFolderError(null)
    try {
      const data = await api.saveSettings(pathDraft.trim())
      setSettings(data)
    } catch (error) {
      setFolderError(String(error instanceof Error ? error.message : error))
    } finally {
      setSaving(false)
    }
  }

  async function importRun(file: File | undefined) {
    if (!file) return
    setImporting(true)
    setRunTransferError(null)
    try {
      const bundle = JSON.parse(await file.text())
      const result = await api.importRunBundle(bundle)
      setShareRunId(result.run_id)
      props.onRunImported(result.run_id)
    } catch (error) {
      setRunTransferError(String(error instanceof Error ? error.message : error))
    } finally {
      setImporting(false)
    }
  }

  const labels: Record<Section, string> = {
    language: t.settings.language,
    api: t.settings.api,
    appearance: t.settings.appearance,
    ranking: t.settings.ranking,
    corpus: t.settings.corpus,
  }

  return (
    <div className="modal-backdrop settings-backdrop" onClick={props.onClose}>
      <section className="settings-modal" role="dialog" aria-modal="true" aria-label={t.settings.title} onClick={(event) => event.stopPropagation()}>
        <aside className="settings-nav">
          <button className="settings-back" onClick={props.onClose}>← {t.nav.home}</button>
          {SECTIONS.map((item) => (
            <button key={item} className={section === item ? 'on' : ''} onClick={() => setSection(item)}>{labels[item]}</button>
          ))}
        </aside>
        <div className="settings-content">
          <header className="settings-head"><h2>{labels[section]}</h2><button className="modal-close" aria-label={t.settings.close} onClick={props.onClose}>✕</button></header>

          {section === 'language' && (
            <div className="settings-section"><p className="home-help">{t.controls.language}</p><div className="settings-choice-row">
              <button className={props.lang === 'en' ? 'primary' : ''} onClick={() => props.setLang('en')}>English</button>
              <button className={props.lang === 'ja' ? 'primary' : ''} onClick={() => props.setLang('ja')}>日本語</button>
            </div></div>
          )}

          {section === 'api' && (
            <form className="settings-section settings-api" onSubmit={(event) => { event.preventDefault(); props.onSaveClaudeKey(keyDraft); setKeyDraft('') }}>
              <label className="field"><span>{t.controls.claudeApiKey}</span><input type="password" value={keyDraft} onChange={(event) => setKeyDraft(event.target.value)} placeholder={props.claudeKeySaved ? t.controls.claudeApiKeySavedPlaceholder : t.controls.claudeApiKeyPlaceholder} spellCheck={false} autoComplete="off" /></label>
              <button className="primary" type="submit">{t.controls.saveClaudeApiKey}</button>
            </form>
          )}

          {section === 'appearance' && (
            <div className="settings-section">
              <label className="field"><span>{t.settings.colorTheme}</span><select value={props.theme} onChange={(event) => props.setTheme(event.target.value)}><option value="slate">Slate</option><option value="graphite">Graphite</option><option value="sepia">Sepia</option><option value="nord">Nord</option></select></label>
              <span className="settings-label">{t.settings.displayMode}</span><div className="settings-choice-row"><button className={props.mode === 'light' ? 'primary' : ''} onClick={() => props.setMode('light')}>☀ Light</button><button className={props.mode === 'dark' ? 'primary' : ''} onClick={() => props.setMode('dark')}>☾ Dark</button></div>
              <span className="settings-label">{t.settings.density}</span><div className="settings-choice-row"><button className={props.density === 'comfortable' ? 'primary' : ''} onClick={() => props.setDensity('comfortable')}>{t.controls.comfortable}</button><button className={props.density === 'compact' ? 'primary' : ''} onClick={() => props.setDensity('compact')}>{t.controls.compact}</button></div>
              <span className="settings-label">{t.settings.categoryPalette}</span>
              <p className="home-help settings-palette-help">{t.settings.categoryPaletteHelp}</p>
              <div className="settings-palette">
                {props.categoryPalette.map((color, index) => (
                  <label key={index} title={`${t.settings.categoryColor} ${index + 1}`}>
                    <input
                      type="color"
                      value={color}
                      onChange={(event) => props.setCategoryPalette(
                        props.categoryPalette.map((value, itemIndex) => itemIndex === index ? event.target.value : value),
                      )}
                    />
                    <span>{index + 1}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {section === 'ranking' && (
            <div className="settings-section imp-sliders"><label>{t.report.weightCitations}<input type="range" min="0" max="1" step="0.05" value={props.weights.citations} onChange={(event) => props.setWeights({ ...props.weights, citations: Number(event.target.value) })} /><span className="val">{props.weights.citations.toFixed(2)}</span></label><label>{t.report.weightRecency}<input type="range" min="0" max="1" step="0.05" value={props.weights.recency} onChange={(event) => props.setWeights({ ...props.weights, recency: Number(event.target.value) })} /><span className="val">{props.weights.recency.toFixed(2)}</span></label><label>{t.report.weightRelevance}<input type="range" min="0" max="1" step="0.05" value={props.weights.relevance} onChange={(event) => props.setWeights({ ...props.weights, relevance: Number(event.target.value) })} /><span className="val">{props.weights.relevance.toFixed(2)}</span></label><button className="imp-reset" onClick={() => props.setWeights(DEFAULT_WEIGHTS)}>{t.report.resetWeights}</button></div>
          )}

          {section === 'corpus' && (
            <div className="settings-section">
              <p className="home-help">{t.settings.folderHelp}</p>
              <div className="folder-row"><input className="folder-input" type="text" value={pathDraft} onChange={(event) => setPathDraft(event.target.value)} placeholder="/Users/you/papers" spellCheck={false} /><button className="primary" onClick={saveFolder} disabled={saving || !pathDraft.trim()}>{saving ? t.settings.saving : t.settings.saveFolder}</button></div>
              {folderError && <div className="app-error home-inline-error">{folderError}</div>}
              {settings && <div className="folder-status">{settings.exists ? <span><b>{settings.n_pdfs}</b> {t.settings.pdfsFound} · <code>{settings.papers_dir}</code></span> : <span className="folder-missing">{t.settings.missing}: <code>{settings.papers_dir}</code></span>}</div>}

              <div className="settings-divider" />
              <span className="settings-label">{t.settings.runTransfer}</span>
              <p className="home-help">{t.settings.runTransferHelp}</p>
              {runs.length > 0 && (
                <div className="settings-run-share">
                  <select value={shareRunId ?? ''} onChange={(event) => setShareRunId(Number(event.target.value))}>
                    {runs.map((run) => <option key={run.id} value={run.id}>#{run.id} · {run.query || t.report.noQuery}</option>)}
                  </select>
                  {shareRunId != null && <a className="button-link" href={api.runBundleUrl(shareRunId)} download>{t.report.exportRun}</a>}
                </div>
              )}
              <label className={`file-picker${importing ? ' disabled' : ''}`}>
                <input
                  type="file"
                  accept="application/json,.json"
                  disabled={importing}
                  onChange={(event) => {
                    importRun(event.target.files?.[0])
                    event.target.value = ''
                  }}
                />
                <span className="file-picker-button">{importing ? t.report.importingRun : t.settings.chooseRunFile}</span>
                <span className="file-picker-hint">{t.settings.runFileHint}</span>
              </label>
              {runTransferError && <div className="app-error home-inline-error">{runTransferError}</div>}
            </div>
          )}
        </div>
      </section>
    </div>
  )
}
