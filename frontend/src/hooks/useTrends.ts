import { useEffect, useState } from 'react'
import { fetchTrends, type TopicTimeseries } from '../services/api'

export function useTrends(window: 30 | 60 | 90 = 90) {
  const [topics, setTopics] = useState<TopicTimeseries[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    setError(null)

    fetchTrends({ window, mode: 'timeseries' })
      .then((res) => {
        setTopics(res.topics as TopicTimeseries[])
      })
      .catch((err) => {
        setError(err.message || 'Failed to fetch trends')
      })
      .finally(() => {
        setLoading(false)
      })
  }, [window])

  return { topics, loading, error }
}
