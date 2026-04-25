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
