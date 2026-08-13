import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api, hasClaudeApiKey, type Run } from '../api'
import { useT } from '../i18n'

interface Msg {
  role: 'user' | 'assistant'
  content: string
}

interface Props {
  runId: number | null
  onRunIdChange: (id: number) => void
}

const CHAT_MODELS = ['claude-sonnet-5', 'claude-opus-4-8', 'claude-haiku-4-5']

export default function ChatView({ runId, onRunIdChange }: Props) {
  const t = useT()
  const [runs, setRuns] = useState<Run[]>([])
  const [messages, setMessages] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [model, setModel] = useState('claude-sonnet-5')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const keySaved = hasClaudeApiKey()

  useEffect(() => {
    api.runs().then(
      (rs) => {
        setRuns(rs)
        if (runId == null && rs.length > 0) onRunIdChange(rs[0].id)
      },
      () => setRuns([]),
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // A conversation is scoped to one run; switching runs starts over so the
  // model isn't answering with stale context in its head.
  useEffect(() => {
    setMessages([])
    setError(null)
  }, [runId])

  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages])

  const canSend = useMemo(
    () => keySaved && runId != null && input.trim().length > 0 && !busy,
    [keySaved, runId, input, busy],
  )

  const send = useCallback(async () => {
    const text = input.trim()
    if (!text || runId == null) return
    const next: Msg[] = [...messages, { role: 'user', content: text }, { role: 'assistant', content: '' }]
    setMessages(next)
    setInput('')
    setBusy(true)
    setError(null)
    const controller = new AbortController()
    abortRef.current = controller
    try {
      // Send only user/assistant history (drop the empty placeholder we just
      // pushed) — the backend attaches its own system context.
      const payload = next.slice(0, -1).map((m) => ({ role: m.role, content: m.content }))
      await api.chat(runId, payload, (delta) => {
        setMessages((cur) => {
          const copy = cur.slice()
          const tail = copy[copy.length - 1]
          if (tail && tail.role === 'assistant') {
            copy[copy.length - 1] = { ...tail, content: tail.content + delta }
          }
          return copy
        })
      }, { signal: controller.signal, model })
    } catch (e) {
      const err = e as Error
      if (err.name !== 'AbortError') setError(err.message || String(err))
    } finally {
      setBusy(false)
      abortRef.current = null
    }
  }, [input, runId, messages, model])

  function stop() {
    abortRef.current?.abort()
  }

  function clear() {
    if (busy) stop()
    setMessages([])
    setError(null)
  }

  function suggest(q: string) {
    setInput(q)
  }

  const suggestions = [t.chat.suggest1, t.chat.suggest2, t.chat.suggest3]

  return (
    <>
      <div className="subtoolbar">
        <label className="run-picker">
          {t.report.runLabel}
          <select
            value={runId ?? ''}
            onChange={(e) => onRunIdChange(Number(e.target.value))}
          >
            {runs.map((r) => (
              <option key={r.id} value={r.id}>
                #{r.id} · {r.query ? r.query.slice(0, 40) : t.report.noQuery} · {r.n_papers ?? '?'}p
              </option>
            ))}
          </select>
        </label>
        <label className="run-picker">
          {t.chat.model}
          <select value={model} onChange={(e) => setModel(e.target.value)} disabled={busy}>
            {CHAT_MODELS.map((value) => <option key={value} value={value}>{value.replace('claude-', '').replace(/-/g, ' ')}</option>)}
          </select>
        </label>
        <button onClick={clear} disabled={messages.length === 0}>
          {t.chat.clear}
        </button>
      </div>

      <div className="chat-wrap">
        <header className="chat-header">
          <h3>{t.chat.title}</h3>
          <p className="ink-3">{t.chat.subtitle}</p>
        </header>

        {!keySaved && <div className="chat-notice">{t.chat.needKey}</div>}
        {keySaved && runId == null && <div className="chat-notice">{t.chat.needRun}</div>}

        <div className="chat-messages" ref={scrollRef}>
          {messages.length === 0 && runId != null && keySaved && (
            <div className="chat-empty">
              <div className="ink-3">{t.chat.empty}</div>
              <div className="chat-suggestions">
                {suggestions.map((s) => (
                  <button key={s} className="chat-suggest" onClick={() => suggest(s)}>{s}</button>
                ))}
              </div>
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} className={`chat-msg chat-msg-${m.role}`}>
              <div className="chat-role">{m.role === 'user' ? t.chat.you : t.chat.assistant}</div>
              <div className="chat-body">
                {m.content || (busy && i === messages.length - 1 ? <span className="chat-cursor">▍</span> : null)}
              </div>
            </div>
          ))}
          {error && <div className="chat-error">{t.chat.failed} {error}</div>}
        </div>

        <form
          className="chat-composer"
          onSubmit={(e) => { e.preventDefault(); if (canSend) send() }}
        >
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={t.chat.placeholder}
            rows={2}
            disabled={!keySaved || runId == null}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                if (canSend) send()
              }
            }}
          />
          {busy ? (
            <button type="button" onClick={stop} className="chat-stop">{t.chat.stop}</button>
          ) : (
            <button type="submit" disabled={!canSend}>{t.chat.send}</button>
          )}
        </form>
      </div>
    </>
  )
}
