import Plot from './Plot'
import type { TopicTimeseries } from '../services/api'

interface BubbleChartProps {
  topics: TopicTimeseries[]
}

function wrapText(text: string, maxChars = 60): string {
  const words = text.split(' ')
  let line = ''
  const lines: string[] = []
  for (const word of words) {
    if (line.length + word.length + 1 > maxChars && line) {
      lines.push(line)
      line = word
    } else {
      line = line ? `${line} ${word}` : word
    }
  }
  if (line) lines.push(line)
  return lines.join('<br>')
}

function BubbleChart({ topics }: BubbleChartProps) {
  // Compute values from data points within the time window
  const paperCounts = topics.map((t) =>
    t.data_points.reduce((sum, dp) => sum + dp.paper_count, 0)
  )
  const growthRates = topics.map((t) => {
    const pts = t.data_points
    if (pts.length < 2) return (t.latest_growth_rate ?? 0) * 100
    const lastGrowth = pts[pts.length - 1].growth_rate
    return (lastGrowth ?? 0) * 100
  })
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
    hovertext: topics.map((t, idx) => {
      const growth = growthRates[idx] !== 0
        ? `${growthRates[idx] > 0 ? '+' : ''}${growthRates[idx].toFixed(1)}%`
        : 'N/A'
      const summary = wrapText(t.summary_general || 'No summary available')
      return `<b>${t.label}</b><br>Papers (window): ${paperCounts[idx]}<br>Growth: ${growth}<br><br>${summary}`
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
