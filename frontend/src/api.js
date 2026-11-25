const API_URL = import.meta.env.VITE_API_URL || ''

// small wrapper around fetch that adds the token and throws on errors
export async function api(path, { method = 'GET', body } = {}) {
  const token = localStorage.getItem('token')
  const headers = { 'Content-Type': 'application/json' }
  if (token) headers.Authorization = `Bearer ${token}`

  const res = await fetch(`${API_URL}/api${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })

  const data = await res.json().catch(() => ({}))

  if (res.status === 401 && token) {
    localStorage.removeItem('token')
    window.location.href = '/login'
  }
  if (!res.ok) {
    throw new Error(data.error || 'Request failed')
  }
  return data
}
