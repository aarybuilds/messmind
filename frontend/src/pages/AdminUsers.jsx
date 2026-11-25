import { useEffect, useState } from 'react'
import { api } from '../api'
import PageTitle from '../components/PageTitle'
import './AdminUsers.css'

const emptyForm = { name: '', email: '', password: '', role: 'student' }

export default function AdminUsers() {
  const [users, setUsers] = useState([])
  const [role, setRole] = useState('')
  const [search, setSearch] = useState('')
  const [form, setForm] = useState(emptyForm)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  async function loadUsers() {
    const params = new URLSearchParams()
    if (role) params.set('role', role)
    if (search) params.set('search', search)
    try {
      setUsers(await api(`/users?${params}`))
    } catch (err) {
      setError(err.message)
    }
  }

  useEffect(() => {
    loadUsers()
  }, [role])

  async function handleCreate(e) {
    e.preventDefault()
    setError('')
    setMessage('')
    try {
      const created = await api('/users', { method: 'POST', body: form })
      setMessage(`Created account for ${created.name}`)
      setForm(emptyForm)
      loadUsers()
    } catch (err) {
      setError(err.message)
    }
  }

  async function toggleActive(u) {
    try {
      const updated = await api(`/users/${u.id}`, {
        method: 'PATCH',
        body: { is_active: !u.is_active },
      })
      setUsers(users.map((x) => (x.id === u.id ? updated : x)))
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <>
      <PageTitle kicker="Admin" title="Accounts" />

      <div className="users-grid">
        <section className="card">
          <div className="filters">
            <select value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="">All roles</option>
              <option value="student">Students</option>
              <option value="staff">Mess staff</option>
            </select>
            <form
              onSubmit={(e) => {
                e.preventDefault()
                loadUsers()
              }}
            >
              <input
                placeholder="Search name or email"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </form>
          </div>

          <table className="users-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className={u.is_active ? '' : 'inactive'}>
                  <td>{u.name}</td>
                  <td>{u.email}</td>
                  <td>{u.role === 'staff' ? 'Mess staff' : 'Student'}</td>
                  <td>{u.is_active ? 'Active' : 'Deactivated'}</td>
                  <td>
                    <button className="secondary small" onClick={() => toggleActive(u)}>
                      {u.is_active ? 'Deactivate' : 'Activate'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {users.length === 50 && (
            <p className="muted">Showing the first 50. Use search to narrow down.</p>
          )}
        </section>

        <form className="card new-user" onSubmit={handleCreate}>
          <h3>New account</h3>
          <label>Name</label>
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          <label>Institute email</label>
          <input
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            required
          />
          <label>Temporary password</label>
          <input
            type="password"
            minLength={8}
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            required
          />
          <label>Role</label>
          <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
            <option value="student">Student</option>
            <option value="staff">Mess staff</option>
          </select>

          {error && <p className="error">{error}</p>}
          {message && <p className="success">{message}</p>}
          <button type="submit">Create account</button>
        </form>
      </div>
    </>
  )
}
