import { BrowserRouter, Routes, Route } from 'react-router-dom'
import TrendExplorer from './pages/TrendExplorer'
import './App.css'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<TrendExplorer />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
