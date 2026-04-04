import Plot from 'react-plotly.js'
import type { TopicTimeseries } from '../services/api'

interface BubbleChartProps {
  topics: TopicTimeseries[]
}

function BubbleChart({ topics }: BubbleChartProps) {
  const growthRates = topics.map((t) => (t.latest_growth_rate ?? 0) * 100)
  const paperCounts = topics.map((t) => t.paper_count)
  const maxPapers = Math.max(...paperCounts, 1)

  const trace = {
    x: growthRates,
    y: paperCounts,
    mode: 'markers+text' as const,
    type: 'scatter' as const,
    text: topics.map((t) => t.label),
    textposition: 'top center' as const,
    textfont: { color: '#9ca3af', size: 11 },
    marker: {
      size: paperCounts.map((c) => Math.max(20, (c / maxPapers) * 80)),
      color: growthRates,
      colorscale: [
        [0, '#ef553b'],
        [0.5, '#3a3d45'],
        [1, '#00cc96'],
      ] as [number, string][],
      cmid: 0,
      showscale: true,
      colorbar: {
        title: { text: 'Growth %', font: { color: '#9ca3af' } },
        tickfont: { color: '#9ca3af' },
        ticksuffix: '%',
      },
      line: { color: '#2a2d35', width: 1 },
    },
    hovertext: topics.map((t) => {
      const growth = t.latest_growth_rate !== null
        ? `${t.latest_growth_rate > 0 ? '+' : ''}${(t.latest_growth_rate * 100).toFixed(1)}%`
        : 'N/A'
      const summary = t.summary_general || 'No summary available'
      return `<b>${t.label}</b><br>Papers: ${t.paper_count}<br>Growth: ${growth}<br><br>${summary}`
    }),
    hoverinfo: 'text' as const,
  }

  return (
    <Plot
      data={[trace]}
      layout={{
        paper_bgcolor: 'transparent',
        plot_bgcolor: 'transparent',
        font: { color: '#e1e4e8', family: '-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif' },
        xaxis: {
          title: 'Growth Rate (%)',
          gridcolor: '#2a2d35',
          zeroline: true,
          zerolinecolor: '#3a3d45',
          ticksuffix: '%',
        },
        yaxis: {
          title: 'Total Papers',
          gridcolor: '#2a2d35',
        },
        margin: { t: 20, r: 20, b: 60, l: 60 },
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

export default BubbleChart
