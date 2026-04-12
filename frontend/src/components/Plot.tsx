// @ts-expect-error — CJS module with no types
import factoryModule from 'react-plotly.js/factory'
// @ts-expect-error — plotly.min.js has no type declarations
import Plotly from 'plotly.js/dist/plotly.min.js'

const createPlotlyComponent = factoryModule.default || factoryModule
const Plot = createPlotlyComponent(Plotly)
export default Plot
