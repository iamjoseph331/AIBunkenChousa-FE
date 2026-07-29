import { useCallback, useRef, useState } from 'react'
import { api, type CategoryDef, type SubqueryDef } from '../api'
import { ConfidenceDots, StanceBadge, TrustBar } from './bits'
import NewRunForm from './NewRunForm'
import HomeDashboard from './HomeDashboard'
import { useLang, useT } from '../i18n'

interface Term {
  term: string
  sample: React.ReactNode
  en: string
  ja: string
}

// The report table's columns, explained plainly in both languages. The sample on
// each card is the very cell the reader will meet in the table, so the glossary
// and the product speak the same visual language.
const TERMS: Term[] = [
  {
    term: 'Stance / 立場',
    sample: <StanceBadge label="supportive" polarity={1} />,
    en: "The paper's position toward your query — supportive, critical, mixed, neutral, or not addressed — with a polarity arrow. Papers that never discuss the query are labelled honestly rather than forced into an opinion.",
    ja: 'クエリに対する論文の立場（支持・批判・両論・中立・言及なし）を、極性の矢印つきで示します。クエリに触れていない論文は無理に意見づけせず、正直に「言及なし」と表示します。',
  },
  {
    term: 'Relevance / 関連度',
    sample: <span className="home-sample-num">87</span>,
    en: 'A 0–100 score of how relevant the paper is to your query. It blends local embedding similarity (free and re-computable) with the model’s own judgment. You can re-rank the whole table against any new query at no cost.',
    ja: 'クエリとの関連度を0〜100で表します。ローカル埋め込みの類似度（無料・再計算可能）とモデルの判断を組み合わせています。新しいクエリで表全体を無料で並べ替えられます。',
  },
  {
    term: 'Confidence / 確信度',
    sample: <ConfidenceDots confidence="high" />,
    en: 'How sure the model is about its stance call for this paper — high, medium, or low, shown as filled dots. Treat low-confidence rows with more caution.',
    ja: 'その論文の立場判定に対するモデルの確信度（高・中・低）を、点の数で示します。確信度が低い行はより慎重に扱ってください。',
  },
  {
    term: 'Trust / 信頼度',
    sample: <TrustBar verified={9} total={10} />,
    en: 'The share of the paper’s evidence quotes that were machine-verified against the real PDF text (a fuzzy string match to the cited page). This is the honesty core: not “the AI said so”, but “here is the exact sentence, on this page, verified — click to confirm”.',
    ja: '論文の根拠引用のうち、実際のPDF本文と機械照合できた割合です（引用ページへのあいまい文字列一致）。本ツールの核心で、「AIが言った」ではなく「このページのこの一文を検証済み。クリックで確認」を保証します。',
  },
  {
    term: 'Extraction / 抽出品質',
    sample: (
      <span className="home-sample-bar">
        <span className="home-sample-bar-fill" style={{ width: '78%' }} />
      </span>
    ),
    en: 'How cleanly the PDF text was extracted — the share of pages that parsed well. Scanned or dense two-column PDFs score lower; a low score means quotes on those pages are less reliable and worth reading by hand.',
    ja: 'PDFの本文がどれだけきれいに抽出できたか（正しく解析できたページの割合）です。スキャンや二段組の論文は低くなりがちで、スコアが低いページの引用は信頼性が下がるため手作業での確認をおすすめします。',
  },
]

interface UploadStatus {
  filename: string
  state: 'ok' | 'skip' | 'error'
  detail?: string
}

interface Props {
  onOpenRun: (runId: number) => void
}

export default function HomePage({ onOpenRun }: Props) {
  const { lang } = useLang()
  const t = useT()
  const [queryDraft, setQueryDraft] = useState('')
  const [categories, setCategories] = useState<CategoryDef[]>([])
  const [subqueries, setSubqueries] = useState<SubqueryDef[]>([])
  const [showRun, setShowRun] = useState(false)
  const [dragActive, setDragActive] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploads, setUploads] = useState<UploadStatus[]>([])
  const fileRef = useRef<HTMLInputElement | null>(null)

  const uploadFiles = useCallback(async (files: File[]) => {
    const pdfs = files.filter((f) => f.name.toLowerCase().endsWith('.pdf'))
    if (!pdfs.length) return
    setUploading(true)
    const results: UploadStatus[] = []
    for (const f of pdfs) {
      try {
        const r = await api.uploadPdf(f)
        results.push({ filename: r.filename, state: r.saved ? 'ok' : 'skip', detail: r.reason })
      } catch (e) {
        results.push({ filename: f.name, state: 'error', detail: String(e instanceof Error ? e.message : e) })
      }
    }
    setUploads((prev) => [...results, ...prev])
    setUploading(false)
  }, [])

  function onDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragActive(false)
    uploadFiles(Array.from(e.dataTransfer.files))
  }

  const slr = t.slr

  return (
    <div className="home">
      <div className="home-inner">
        <div className="home-hero">
          <div className="home-hero-text">
            <h2>{t.home.title}</h2>
            <p>{t.home.subtitle}</p>
          </div>
        </div>

        <section className="home-query">
          <h3>{t.home.run}</h3>
          <p className="home-help">{t.home.runHelp}</p>
          <form
            className="query-bar"
            onSubmit={(e) => {
              e.preventDefault()
              if (queryDraft.trim()) setShowRun(true)
            }}
          >
            <input
              type="text"
              className="query-input"
              value={queryDraft}
              onChange={(e) => setQueryDraft(e.target.value)}
              placeholder={t.home.runPlaceholder}
            />
            <button type="submit" className="primary query-cta" disabled={!queryDraft.trim()}>
              {t.home.runCta}
            </button>
          </form>
          <div className="home-categories">
            <h4>{t.categories.title}</h4>
            <p className="home-help">{t.categories.editHint}</p>
            <div className="cat-editor">
              {categories.map((category, index) => (
                <div className="cat-editor-row" key={index}>
                  <button
                    type="button"
                    className="category-slot-swatch"
                    style={{ background: `var(--cat-${category.color_slot ?? (index % 10) + 1})` }}
                    title={t.settings.categoryColor}
                    onClick={() => setCategories((items) => items.map((item, itemIndex) => itemIndex === index
                      ? { ...item, color_slot: ((item.color_slot ?? index + 1) % 10) + 1 }
                      : item))}
                  />
                  <input value={category.name} onChange={(event) => setCategories((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, name: event.target.value } : item))} placeholder={t.categories.namePlaceholder} />
                  <input value={category.definition ?? ''} onChange={(event) => setCategories((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, definition: event.target.value } : item))} placeholder={t.categories.defPlaceholder} />
                  <button type="button" className="link" onClick={() => setCategories((items) => items.filter((_, itemIndex) => itemIndex !== index))}>{t.categories.remove}</button>
                </div>
              ))}
              <button type="button" onClick={() => setCategories((items) => [...items, { name: '', definition: '', color_slot: (items.length % 10) + 1 }])} style={{ alignSelf: 'flex-start' }}>{t.categories.addRow}</button>
            </div>
          </div>
          <div className="home-subqueries">
            <h4>{t.subqueries.title}</h4>
            <p className="home-help">{t.subqueries.editHint}</p>
            <div className="sq-rows">
              {subqueries.map((subquery, index) => (
                <div className="sq-row" key={index}>
                  <input value={subquery.label} onChange={(event) => setSubqueries((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, label: event.target.value } : item))} placeholder={t.subqueries.labelPlaceholder} />
                  <input value={subquery.question} onChange={(event) => setSubqueries((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, question: event.target.value } : item))} placeholder={t.subqueries.questionPlaceholder} />
                  <input className="sq-id" value={subquery.id ?? ''} onChange={(event) => setSubqueries((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, id: event.target.value || null } : item))} placeholder={t.subqueries.idLabel} />
                  <button type="button" className="sq-remove" aria-label="Remove" onClick={() => setSubqueries((items) => items.filter((_, itemIndex) => itemIndex !== index))}>✕</button>
                </div>
              ))}
              <button type="button" className="sq-add" onClick={() => setSubqueries((items) => [...items, { id: null, label: '', question: '' }])}>+ {t.subqueries.addRow}</button>
            </div>
          </div>
        </section>

        <HomeDashboard />

        <section className="home-section">
          <h3>{t.home.glossary}</h3>
          <div className="glossary-grid">
            {TERMS.map((item) => (
              <div key={item.term} className="glossary-card">
                <div className="glossary-head">
                  <span className="glossary-term">{item.term}</span>
                  <span className="glossary-sample">{item.sample}</span>
                </div>
                <p className={`glossary-desc${lang === 'ja' ? ' cjk' : ''}`}>{lang === 'en' ? item.en : item.ja}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="home-section home-slr">
          <h3>{slr.title}</h3>
          <p className={`home-help slr-lede${lang === 'ja' ? ' cjk' : ''}`}>{slr.lede}</p>
          {slr.groups.map((g, gi) => (
            <div key={gi} className="slr-group">
              <h4>{g.heading}</h4>
              {g.lede && <p className={`slr-para${lang === 'ja' ? ' cjk' : ''}`}>{g.lede}</p>}
              {g.bullets && (
                g.ordered ? (
                  <ol className="slr-list slr-ol">
                    {g.bullets.map((b, bi) => (
                      <li key={bi} className={lang === 'ja' ? 'cjk' : ''}><b>{b.b}</b> {b.t}</li>
                    ))}
                  </ol>
                ) : (
                  <ul className="slr-list">
                    {g.bullets.map((b, bi) => (
                      <li key={bi} className={lang === 'ja' ? 'cjk' : ''}><b>{b.b}</b> {b.t}</li>
                    ))}
                  </ul>
                )
              )}
              {g.para && <p className={`slr-para${lang === 'ja' ? ' cjk' : ''}`}>{g.para}</p>}
            </div>
          ))}
        </section>

        <section className="home-section">
          <h3>{t.home.upload}</h3>
          <p className="home-help">{t.home.uploadHelp}</p>
          <div
            className={`dropzone${dragActive ? ' drag-active' : ''}`}
            onDragOver={(e) => { e.preventDefault(); setDragActive(true) }}
            onDragLeave={() => setDragActive(false)}
            onDrop={onDrop}
            onClick={() => fileRef.current?.click()}
            role="button"
            tabIndex={0}
          >
            <input
              ref={fileRef}
              type="file"
              accept="application/pdf"
              multiple
              hidden
              onChange={(e) => { uploadFiles(Array.from(e.target.files ?? [])); e.target.value = '' }}
            />
            <div className="dropzone-icon">⤓</div>
            <div className="dropzone-label">
              {uploading ? t.home.uploading : dragActive ? t.home.dropActive : t.home.drop}
            </div>
          </div>
          {uploads.length > 0 && (
            <ul className="upload-list">
              {uploads.map((u, i) => (
                <li key={i} className={`upload-item upload-${u.state}`}>
                  <span className="upload-mark">{u.state === 'ok' ? '✓' : u.state === 'skip' ? '•' : '✗'}</span>
                  <span className="upload-name">{u.filename}</span>
                  {u.detail && <span className="upload-detail">{u.detail}</span>}
                </li>
              ))}
            </ul>
          )}
        </section>

        <footer className="home-footer">©︎Joseph Chen 2026</footer>
      </div>

      {showRun && (
        <NewRunForm
          initialQuery={queryDraft.trim()}
          initialCategories={categories}
          initialSubqueries={subqueries}
          onClose={() => setShowRun(false)}
          onDone={(id) => {
            setShowRun(false)
            onOpenRun(id)
          }}
        />
      )}
    </div>
  )
}
