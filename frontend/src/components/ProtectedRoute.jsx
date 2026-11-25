import { Navigate } from 'react-router-dom'
import { useAuth } from '../AuthContext'

// only lets the user through if they are logged in with the right role.
// the server checks roles again on every request, this is just for navigation.
export default function ProtectedRoute({ role, children }) {
  const { user, loading } = useAuth()

  if (loading) return <p style={{ padding: '2rem' }}>Loading...</p>
  if (!user) return <Navigate to="/login" replace />
  if (role && user.role !== role) return <Navigate to={`/${user.role}`} replace />

  return children
}
