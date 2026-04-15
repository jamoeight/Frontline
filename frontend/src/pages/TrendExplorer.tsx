import { useState } from 'react'
import { useTrends } from '../hooks/useTrends'
import LineChart from '../components/LineChart'
import BubbleChart from '../components/BubbleChart'
import Heatmap from '../components/Heatmap'
import TrendingPanel from '../components/TrendingPanel'
import './TrendExplorer.css'

type TimeWindow = 30 | 60 | 90
type ChartMode = 'line' | 'bubble' | 'heatmap'
type SortBy = 'growth_rate' | 'paper_count'

function TrendExplorer() {
  const [window, setWindow] = useState<TimeWindow>(30)
  const [chartMode, setChartMode] = useState<ChartMode>('bubble')
  const [sortBy, setSortBy] = useState<SortBy>('growth_rate')
  const [limit, setLimit] = useState(10)
  const { topics, loading, error } = useTrends({ window, sortBy, limit })

  return (
    <div className="trend-explorer">
      <header className="trend-header">
        <h1>Trend Explorer</h1>
      </header>

      <div className="control-panel">
        <div className="control-group">
          <label>View</label>
          <div className="button-group">
            {(['bubble', 'heatmap', 'line'] as ChartMode[]).map((mode) => (
              <button
                key={mode}
                className={chartMode === mode ? 'active' : ''}
                onClick={() => setChartMode(mode)}
              >
                {mode.charAt(0).toUpperCase() + mode.slice(1)}
              </button>
            ))}
          </div>
        </div>

        <div className="control-group">
          <label>Time Window</label>
          <div className="button-group">
            {([30, 60, 90] as TimeWindow[]).map((w) => (
              <button
                key={w}
                className={window === w ? 'active' : ''}
                onClick={() => setWindow(w)}
              >
                {w}d
              </button>
            ))}
          </div>
        </div>

        <div className="control-group">
          <label>Sort By</label>
          <div className="button-group">
            <button
              className={sortBy === 'growth_rate' ? 'active' : ''}
              onClick={() => setSortBy('growth_rate')}
            >
              Growth
            </button>
            <button
              className={sortBy === 'paper_count' ? 'active' : ''}
              onClick={() => setSortBy('paper_count')}
            >
              Volume
            </button>
          </div>
        </div>

        <div className="control-group">
          <label>Topics</label>
          <div className="button-group">
            {[5, 10, 20].map((n) => (
              <button
                key={n}
                className={limit === n ? 'active' : ''}
                onClick={() => setLimit(n)}
              >
                {n}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="chart-container">
        {loading && <p className="status">Loading trends...</p>}
        {error && <p className="status error">Error: {error}</p>}
        {!loading && !error && topics.length === 0 && (
          <p className="status">No trend data available yet.</p>
        )}
        {!loading && !error && topics.length > 0 && (
          chartMode === 'line' ? <LineChart topics={topics} />
          : chartMode === 'bubble' ? <BubbleChart topics={topics} />
          : <Heatmap topics={topics} />
        )}
      </div>

      <TrendingPanel />
    </div>
  )
}

export default TrendExplorer
