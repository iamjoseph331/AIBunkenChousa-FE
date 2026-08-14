// Typed client for the AIBunkenChousa backend. Shapes mirror backend/app/db.py
// and schema.py. All requests go to /api (Vite proxies to uvicorn in dev).
import { localPdfUrl } from './localPdfs'

export type StanceLabel =
  | 'supportive'
  | 'critical'
  | 'mixed'
  | 'neutral'
  | 'not_addressed'
export type Confidence = 'high' | 'medium' | 'low'
export type EvidenceStatus =
  | 'verified'
  | 'page_mismatch'
  | 'unverified'
  | 'too_short'

/** One category assignment on a paper (from db.paper_categories joined into run_report). */
export interface PaperCategoryAssignment {
  category_id: string
  name: string
  color_slot: number
  confidence: number
  is_primary: boolean
  producer: 'analysis' | 'cheap' | 'deep' | 'human'
  rationale?: string | null
  evidence_page?: number | null
  evidence_quote?: string | null
  model?: string | null
}

/** One row of a run's report table (db.run_report — analyses joined to papers,
 * paper_enrich (v0.2), and per-paper categories on the run's current set). */
export interface ReportRow {
  id: number
  paper_key: string
  paper_sha256: string
  query: string | null
  lang: string
  model: string
  stance_label: StanceLabel | null
  polarity: number | null
  confidence: Confidence | null
  relevance_score: number | null
  method_type: string | null
  location: string | null
  research_period: string | null
  team_size: string | null
  sample_size: string | null
  trust: number
  n_evidence: number
  n_verified: number
  input_tokens: number
  output_tokens: number
  usd: number
  created_at: number
  filename: string | null
  n_pages: number | null
  quality: number | null
  year: number | null
  // v0.2 OpenAlex enrichment (nullable — OpenAlex misses ~5% of the corpus)
  openalex_id: string | null
  pub_type: string | null
  venue_name: string | null
  publisher: string | null
  cited_by_count: number | null
  primary_domain: string | null
  primary_field: string | null
  primary_subfield: string | null
  venue_2yr_mean_citedness: number | null
  venue_h_index: number | null
  author_countries: string[] | null
  enrich_source: 'openalex' | 'crossref' | null
  enrich_status: 'ok' | 'missing' | 'error' | null
  // v0.2 target geography (from analyses.target_countries, filled by the Opus pass)
  target_countries: string[] | null
  // v0.2 categories on the run's current set
  categories: PaperCategoryAssignment[]
  // v0.3 subquery answers on the run's current subquery set. Keyed by
  // subquery_id; each value carries the paper's answer + confidence (as a
  // 0..1 float — high=0.9, medium=0.6, low=0.3, mirroring the backend).
  subquery_answers: Record<string, SubqueryAnswerCell>
  subquery_set: { id: number; subqueries: SubqueryDefStored[] } | null
}

export type SubqueryStance = 'yes' | 'no' | 'mixed' | 'not_addressed'
export interface SubqueryAnswerCell {
  stance: SubqueryStance
  finding: string | null
  confidence: number
}

export interface Evidence {
  page: number
  quote: string
}
export interface StanceDetail {
  label: StanceLabel
  polarity: number
  confidence: Confidence
  reasoning: string
  evidence: Evidence[]
}
export interface Bullet {
  point: string
  evidence: Evidence[]
}
export interface MetaField {
  value: string | null
  not_reported: boolean
  evidence: Evidence[]
}
export interface Metadata {
  research_period: MetaField
  location: MetaField
  team_size: MetaField
  sample_size: MetaField
  method_type: MetaField
}
export interface Relevance {
  score: number
  rationale: string
}
export interface AnalysisBody {
  stance: StanceDetail
  summary: Bullet[]
  metadata: Metadata
  relevance: Relevance
  categories?: Array<{ category: string; rationale: string; confidence: Confidence; evidence: Evidence[] }>
  subqueries?: Array<{ subquery_id: string; stance: SubqueryStance; finding: string | null; confidence: Confidence; evidence: Evidence[] }>
}

/** A verified evidence check (db.evidence). */
export interface EvidenceCheck {
  field: string
  page: number
  quote: string
  status: EvidenceStatus
  score: number
  found_page: number | null
}

export interface AnalysisDetail extends ReportRow {
  extracted_title: string | null
  analysis: AnalysisBody
  evidence: EvidenceCheck[]
  low_quality_pages: number[]
}

export interface Run {
  id: number
  query: string | null
  lang: string
  model: string
  provider?: LLMProvider
  mode: string
  status: 'running' | 'done' | 'error'
  batch_id: string | null
  error: string | null
  created_at: number
  finished_at: number | null
  elapsed_seconds: number
  total_usd: number
  n_papers?: number
}

export interface RunDetail {
  run: Run
  report: ReportRow[]
}

export interface Paper {
  key: string
  filename: string
  pdf_path: string
  n_pages: number
  quality: number
}

export interface Estimate {
  n_papers: number
  input_tokens: number
  output_tokens_est: number
  usd_est: number
  duration_est_seconds: number | null
  duration_est_source: 'model_mode' | 'mode' | 'none'
  duration_est_samples: number
  model: string
  provider: LLMProvider
  approximate_tokens: boolean
}

export interface CategoryDef {
  name: string
  definition?: string | null
  /** 1-based slot in the user-editable category palette. */
  color_slot?: number | null
}

export interface SubqueryDef {
  id?: string | null
  label: string
  question: string
}

export interface RunRequest {
  query?: string | null
  lang?: string
  model?: string
  provider?: LLMProvider
  mode?: 'sync' | 'batch'
  limit?: number | null
  // v0.2: user-defined categories for classification. Server persists them
  // to a new category_sets row for this run.
  categories?: CategoryDef[]
  // v0.3: user-defined sub-research-questions. Baked into the Opus prompt.
  subqueries?: SubqueryDef[]
}

export interface RerankScore {
  paper_key: string
  cosine: number
  embed_relevance: number
}
export interface RerankResult {
  query: string
  model: string
  scores: RerankScore[]
}

// --- settings + corpus folder (Home page) -----------------------------------
export interface Settings {
  papers_dir: string
  exists: boolean
  n_pdfs: number
  openalex_api_key_saved: boolean
}

// --- OpenAlex enrichment (v0.2 Step 1) --------------------------------------
export interface EnrichStatus {
  n_papers: number
  n_enriched: number
  n_openalex: number
  n_crossref: number
  n_missing: number
  n_error: number
  n_untried: number
}
export interface EnrichRow {
  paper_key: string
  source: 'openalex' | 'crossref' | 'none'
  openalex_id: string | null
  doi: string | null
  title: string | null
  year: number | null
  pub_type: string | null
  venue_name: string | null
  venue_issn: string | null
  publisher: string | null
  venue_2yr_mean_citedness: number | null
  venue_h_index: number | null
  cited_by_count: number | null
  primary_domain: string | null
  primary_field: string | null
  primary_subfield: string | null
  topics_json: string | null
  authors_json: string | null
  author_countries: string | null // JSON-serialised
  referenced_works: string | null // JSON-serialised
  status: 'ok' | 'missing' | 'error'
  error: string | null
  fetched_at: number
}
export interface UnresolvedMetadataPaper {
  key: string
  filename: string
}

// --- categories (v0.2 Step 2) -----------------------------------------------
export interface CategoryDefStored extends CategoryDef {
  id: string
  color_slot: number   // 1..10 → --cat-1..--cat-10
  origin: 'user' | 'proposed'
}
export interface CategorySet {
  id: number
  run_id: number
  version: string
  is_current: number
  created_at: number
  categories: CategoryDefStored[]
}
export interface CategoryProposal {
  id: number
  set_id: number
  name: string
  definition: string | null
  paper_key: string
  rationale: string | null
  status: 'pending' | 'accepted' | 'rejected' | 'merged'
  merged_into: string | null
  created_at: number
}
export interface CategoriesPayload {
  set: CategorySet | null
  counts: Record<string, { n_total: number; n_primary: number }>
  proposals: CategoryProposal[]
}

// --- subqueries (v0.3) ------------------------------------------------------
export interface SubqueryDefStored {
  id: string
  label: string
  question: string | null
  color_slot: number   // 1..10 → --cat-1..--cat-10 (reused palette)
}
export interface SubquerySet {
  id: number
  run_id: number
  version: string
  is_current: number
  created_at: number
  subqueries: SubqueryDefStored[]
}
export interface SubqueryCounts {
  n_yes: number
  n_no: number
  n_mixed: number
  n_not_addressed: number
  n_high_conf: number
}
export interface SubqueriesPayload {
  set: SubquerySet | null
  counts: Record<string, SubqueryCounts>
}
/** One stored row from paper_subquery_answers, for a single paper detail view. */
export interface PaperSubqueryAnswer {
  paper_key: string
  set_id: number
  subquery_id: string
  label?: string
  stance: SubqueryStance
  finding: string | null
  confidence: number
  evidence_page: number | null
  evidence_quote: string | null
  producer: string
  model: string | null
  created_at?: number
}

// --- citation graph (Phase 2 + v0.2 Step 8a) --------------------------------
export interface GraphNode {
  key: string
  title: string
  filename: string
  year: number | null
  authors: string | null
  n_refs: number
  in_degree: number
  out_degree: number
  external_refs: number
  status: string | null
  enrich_source?: 'openalex' | 'crossref' | null
  categories: PaperCategoryAssignment[]
  stance_label?: StanceLabel | null
}
export interface GraphEdge {
  source: string
  target: string
  match_type: 'openalex' | 'doi' | 'title'
  score: number
}
export interface CitationGraph {
  nodes: GraphNode[]
  edges: GraphEdge[]
  n_processed: number
  n_papers: number
  n_openalex_edges?: number
  n_grobid_edges?: number
  built: boolean
}
export interface ExternalRef {
  title: string | null
  doi: string | null
  year: number | null
  authors: string | null
  raw: string | null
}

// --- concept graph (Phase 3) ------------------------------------------------
export interface ConceptNode {
  key: string
  title: string
  authors: string | null
  year: number | null
  stance: StanceLabel | null
  polarity: number | null
  relevance: number | null
  categories: PaperCategoryAssignment[]
}
export interface ConceptEdge {
  source: string
  target: string
  relation: 'supporting' | 'opposing' | 'neutral'
  strength: number
  rationale: string | null
  cosine: number | null
}
export interface ConceptGraphData {
  nodes: ConceptNode[]
  edges: ConceptEdge[]
  n_nodes: number
  model: string
  analysis_model: string
  built: boolean
}
export type ConceptSeed = 'citation' | 'similarity'
export interface ConceptEstimate {
  n_nodes: number
  n_candidates: number
  n_cached: number
  n_to_classify: number
  seed: ConceptSeed
  model: string
  usd_est: number
  usd_est_batch: number
}

export type LLMProvider = 'anthropic' | 'openai'
export interface LLMSettings { provider: LLMProvider; baseUrl: string; model: string; apiKey: string }
const LLM_STORAGE = 'aibc-llm-settings'
const API_BASE = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '')
const DEFAULT_LLM: LLMSettings = { provider: 'anthropic', baseUrl: 'http://localhost:11434/v1', model: 'claude-opus-4-8', apiKey: localStorage.getItem('aibc-claude-api-key') || '' }
let llmSettings: LLMSettings = (() => {
  try { return { ...DEFAULT_LLM, ...JSON.parse(localStorage.getItem(LLM_STORAGE) || '{}') } }
  catch { return DEFAULT_LLM }
})()
export function getLLMSettings(): LLMSettings { return { ...llmSettings } }
export function setLLMSettings(value: LLMSettings): boolean {
  llmSettings = { ...value, baseUrl: value.baseUrl.trim().replace(/\/$/, ''), model: value.model.trim(), apiKey: value.apiKey.trim() }
  localStorage.setItem(LLM_STORAGE, JSON.stringify(llmSettings))
  return hasLLMConnection()
}
export function hasLLMConnection() { return Boolean(llmSettings.model && (llmSettings.provider === 'openai' ? llmSettings.baseUrl : llmSettings.apiKey)) }
function llmHeaders(): Record<string, string> {
  if (!hasLLMConnection()) throw new Error('Configure your LLM connection in Settings before starting a model action.')
  return { 'X-LLM-Provider': llmSettings.provider, 'X-LLM-Base-URL': llmSettings.baseUrl,
    'X-LLM-Model': llmSettings.model, ...(llmSettings.apiKey ? { 'X-LLM-API-Key': llmSettings.apiKey } : {}) }
}

async function get<T>(path: string, options: { llm?: boolean } = {}): Promise<T> {
  const res = await fetch(`${API_BASE}/api${path}`, { headers: options.llm ? llmHeaders() : {} })
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} — ${path}`)
  return res.json() as Promise<T>
}

async function post<T>(path: string, body: unknown, options: { llm?: boolean } = {}): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (options.llm) Object.assign(headers, llmHeaders())
  const res = await fetch(`${API_BASE}/api${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    let detail = `${res.status} ${res.statusText}`
    try {
      const j = await res.json()
      if (j.detail) detail = typeof j.detail === 'string' ? j.detail : JSON.stringify(j.detail)
    } catch {
      /* keep status text */
    }
    throw new Error(detail)
  }
  return res.json() as Promise<T>
}

export const api = {
  runs: () => get<Run[]>('/runs'),
  run: (id: number) => get<RunDetail>(`/runs/${id}`),
  papers: () => get<Paper[]>('/papers'),
  analysis: (id: number) => get<AnalysisDetail>(`/analyses/${id}`),
  pages: (key: string) => get<{ number: number; section: string | null; text: string; low_quality: number }[]>(
    `/papers/${encodeURIComponent(key)}/pages`,
  ),
  estimate: (req: RunRequest) => post<Estimate>('/runs/estimate', req, { llm: true }),
  rerank: (runId: number, query: string) => post<RerankResult>(`/runs/${runId}/rerank`, { query }),
  startRun: (req: RunRequest) => post<{ run_id: number; status: string; n_papers: number; mode: string }>('/runs', req, { llm: true }),
  addPapers: (runId: number) => post<{ run_id: number; status: string; n_candidates: number }>(`/runs/${runId}/add-papers`, {}, { llm: true }),
  pdfUrl: (key: string) => localPdfUrl(key) ?? `${API_BASE}/api/papers/${encodeURIComponent(key)}/pdf`,
  exportUrl: (runId: number, fmt: 'xlsx' | 'csv', keys?: string[]) => {
    const q = keys && keys.length ? `?keys=${encodeURIComponent(keys.join(','))}` : ''
    return `${API_BASE}/api/runs/${runId}/export.${fmt}${q}`
  },
  runBundleUrl: (runId: number) => `${API_BASE}/api/runs/${runId}/export.run.json`,
  importRunBundle: (bundle: unknown) => post<{ run_id: number }>('/runs/import', bundle),
  eventsUrl: (runId: number) => `${API_BASE}/api/runs/${runId}/events`,

  // settings + upload (Home)
  settings: () => get<Settings>('/settings'),
  saveSettings: (papers_dir: string) => post<Settings>('/settings', { papers_dir }),
  saveOpenAlexKey: (api_key: string) => put<Settings>('/settings/openalex-key', { api_key }),
  uploadPdf: async (file: File): Promise<{ filename: string; saved: boolean; reason?: string }> => {
    const res = await fetch(`${API_BASE}/api/papers/upload?filename=${encodeURIComponent(file.name)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/pdf' },
      body: file,
    })
    if (!res.ok) {
      let detail = `${res.status} ${res.statusText}`
      try {
        const j = await res.json()
        if (j.detail) detail = typeof j.detail === 'string' ? j.detail : JSON.stringify(j.detail)
      } catch { /* keep status text */ }
      throw new Error(detail)
    }
    return res.json()
  },

  // citation graph (Phase 2)
  grobidStatus: () => get<{ alive: boolean; url: string }>('/grobid/status'),
  citationGraph: () => get<CitationGraph>('/citations/graph'),
  externalRefs: (key: string) => get<ExternalRef[]>(`/papers/${encodeURIComponent(key)}/external-refs`),
  buildCitations: (keys?: string[]) => {
    const q = keys && keys.length ? `?keys=${encodeURIComponent(keys.join(','))}` : ''
    return post<{ status: string }>(`/citations/build${q}`, {})
  },
  citationEventsUrl: () => `${API_BASE}/api/citations/events`,

  // concept graph (Phase 3, v0.2 Step 8b adds an `n` param for the subset size)
  conceptGraph: (runId: number, n?: number) =>
    get<ConceptGraphData>(`/runs/${runId}/concept/graph${n ? `?n=${n}` : ''}`, { llm: true }),
  conceptEstimate: (runId: number, seed: ConceptSeed = 'citation', n?: number) =>
    get<ConceptEstimate>(`/runs/${runId}/concept/estimate?seed=${seed}${n ? `&n=${n}` : ''}`, { llm: true }),
  buildConcept: (runId: number, seed: ConceptSeed = 'citation', n?: number) =>
    post<{ status: string }>(
      `/runs/${runId}/concept/build?seed=${seed}${n ? `&n=${n}` : ''}`, {}, { llm: true },
    ),
  conceptEventsUrl: (runId: number) => `${API_BASE}/api/runs/${runId}/concept/events`,

  // enrichment (v0.2 Step 1) — free, no Claude key
  enrichStatus: () => get<EnrichStatus>('/enrich/status'),
  buildEnrich: (keys?: string[]) => post<{ status: string }>('/enrich/build', { keys: keys ?? [] }),
  enrichEventsUrl: () => `${API_BASE}/api/enrich/events`,
  paperEnrich: (key: string) => get<EnrichRow>(`/papers/${encodeURIComponent(key)}/enrich`),
  unresolvedMetadata: () => get<{ papers: UnresolvedMetadataPaper[] }>('/metadata/unresolved'),
  setManualMetadataTitle: (key: string, title: string) =>
    put<{ status: string; summary: { hits: number; missing: number; errors: number } }>(
      `/metadata/papers/${encodeURIComponent(key)}/title`, { title },
    ),

  // categories (v0.2 Step 2)
  categories: (runId: number) => get<CategoriesPayload>(`/runs/${runId}/categories`),
  saveCategories: (runId: number, categories: CategoryDef[]) =>
    put<{ set_id: number; version: string; categories: CategoryDefStored[] }>(
      `/runs/${runId}/categories`, { categories },
    ),
  classifyCategories: (runId: number) =>
    post<{ status: string; run_id: number }>(
      `/runs/${runId}/categories/classify`, {}, { llm: true },
    ),
  categoryEventsUrl: (runId: number) => `${API_BASE}/api/runs/${runId}/categories/events`,
  actOnProposal: (runId: number, proposalId: number, action: 'accept' | 'reject' | 'merge', into?: string) =>
    post<{ status: string; set_id?: number; version?: string; into?: string }>(
      `/runs/${runId}/categories/proposals/${proposalId}`,
      { action, into: into ?? null },
    ),
  reclassifyPaper: (paperKey: string, runId: number) =>
    post<{ set_id: number; paper_key: string; n_assigned: number; n_proposed: number; total_usd: number }>(
      `/papers/${encodeURIComponent(paperKey)}/categories/reclassify?run_id=${runId}`,
      {}, { llm: true },
    ),
  paperCategories: (runId: number, key: string) =>
    get<PaperCategoryAssignment[]>(`/runs/${runId}/papers/${encodeURIComponent(key)}/categories`),

  // subqueries (v0.3) — same shape as the categories endpoints, minus
  // proposals + classify (subqueries are Opus-inline only in this release).
  subqueries: (runId: number) => get<SubqueriesPayload>(`/runs/${runId}/subqueries`),
  saveSubqueries: (runId: number, subqueries: SubqueryDef[]) =>
    put<{ set_id: number; version: string; subqueries: SubqueryDefStored[] }>(
      `/runs/${runId}/subqueries`, { subqueries },
    ),
  paperSubqueries: (runId: number, key: string) =>
    get<PaperSubqueryAnswer[]>(`/runs/${runId}/papers/${encodeURIComponent(key)}/subqueries`),

  /** Stream a chat reply grounded in a run's report + stats snapshot. The
   * backend returns text/plain chunks; the callback fires per chunk so the UI
   * can render tokens as they arrive. */
  chat: async (
    runId: number,
    messages: { role: 'user' | 'assistant'; content: string }[],
    onChunk: (delta: string) => void,
    opts?: { signal?: AbortSignal; model?: string },
  ): Promise<void> => {
    const res = await fetch(`${API_BASE}/api/runs/${runId}/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...llmHeaders(),
      },
      body: JSON.stringify({ messages, model: opts?.model }),
      signal: opts?.signal,
    })
    if (!res.ok || !res.body) {
      let detail = `${res.status} ${res.statusText}`
      try {
        const j = await res.json()
        if (j.detail) detail = typeof j.detail === 'string' ? j.detail : JSON.stringify(j.detail)
      } catch { /* keep status text */ }
      throw new Error(detail)
    }
    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      if (value) onChunk(decoder.decode(value, { stream: true }))
    }
    const tail = decoder.decode()
    if (tail) onChunk(tail)
  },
}

async function put<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}/api${path}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    let detail = `${res.status} ${res.statusText}`
    try {
      const j = await res.json()
      if (j.detail) detail = typeof j.detail === 'string' ? j.detail : JSON.stringify(j.detail)
    } catch { /* keep status text */ }
    throw new Error(detail)
  }
  return res.json() as Promise<T>
}
