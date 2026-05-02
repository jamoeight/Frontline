import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
})

export interface DataPoint {
  week_start: string
  paper_count: number
  growth_rate: number | null
  acceleration: number | null
}

export interface TopicSummary {
  slug: string
  label: string
  paper_count: number
  representative_terms: string[]
  summary_technical: string | null
  summary_general: string | null
  summary_prediction: string | null
  latest_growth_rate: number | null
  latest_acceleration: number | null
}

export interface TopicTimeseries {
  slug: string
  label: string
  paper_count: number
  summary_general: string | null
  latest_growth_rate: number | null
  data_points: DataPoint[]
}

export interface TopicDetail extends TopicSummary {
  data_points: DataPoint[]
}

export interface TrendListResponse {
  window_days: number
  mode: string
  topics: TopicSummary[] | TopicTimeseries[]
  total_count: number
}

export interface TopicDetailResponse {
  topic: TopicDetail
  window_days: number
}

export async function fetchTrends(params: {
  window?: 30 | 60 | 90
  mode?: 'summary' | 'timeseries'
  sort_by?: 'growth_rate' | 'paper_count'
  limit?: number
}): Promise<TrendListResponse> {
  const { data } = await api.get('/trends', { params })
  return data
}

export interface TrendingTopic {
  slug: string
  label: string
  paper_count: number
  growth_rate: number | null
  summary_technical: string | null
  summary_general: string | null
  summary_prediction: string | null
}

export interface TrendingListResponse {
  topics: TrendingTopic[]
  total_count: number
}

export async function fetchTrending(limit: number = 10): Promise<TrendingListResponse> {
  const { data } = await api.get('/trending', { params: { limit } })
  return data
}

export async function fetchTopicDetail(
  slug: string,
  window: 30 | 60 | 90 = 90,
): Promise<TopicDetailResponse> {
  const { data } = await api.get(`/trends/${slug}`, { params: { window } })
  return data
}

export interface PaperItem {
  arxiv_id: string
  title: string
  authors: string[]
  abstract: string
  publication_date: string
  categories: string[]
  relevance_score: number
}

export interface TopicPapersResponse {
  slug: string
  label: string
  summary_general: string | null
  papers: PaperItem[]
  total_count: number
}

export async function fetchTopicPapers(
  slug: string,
  params: { limit?: number; offset?: number; sort_by?: 'date' | 'relevance' } = {},
): Promise<TopicPapersResponse> {
  const { data } = await api.get(`/topics/${slug}/papers`, { params })
  return data
}

export interface TopicMatch {
  slug: string
  label: string
  paper_count: number
  summary_general: string | null
}

export interface CitedPaper {
  arxiv_id: string
  title: string
  publication_date: string
}

export interface QueryAnswerResponse {
  question: string
  answer: string | null
  topic: TopicMatch | null
  confidence: number
  cited_papers: CitedPaper[]
}

export async function askQuery(question: string): Promise<QueryAnswerResponse> {
  const { data } = await api.post('/query/ask', { question })
  return data
}

export interface StatusResponse {
  last_ingest_at: string | null
  last_ingest_papers: number | null
  schedule: string
}

export async function fetchStatus(): Promise<StatusResponse> {
  const { data } = await api.get('/status')
  return data
}

export interface StatsResponse {
  total_papers: number
  embedded_papers: number
  total_topics: number
  earliest_publication_date: string | null
  latest_publication_date: string | null
}

export async function fetchStats(): Promise<StatsResponse> {
  const { data } = await api.get('/stats')
  return data
}

// State of the State — weekly cross-cluster synthesis briefing

export interface BigMovement {
  title: string
  narrative: string
  topic_slugs: string[]
}

export interface TopicNote {
  slug: string
  why: string
}

export interface CrossPollination {
  topic_a_slug: string
  topic_b_slug: string
  shared_signal: string
}

export interface DispatchEntry {
  if_you_work_on: string
  also_watch_slugs: string[]
  reason: string
}

export interface BriefingPrediction {
  claim: string
  testable_by: string
  slugs: string[]
}

export interface CalibrationItem {
  claim: string
  verdict: string  // 'held' | 'partial' | 'missed'
  evidence: string
}

export interface BriefingSections {
  lede: string
  big_movements: BigMovement[]
  emerging: TopicNote[]
  decelerating: TopicNote[]
  cross_pollinations: CrossPollination[]
  researcher_dispatch: DispatchEntry[]
  open_questions: string[]
  predictions: BriefingPrediction[]
  calibration: { graded: CalibrationItem[] } | null
}

export interface BriefingResponse {
  generated_on: string  // ISO date
  model: string
  sections: BriefingSections
  topic_labels: Record<string, string>
}

export interface BriefingHistoryItem {
  generated_on: string
  lede: string
}

export interface BriefingHistoryResponse {
  items: BriefingHistoryItem[]
}

export async function fetchBriefing(): Promise<BriefingResponse> {
  const { data } = await api.get('/briefing')
  return data
}

export async function fetchBriefingHistory(limit: number = 10): Promise<BriefingHistoryResponse> {
  const { data } = await api.get('/briefing/history', { params: { limit } })
  return data
}
