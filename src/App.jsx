import { Routes, Route, Navigate } from 'react-router-dom'
import ExamPage from './pages/ExamPage'
import AdminPage from './pages/AdminPage'
import WelcomePage from './pages/WelcomePage'
import ClassVideoPage from './pages/ClassVideoPage'
import ClassPlayerPage from './pages/ClassPlayerPage'

function App() {
  return (
    <Routes>
      <Route path="/" element={<WelcomePage />} />
      <Route path="/mcq" element={<ExamPage />} />
      <Route path="/admin" element={<AdminPage />} />
      <Route path="/admin.html" element={<Navigate to="/admin" replace />} />
      <Route path="/class" element={<ClassVideoPage />} />
      <Route path="/class/player/:id" element={<ClassPlayerPage />} />
    </Routes>
  )
}

export default App


