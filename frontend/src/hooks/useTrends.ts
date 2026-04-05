import { useEffect, useState } from 'react'
import { fetchTrends, type TopicTimeseries } from '../services/api'

interface UseTrendsParams {
  window?: 30 | 60 | 90
  sortBy?: 'growth_rate' | 'paper_count'
  limit?: number
}

export function useTrends({ window = 90, sortBy = 'growth_rate', limit = 10 }: UseTrendsParams = {}) {
  const [topics, setTopics] = useState<TopicTimeseries[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    setError(null)

    fetchTrends({ window, mode: 'timeseries', sort_by: sortBy, limit })
      .then((res) => {
        setTopics(res.topics as TopicTimeseries[])
      })
      .catch((err) => {
        setError(err.message || 'Failed to fetch trends')
      })
      .finally(() => {
        setLoading(false)
      })
  }, [window, sortBy, limit])

  return { topics, loading, error }
}
