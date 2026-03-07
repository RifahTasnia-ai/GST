import { Routes, Route, Navigate } from 'react-router-dom'
import ExamPage from './pages/ExamPage'
import AdminPage from './pages/AdminPage'
import WelcomePage from './pages/WelcomePage'

function App() {
  return (
    <Routes>
      <Route path="/" element={<WelcomePage />} />
      <Route path="/mcq" element={<ExamPage />} />
      <Route path="/admin" element={<AdminPage />} />
      <Route path="/admin.html" element={<Navigate to="/admin" replace />} />
    </Routes>
  )
}

export default App


