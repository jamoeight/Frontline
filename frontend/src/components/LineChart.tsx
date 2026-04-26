import Plot from './Plot'
import type { TopicTimeseries } from '../services/api'

// Earthy editorial palette tuned for the cream paper background.
const COLORS = [
  '#1a1817', // ink
  '#c8542b', // accent vermillion
  '#2c5530', // forest
  '#5c4a6e', // plum
  '#8b6f2e', // ochre
  '#2e5c6e', // teal
  '#8b2e1f', // brick
  '#5c544a', // umber
  '#3e5c2e', // olive
  '#6e2e5c', // mulberry
]

interface LineChartProps {
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

function LineChart({ topics }: LineChartProps) {
  const traces = topics.map((topic, i) => ({
    x: topic.data_points.map((dp) => dp.week_start),
    y: topic.data_points.map((dp) => dp.paper_count),
    name: topic.label,
    type: 'scatter' as const,
    mode: 'lines+markers' as const,
    line: { color: COLORS[i % COLORS.length], width: 1.6 },
    marker: { size: 4, color: COLORS[i % COLORS.length] },
    text: topic.data_points.map((dp) => {
      const growth =
        dp.growth_rate !== null
          ? `${dp.growth_rate > 0 ? '+' : ''}${(dp.growth_rate * 100).toFixed(1)}%`
          : 'N/A'
      const summary = wrapText(topic.summary_general || 'No summary available')
      return `<b>${topic.label}</b><br>Papers: ${dp.paper_count}<br>Growth: ${growth}<br><br>${summary}`
    }),
    hoverinfo: 'text' as const,
  }))

  return (
    <Plot
      data={traces}
      layout={{
        paper_bgcolor: 'transparent',
        plot_bgcolor: 'transparent',
        font: { color: '#1a1817', family: 'DM Sans, system-ui, sans-serif', size: 12 },
        xaxis: {
          title: { text: 'Week', font: { size: 11, color: '#8c8579' } },
          gridcolor: '#e3dcc9',
          linecolor: '#d6cfc0',
          tickformat: '%b %d',
          tickfont: { size: 11, color: '#5c544a' },
        },
        yaxis: {
          title: { text: 'Papers', font: { size: 11, color: '#8c8579' } },
          gridcolor: '#e3dcc9',
          linecolor: '#d6cfc0',
          tickfont: { size: 11, color: '#5c544a' },
        },
        legend: {
          orientation: 'h',
          y: -0.18,
          font: { size: 11, color: '#1a1817' },
          bgcolor: 'transparent',
        },
        margin: { t: 20, r: 20, b: 80, l: 60 },
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

export default LineChart
