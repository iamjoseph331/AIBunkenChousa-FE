import { useCallback, useEffect, useState } from 'react'
import { api, type LLMSettings, type Run, type Settings, type UnresolvedMetadataPaper } from '../api'
import type { Lang } from '../i18n'
import { useT } from '../i18n'
import { DEFAULT_WEIGHTS, type ImportanceWeights } from '../importance'
import type { ConceptNodeColorMode } from '../categoryColor'
import { setLocalPdfs } from '../localPdfs'

type Section = 'language' | 'api' | 'appearance' | 'ranking' | 'corpus' | 'metadata'
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
  llm: LLMSettings
  llmSaved: boolean
  onSaveLlm: (value: LLMSettings) => void
  weights: ImportanceWeights
  setWeights: (weights: ImportanceWeights) => void
  categoryPalette: string[]
  setCategoryPalette: (palette: string[]) => void
  conceptNodeColorMode: ConceptNodeColorMode
  setConceptNodeColorMode: (mode: ConceptNodeColorMode) => void
  currentRunId: number | null
  onRunImported: (runId: number) => void
}

const SECTIONS: Section[] = ['language', 'api', 'appearance', 'ranking', 'corpus', 'metadata']

export default function SettingsModal(props: Props) {
  const t = useT()
  const [section, setSection] = useState<Section>('language')
  const [llmDraft, setLlmDraft] = useState<LLMSettings>(props.llm)
  const [openAlexKeyDraft, setOpenAlexKeyDraft] = useState('')
  const [savingOpenAlexKey, setSavingOpenAlexKey] = useState(false)
  const [openAlexKeyMessage, setOpenAlexKeyMessage] = useState<string | null>(null)
  const [settings, setSettings] = useState<Settings | null>(null)
  const [pathDraft, setPathDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const [folderError, setFolderError] = useState<string | null>(null)
  const [localPdfCount, setLocalPdfCount] = useState(0)
  const [runs, setRuns] = useState<Run[]>([])
  const [shareRunId, setShareRunId] = useState<number | null>(props.currentRunId)
  const [importing, setImporting] = useState(false)
  const [runTransferError, setRunTransferError] = useState<string | null>(null)
  const [refreshingMetadata, setRefreshingMetadata] = useState(false)
  const [metadataProgress, setMetadataProgress] = useState<string | null>(null)
  const [unresolvedPapers, setUnresolvedPapers] = useState<UnresolvedMetadataPaper[]>([])
  const [titleDrafts, setTitleDrafts] = useState<Record<string, string>>({})
  const [savingTitle, setSavingTitle] = useState<string | null>(null)
  const [metadataRepairError, setMetadataRepairError] = useState<string | null>(null)

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
  useEffect(() => {
    if (section !== 'metadata') return
    api.unresolvedMetadata().then(
      (data) => setUnresolvedPapers(data.papers),
      (error) => setMetadataRepairError(String(error instanceof Error ? error.message : error)),
    )
  }, [section])

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

  async function saveOpenAlexKey() {
    setSavingOpenAlexKey(true)
    setOpenAlexKeyMessage(null)
    try {
      const data = await api.saveOpenAlexKey(openAlexKeyDraft)
      setSettings(data)
      setOpenAlexKeyDraft('')
      setOpenAlexKeyMessage(t.settings.openAlexApiKeySaved)
    } catch (error) {
      setOpenAlexKeyMessage(String(error instanceof Error ? error.message : error))
    } finally {
      setSavingOpenAlexKey(false)
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

  async function refreshOpenAlexMetadata() {
    setRefreshingMetadata(true)
    setMetadataProgress(null)
    const es = new EventSource(api.enrichEventsUrl())
    const on = (name: string, fn: (data: any) => void) =>
      es.addEventListener(name, (event) => fn(JSON.parse((event as MessageEvent).data)))
    on('start', (data) => setMetadataProgress(t.settings.metadataRefreshing.replace('{count}', String(data.total ?? 0))))
    on('fetched', () => setMetadataProgress(t.settings.metadataRefreshing.replace('{count}', '…')))
    on('done', (data) => {
      setMetadataProgress(t.settings.metadataComplete.replace('{count}', String(data.hits ?? 0)))
      setRefreshingMetadata(false)
      es.close()
    })
    on('error', (data) => {
      setMetadataProgress(String(data.error ?? t.settings.metadataFailed))
      setRefreshingMetadata(false)
      es.close()
    })
    es.onerror = () => {
      setMetadataProgress(t.settings.metadataFailed)
      setRefreshingMetadata(false)
      es.close()
    }
    try {
      const papers = await api.papers()
      await api.buildEnrich(papers.map((paper) => paper.key))
    } catch (error) {
      setMetadataProgress(String(error instanceof Error ? error.message : error))
      setRefreshingMetadata(false)
      es.close()
    }
  }

  async function submitManualTitle(paper: UnresolvedMetadataPaper) {
    const title = (titleDrafts[paper.key] ?? '').trim()
    if (!title) return
    setSavingTitle(paper.key)
    setMetadataRepairError(null)
    try {
      await api.setManualMetadataTitle(paper.key, title)
      setUnresolvedPapers((items) => items.filter((item) => item.key !== paper.key))
    } catch (error) {
      setMetadataRepairError(String(error instanceof Error ? error.message : error))
    } finally {
      setSavingTitle(null)
    }
  }

  const labels: Record<Section, string> = {
    language: t.settings.language,
    api: t.settings.api,
    appearance: t.settings.appearance,
    ranking: t.settings.ranking,
    corpus: t.settings.corpus,
    metadata: t.settings.metadataRepair,
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
            <div className="settings-section settings-api">
              <form onSubmit={(event) => { event.preventDefault(); props.onSaveLlm(llmDraft) }}>
                <label className="field"><span>LLM provider</span><select value={llmDraft.provider} onChange={(event) => { const provider = event.target.value as LLMSettings['provider']; setLlmDraft({ ...llmDraft, provider, model: provider === 'anthropic' ? 'claude-opus-4-8' : llmDraft.model.startsWith('claude-') ? 'qwen3:8b' : llmDraft.model }) }}><option value="anthropic">Anthropic</option><option value="openai">OpenAI-compatible</option></select></label>
                {llmDraft.provider === 'openai' && <label className="field"><span>Base URL</span><input value={llmDraft.baseUrl} onChange={(event) => setLlmDraft({ ...llmDraft, baseUrl: event.target.value })} placeholder="http://localhost:11434/v1" spellCheck={false} /></label>}
                <label className="field"><span>{t.newRun.model}</span>{llmDraft.provider === 'anthropic' ? <select value={llmDraft.model} onChange={(event) => setLlmDraft({ ...llmDraft, model: event.target.value })}><option value="claude-opus-4-8">claude-opus-4-8</option><option value="claude-sonnet-5">claude-sonnet-5</option><option value="claude-haiku-4-5">claude-haiku-4-5</option></select> : <input value={llmDraft.model} onChange={(event) => setLlmDraft({ ...llmDraft, model: event.target.value })} placeholder="qwen3:8b" spellCheck={false} />}</label>
                <label className="field"><span>{llmDraft.provider === 'anthropic' ? t.controls.claudeApiKey : 'API key (optional)'}</span><input type="password" value={llmDraft.apiKey} onChange={(event) => setLlmDraft({ ...llmDraft, apiKey: event.target.value })} placeholder={props.llmSaved ? t.controls.claudeApiKeySavedPlaceholder : llmDraft.provider === 'anthropic' ? t.controls.claudeApiKeyPlaceholder : 'optional'} spellCheck={false} autoComplete="off" /></label>
                <button className="primary" type="submit">{t.controls.saveClaudeApiKey}</button>
              </form>
              <form onSubmit={(event) => { event.preventDefault(); void saveOpenAlexKey() }}>
                <label className="field"><span>{t.settings.openAlexApiKey}</span><input type="password" value={openAlexKeyDraft} onChange={(event) => setOpenAlexKeyDraft(event.target.value)} placeholder={settings?.openalex_api_key_saved ? t.settings.openAlexApiKeySavedPlaceholder : t.settings.openAlexApiKeyPlaceholder} spellCheck={false} autoComplete="off" /></label>
                <p className="home-help">{t.settings.openAlexApiKeyHelp}</p>
                <button className="primary" type="submit" disabled={savingOpenAlexKey}>{savingOpenAlexKey ? t.settings.saving : t.settings.saveOpenAlexApiKey}</button>
                {openAlexKeyMessage && <p className="folder-status">{openAlexKeyMessage}</p>}
              </form>
            </div>
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
              <span className="settings-label">{t.settings.conceptNodeColors}</span>
              <p className="home-help settings-palette-help">{t.settings.conceptNodeColorsHelp}</p>
              <div className="settings-choice-row">
                <button className={props.conceptNodeColorMode === 'primary' ? 'primary' : ''} onClick={() => props.setConceptNodeColorMode('primary')}>{t.settings.primaryCategory}</button>
                <button className={props.conceptNodeColorMode === 'pie' ? 'primary' : ''} onClick={() => props.setConceptNodeColorMode('pie')}>{t.settings.categoryPie}</button>
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
              <span className="settings-label">{t.settings.localPreviewFolder}</span>
              <p className="home-help">{t.settings.localPreviewFolderHelp}</p>
              <label className="file-picker">
                <input type="file" accept="application/pdf,.pdf" multiple ref={(node) => node?.setAttribute('webkitdirectory', '')} onChange={(event) => {
                  setLocalPdfCount(setLocalPdfs(event.target.files ?? []))
                  event.target.value = ''
                }} />
                <span className="file-picker-button">{t.settings.chooseLocalPreviewFolder}</span>
                <span className="file-picker-hint">{localPdfCount ? t.settings.localPreviewSelected.replace('{count}', String(localPdfCount)) : t.settings.localPreviewNone}</span>
              </label>

              <div className="settings-divider" />
              <span className="settings-label">{t.settings.metadata}</span>
              <p className="home-help">{t.settings.metadataHelp}</p>
              <button onClick={refreshOpenAlexMetadata} disabled={refreshingMetadata}>
                {refreshingMetadata ? t.settings.metadataRefreshing.replace('{count}', '…') : t.settings.refreshMetadata}
              </button>
              {metadataProgress && <div className="folder-status">{metadataProgress}</div>}

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

          {section === 'metadata' && (
            <div className="settings-section">
              <p className="home-help">{t.settings.metadataRepairHelp}</p>
              {metadataRepairError && <div className="app-error home-inline-error">{metadataRepairError}</div>}
              {unresolvedPapers.length === 0 ? <p className="folder-status">{t.settings.metadataRepairEmpty}</p> : (
                <div className="metadata-repair-list">
                  {unresolvedPapers.map((paper) => (
                    <div key={paper.key} className="metadata-repair-row">
                      <code title={paper.key}>{paper.filename}</code>
                      <input
                        value={titleDrafts[paper.key] ?? ''}
                        onChange={(event) => setTitleDrafts((drafts) => ({ ...drafts, [paper.key]: event.target.value }))}
                        placeholder={t.settings.metadataTitlePlaceholder}
                      />
                      <button className="primary" onClick={() => submitManualTitle(paper)} disabled={savingTitle === paper.key || !(titleDrafts[paper.key] ?? '').trim()}>
                        {savingTitle === paper.key ? t.settings.metadataSubmitting : t.settings.metadataSubmit}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </section>
    </div>
  )
}
