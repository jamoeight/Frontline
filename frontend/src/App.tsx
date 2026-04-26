import { BrowserRouter, Routes, Route } from 'react-router-dom'
import TrendExplorer from './pages/TrendExplorer'
import TopicDetail from './pages/TopicDetail'
import Help from './pages/Help'
import './App.css'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<TrendExplorer />} />
        <Route path="/topic/:slug" element={<TopicDetail />} />
        <Route path="/help" element={<Help />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
