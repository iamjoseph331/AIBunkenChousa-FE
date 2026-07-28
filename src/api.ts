// Typed client for the AIBunkenChousa backend. Shapes mirror backend/app/db.py
// and schema.py. All requests go to /api (Vite proxies to uvicorn in dev).

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

/** One row of a run's report table (db.run_report — analyses joined to papers). */
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
  analysis: AnalysisBody
  evidence: EvidenceCheck[]
  low_quality_pages: number[]
}

export interface Run {
  id: number
  query: string | null
  lang: string
  model: string
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
}

export interface RunRequest {
  query?: string | null
  lang?: string
  model?: string
  mode?: 'sync' | 'batch'
  limit?: number | null
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
}

// --- citation graph (Phase 2) -----------------------------------------------
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
}
export interface GraphEdge {
  source: string
  target: string
  match_type: 'doi' | 'title'
  score: number
}
export interface CitationGraph {
  nodes: GraphNode[]
  edges: GraphEdge[]
  n_processed: number
  n_papers: number
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

const CLAUDE_KEY_STORAGE = 'aibc-claude-api-key'
const API_BASE = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '')
let claudeApiKey = localStorage.getItem(CLAUDE_KEY_STORAGE) || ''

export function setClaudeApiKey(key: string): boolean {
  claudeApiKey = key.trim()
  if (claudeApiKey) {
    localStorage.setItem(CLAUDE_KEY_STORAGE, claudeApiKey)
    return true
  } else {
    localStorage.removeItem(CLAUDE_KEY_STORAGE)
    return false
  }
}

export function hasClaudeApiKey() {
  return Boolean(claudeApiKey)
}

function requireClaudeApiKey() {
  if (!claudeApiKey) {
    throw new Error('Paste and save your Claude API key before starting a paid model action.')
  }
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}/api${path}`)
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} — ${path}`)
  return res.json() as Promise<T>
}

async function post<T>(path: string, body: unknown, options: { claudeKey?: boolean } = {}): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (options.claudeKey) {
    requireClaudeApiKey()
    headers['X-Claude-API-Key'] = claudeApiKey
  }
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
  estimate: (req: RunRequest) => post<Estimate>('/runs/estimate', req, { claudeKey: true }),
  rerank: (runId: number, query: string) => post<RerankResult>(`/runs/${runId}/rerank`, { query }),
  startRun: (req: RunRequest) => post<{ run_id: number; status: string; n_papers: number; mode: string }>('/runs', req, { claudeKey: true }),
  addPapers: (runId: number) => post<{ run_id: number; status: string; n_candidates: number }>(`/runs/${runId}/add-papers`, {}, { claudeKey: true }),
  pdfUrl: (key: string) => `${API_BASE}/api/papers/${encodeURIComponent(key)}/pdf`,
  exportUrl: (runId: number, fmt: 'xlsx' | 'csv', keys?: string[]) => {
    const q = keys && keys.length ? `?keys=${encodeURIComponent(keys.join(','))}` : ''
    return `${API_BASE}/api/runs/${runId}/export.${fmt}${q}`
  },
  eventsUrl: (runId: number) => `${API_BASE}/api/runs/${runId}/events`,

  // settings + upload (Home)
  settings: () => get<Settings>('/settings'),
  saveSettings: (papers_dir: string) => post<Settings>('/settings', { papers_dir }),
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

  // concept graph (Phase 3)
  conceptGraph: (runId: number) => get<ConceptGraphData>(`/runs/${runId}/concept/graph`),
  conceptEstimate: (runId: number, seed: ConceptSeed = 'citation') =>
    get<ConceptEstimate>(`/runs/${runId}/concept/estimate?seed=${seed}`),
  buildConcept: (runId: number, seed: ConceptSeed = 'citation') =>
    post<{ status: string }>(`/runs/${runId}/concept/build?seed=${seed}`, {}, { claudeKey: true }),
  conceptEventsUrl: (runId: number) => `${API_BASE}/api/runs/${runId}/concept/events`,
}
