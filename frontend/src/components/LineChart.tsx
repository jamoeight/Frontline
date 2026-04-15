import Plot from './Plot'
import type { TopicTimeseries } from '../services/api'

const COLORS = [
  '#636efa', '#ef553b', '#00cc96', '#ab63fa', '#ffa15a',
  '#19d3f3', '#ff6692', '#b6e880', '#ff97ff', '#fecb52',
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
    line: { color: COLORS[i % COLORS.length], width: 2 },
    marker: { size: 5 },
    text: topic.data_points.map((dp) => {
      const growth = dp.growth_rate !== null
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
        font: { color: '#e1e4e8', family: '-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif' },
        xaxis: {
          title: 'Week',
          gridcolor: '#2a2d35',
          tickformat: '%b %d',
        },
        yaxis: {
          title: 'Paper Count',
          gridcolor: '#2a2d35',
        },
        legend: {
          orientation: 'h',
          y: -0.2,
          font: { size: 11 },
        },
        margin: { t: 20, r: 20, b: 80, l: 60 },
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

export default LineChart
