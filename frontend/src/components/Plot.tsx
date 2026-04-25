import type { ComponentType } from 'react'
import factoryModule from 'react-plotly.js/factory'
// @ts-expect-error — plotly.min.js has no type declarations
import Plotly from 'plotly.js/dist/plotly.min.js'

const createPlotlyComponent = (factoryModule as { default?: typeof factoryModule }).default || factoryModule
const Plot = createPlotlyComponent(Plotly) as ComponentType<any>
export default Plot
