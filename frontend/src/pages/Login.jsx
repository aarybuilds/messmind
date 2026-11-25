import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../AuthContext'
import './Login.css'

export default function Login() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      const user = await login(email.trim(), password)
      navigate(`/${user.role}`)
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="login-page">
      <div className="login-side">
        <p className="kicker">Software Engineering · Group 24</p>
        <h1>MessMind</h1>
        <p>Smart Hostel Mess Attendance Forecasting and Food Waste Reduction System</p>
      </div>

      <form className="login-card" onSubmit={handleSubmit}>
        <h2>Log in</h2>
        <div className="title-bar">
          <span></span>
          <span></span>
          <span></span>
        </div>

        <label htmlFor="email">Institute email</label>
        <input
          id="email"
          type="email"
          placeholder="lcb2025xxx@iiitl.ac.in"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />

        <label htmlFor="password">Password</label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />

        {error && <p className="error">{error}</p>}

        <button type="submit" disabled={submitting}>
          {submitting ? 'Logging in...' : 'Log in'}
        </button>
      </form>
    </div>
  )
}
