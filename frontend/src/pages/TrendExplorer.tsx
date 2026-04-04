import { useState } from 'react'
import { useTrends } from '../hooks/useTrends'
import LineChart from '../components/LineChart'
import './TrendExplorer.css'

type TimeWindow = 30 | 60 | 90

function TrendExplorer() {
  const [window, setWindow] = useState<TimeWindow>(90)
  const { topics, loading, error } = useTrends(window)

  return (
    <div className="trend-explorer">
      <header className="trend-header">
        <h1>Trend Explorer</h1>
        <div className="window-selector">
          {([30, 60, 90] as TimeWindow[]).map((w) => (
            <button
              key={w}
              className={window === w ? 'active' : ''}
              onClick={() => setWindow(w)}
            >
              {w} Days
            </button>
          ))}
        </div>
      </header>

      <div className="chart-container">
        {loading && <p className="status">Loading trends...</p>}
        {error && <p className="status error">Error: {error}</p>}
        {!loading && !error && topics.length === 0 && (
          <p className="status">No trend data available yet.</p>
        )}
        {!loading && !error && topics.length > 0 && (
          <LineChart topics={topics} />
        )}
      </div>
    </div>
  )
}

export default TrendExplorer
