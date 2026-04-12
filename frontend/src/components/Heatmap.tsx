import Plot from './Plot'
import type { TopicTimeseries } from '../services/api'

interface HeatmapProps {
  topics: TopicTimeseries[]
}

function Heatmap({ topics }: HeatmapProps) {
  // Collect all unique weeks across all topics, sorted
  const allWeeks = [...new Set(
    topics.flatMap((t) => t.data_points.map((dp) => dp.week_start))
  )].sort()

  // Build the matrix: rows = topics, columns = weeks, cells = paper count
  const z = topics.map((topic) => {
    const countByWeek = new Map(
      topic.data_points.map((dp) => [dp.week_start, dp.paper_count])
    )
    return allWeeks.map((week) => countByWeek.get(week) ?? 0)
  })

  const hoverText = topics.map((topic) =>
    allWeeks.map((week) => {
      const dp = topic.data_points.find((d) => d.week_start === week)
      const count = dp?.paper_count ?? 0
      const growth = dp?.growth_rate !== null && dp?.growth_rate !== undefined
        ? `${dp.growth_rate > 0 ? '+' : ''}${(dp.growth_rate * 100).toFixed(1)}%`
        : 'N/A'
      return `<b>${topic.label}</b><br>Week: ${week}<br>Papers: ${count}<br>Growth: ${growth}`
    })
  )

  return (
    <Plot
      data={[
        {
          z,
          x: allWeeks.map((w) => {
            const d = new Date(w)
            return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
          }),
          y: topics.map((t) => t.label),
          type: 'heatmap',
          colorscale: [
            [0, '#161b22'],
            [0.25, '#0e4429'],
            [0.5, '#006d32'],
            [0.75, '#26a641'],
            [1, '#39d353'],
          ],
          hovertext: hoverText,
          hoverinfo: 'text' as const,
          showscale: true,
          colorbar: {
            title: { text: 'Papers', font: { color: '#9ca3af' } },
            tickfont: { color: '#9ca3af' },
          },
        },
      ]}
      layout={{
        paper_bgcolor: 'transparent',
        plot_bgcolor: 'transparent',
        font: { color: '#e1e4e8', family: '-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif' },
        xaxis: {
          title: 'Week',
          side: 'bottom',
        },
        yaxis: {
          autorange: 'reversed',
        },
        margin: { t: 20, r: 20, b: 60, l: 180 },
        hoverlabel: {
          bgcolor: '#1c1f26',
          bordercolor: '#3a3d45',
          font: { color: '#e1e4e8', size: 12 },
          align: 'left',
        },
      }}
      config={{
        responsive: true,
        displayModeBar: false,
      }}
      style={{ width: '100%', height: '500px' }}
    />
  )
}

export default Heatmap
