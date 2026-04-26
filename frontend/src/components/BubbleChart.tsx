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
    textfont: { color: '#1a1817', size: 12, family: 'Fraunces, serif' },
    marker: {
      size: paperCounts.map((c) => Math.max(22, (c / maxPapers) * 88)),
      color: growthRates,
      // Diverging palette: brick (negative) → cream (neutral) → vermillion (positive)
      colorscale: [
        [0, '#8b2e1f'],
        [0.5, '#ede5d2'],
        [1, '#c8542b'],
      ] as [number, string][],
      cmid: 0,
      showscale: true,
      colorbar: {
        title: { text: 'Growth %', font: { color: '#8c8579', size: 11 } },
        tickfont: { color: '#5c544a', size: 11 },
        ticksuffix: '%',
        outlinecolor: '#d6cfc0',
        outlinewidth: 1,
      },
      line: { color: '#1a1817', width: 0.8 },
      opacity: 0.92,
    },
    hovertext: topics.map((t) => {
      const growth =
        t.latest_growth_rate !== null
          ? `${t.latest_growth_rate > 0 ? '+' : ''}${(t.latest_growth_rate * 100).toFixed(1)}%`
          : 'N/A'
      const summary = wrapText(t.summary_general || 'No summary available')
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
        font: { color: '#1a1817', family: 'DM Sans, system-ui, sans-serif', size: 12 },
        xaxis: {
          title: { text: 'Growth rate (% week / week)', font: { size: 11, color: '#8c8579' } },
          gridcolor: '#e3dcc9',
          linecolor: '#d6cfc0',
          zeroline: true,
          zerolinecolor: '#1a1817',
          zerolinewidth: 1,
          ticksuffix: '%',
          tickfont: { size: 11, color: '#5c544a' },
        },
        yaxis: {
          title: { text: 'Total papers', font: { size: 11, color: '#8c8579' } },
          gridcolor: '#e3dcc9',
          linecolor: '#d6cfc0',
          tickfont: { size: 11, color: '#5c544a' },
        },
        margin: { t: 40, r: 60, b: 80, l: 80 },
        hoverlabel: {
          bgcolor: '#f5f1e8',
          bordercolor: '#1a1817',
          font: { color: '#1a1817', size: 12, family: 'DM Sans, system-ui, sans-serif' },
          align: 'left',
        },
      }}
      config={{ responsive: true, displayModeBar: false }}
      style={{ width: '100%', height: '700px' }}
    />
  )
}

export default BubbleChart
