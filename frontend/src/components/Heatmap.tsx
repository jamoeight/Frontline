import Plot from './Plot'
import type { TopicTimeseries } from '../services/api'

interface HeatmapProps {
  topics: TopicTimeseries[]
}

function Heatmap({ topics }: HeatmapProps) {
  const allWeeks = [...new Set(
    topics.flatMap((t) => t.data_points.map((dp) => dp.week_start))
  )].sort()

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
          // Single-hue ink intensity: paper → vermillion → ink
          colorscale: [
            [0, '#f5f1e8'],
            [0.2, '#f1d9c7'],
            [0.5, '#e8a37d'],
            [0.8, '#c8542b'],
            [1, '#1a1817'],
          ],
          hovertext: hoverText,
          hoverinfo: 'text' as const,
          showscale: true,
          xgap: 2,
          ygap: 2,
          colorbar: {
            title: { text: 'Papers', font: { color: '#8c8579', size: 11 } },
            tickfont: { color: '#5c544a', size: 11 },
            outlinecolor: '#d6cfc0',
            outlinewidth: 1,
          },
        },
      ]}
      layout={{
        paper_bgcolor: 'transparent',
        plot_bgcolor: 'transparent',
        font: { color: '#1a1817', family: 'DM Sans, system-ui, sans-serif', size: 12 },
        xaxis: {
          side: 'bottom',
          tickfont: { size: 11, color: '#5c544a' },
          linecolor: '#d6cfc0',
        },
        yaxis: {
          autorange: 'reversed',
          tickfont: { size: 12, color: '#1a1817' },
          linecolor: '#d6cfc0',
        },
        margin: { t: 20, r: 60, b: 60, l: 200 },
        hoverlabel: {
          bgcolor: '#f5f1e8',
          bordercolor: '#1a1817',
          font: { color: '#1a1817', size: 12, family: 'DM Sans, system-ui, sans-serif' },
          align: 'left',
        },
      }}
      config={{ responsive: true, displayModeBar: false }}
      style={{ width: '100%', height: '500px' }}
    />
  )
}

export default Heatmap
