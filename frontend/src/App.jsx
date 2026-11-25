import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from './AuthContext'
import Layout from './components/Layout'
import ProtectedRoute from './components/ProtectedRoute'
import Login from './pages/Login'
import StudentHome from './pages/StudentHome'
import StaffDashboard from './pages/StaffDashboard'
import AdminHome from './pages/AdminHome'
import AdminUsers from './pages/AdminUsers'

function HomeRedirect() {
  const { user, loading } = useAuth()
  if (loading) return null
  return <Navigate to={user ? `/${user.role}` : '/login'} replace />
}

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />

          <Route
            path="/student"
            element={
              <ProtectedRoute role="student">
                <Layout />
              </ProtectedRoute>
            }
          >
            <Route index element={<StudentHome />} />
          </Route>

          <Route
            path="/staff"
            element={
              <ProtectedRoute role="staff">
                <Layout />
              </ProtectedRoute>
            }
          >
            <Route index element={<StaffDashboard />} />
          </Route>

          <Route
            path="/admin"
            element={
              <ProtectedRoute role="admin">
                <Layout />
              </ProtectedRoute>
            }
          >
            <Route index element={<AdminHome />} />
            <Route path="users" element={<AdminUsers />} />
          </Route>

          <Route path="*" element={<HomeRedirect />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}

export default App
