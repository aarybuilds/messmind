import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../AuthContext'
import './Layout.css'

const links = {
  student: [
    { to: '/student', label: 'My Meals' },
    { to: '/student/history', label: 'History' },
  ],
  staff: [{ to: '/staff', label: 'Dashboard' }],
  admin: [
    { to: '/admin', label: 'Overview' },
    { to: '/admin/users', label: 'Accounts' },
  ],
}

const roleNames = { student: 'Student', staff: 'Mess Staff', admin: 'Admin' }

export default function Layout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  function handleLogout() {
    logout()
    navigate('/login')
  }

  return (
    <div className="layout">
      <header className="topbar">
        <div className="brand">
          <span className="brand-name">MessMind</span>
          <span className="brand-role">{roleNames[user.role]}</span>
        </div>

        <nav>
          {links[user.role].map((l) => (
            <NavLink key={l.to} to={l.to} end>
              {l.label}
            </NavLink>
          ))}
        </nav>

        <div className="user-box">
          <span>{user.name}</span>
          <button className="secondary" onClick={handleLogout}>
            Log out
          </button>
        </div>
      </header>

      <main className="content">
        <Outlet />
      </main>

      <footer className="footer">MessMind · Group 24 · IIIT Lucknow</footer>
    </div>
  )
}
