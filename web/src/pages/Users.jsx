import { useEffect, useState } from "react"
import { Navigate } from "react-router-dom"
import { api } from "../api"
import { useAuth } from "../context/AuthContext"

const ROLES = ["Administrator", "Fleet Operator"]

// Administrator-only account management. Non-admins are bounced to the dashboard
// (the API enforces the same with 403 on every endpoint); the nav link is also
// hidden for non-admins in Layout.
export default function Users() {
  const { me } = useAuth()
  const [users, setUsers] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [perPage] = useState(25)
  const [filter, setFilter] = useState("")
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState(null) // null = create mode
  const [formUsername, setFormUsername] = useState("")
  const [formPassword, setFormPassword] = useState("")
  const [formRole, setFormRole] = useState("Fleet Operator")
  const [formActive, setFormActive] = useState(true)
  const [error, setError] = useState("")

  useEffect(() => {
    fetchUsers()
  }, [page, filter])

  // All hooks are above; safe to short-circuit the render here.
  if (me?.role !== "Administrator") return <Navigate to="/" replace />

  async function fetchUsers() {
    setLoading(true)
    const params = new URLSearchParams({ page, per_page: perPage })
    if (filter) params.set("is_active", filter)
    const { ok, data } = await api.get(`/api/users?${params}`)
    if (ok) {
      setUsers(data.data || [])
      setTotal(data.total || 0)
    }
    setLoading(false)
  }

  function openCreate() {
    setEditing(null)
    setFormUsername("")
    setFormPassword("")
    setFormRole("Fleet Operator")
    setFormActive(true)
    setError("")
    setShowForm(true)
  }

  function openEdit(u) {
    setEditing(u)
    setFormUsername(u.username)
    setFormPassword("")
    setFormRole(u.role)
    setFormActive(u.is_active)
    setError("")
    setShowForm(true)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (editing) {
      const { ok, data } = await api.put(`/api/users/${editing.id}`, {
        role: formRole,
        is_active: formActive,
      })
      if (!ok) { setError(data.error || "Update failed"); return }
    } else {
      if (!formUsername.trim()) { setError("Username is required"); return }
      if (!formPassword) { setError("Password is required"); return }
      const { ok, data } = await api.post("/api/users", {
        username: formUsername,
        password: formPassword,
        role: formRole,
      })
      if (!ok) { setError(data.error || "Create failed"); return }
    }
    setShowForm(false)
    fetchUsers()
  }

  async function handleToggleActive(u) {
    const { ok, data } = await api.put(`/api/users/${u.id}`, { is_active: !u.is_active })
    if (!ok) { setError(data.error || "Toggle failed"); return }
    fetchUsers()
  }

  async function handleResetPassword(u) {
    const password = window.prompt(`Enter a new password for "${u.username}"`)
    if (!password) return
    const { ok, data } = await api.put(`/api/users/${u.id}/reset-password`, { password })
    if (!ok) { setError(data.error || "Reset failed"); return }
    fetchUsers()
  }

  const totalPages = Math.ceil(total / perPage)

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold text-slate-800">Users</h1>
        <button onClick={openCreate} className="px-4 py-2 rounded-md bg-slate-800 text-white text-sm hover:bg-slate-700">
          + Add User
        </button>
      </div>

      {error && <div className="mb-4 p-3 rounded-md bg-red-50 text-red-700 text-sm">{error}</div>}

      <div className="mb-4 flex items-center gap-3">
        <select value={filter} onChange={(e) => { setFilter(e.target.value); setPage(1) }} className="border border-slate-300 rounded-md px-3 py-1.5 text-sm">
          <option value="">All</option>
          <option value="true">Active</option>
          <option value="false">Inactive</option>
        </select>
      </div>

      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-slate-600">Username</th>
              <th className="text-left px-4 py-3 font-medium text-slate-600">Role</th>
              <th className="text-left px-4 py-3 font-medium text-slate-600">Status</th>
              <th className="text-right px-4 py-3 font-medium text-slate-600">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr><td colSpan={4} className="px-4 py-8 text-center text-slate-400">Loading…</td></tr>
            ) : users.length === 0 ? (
              <tr><td colSpan={4} className="px-4 py-8 text-center text-slate-400">No users found</td></tr>
            ) : users.map((u) => (
              <tr key={u.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 text-slate-800">{u.username}</td>
                <td className="px-4 py-3 text-slate-600">{u.role}</td>
                <td className="px-4 py-3">
                  <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${u.is_active ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-500"}`}>
                    {u.is_active ? "Active" : "Inactive"}
                  </span>
                </td>
                <td className="px-4 py-3 text-right space-x-2">
                  <button onClick={() => openEdit(u)} className="text-slate-600 hover:text-slate-900 text-sm">Edit</button>
                  <button onClick={() => handleToggleActive(u)} className="text-slate-600 hover:text-slate-900 text-sm">
                    {u.is_active ? "Deactivate" : "Activate"}
                  </button>
                  <button onClick={() => handleResetPassword(u)} className="text-slate-600 hover:text-slate-900 text-sm">Reset Password</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="mt-4 flex items-center gap-2 text-sm">
          <button disabled={page <= 1} onClick={() => setPage(page - 1)} className="px-3 py-1.5 rounded-md border border-slate-300 disabled:opacity-40 hover:bg-slate-50">Prev</button>
          <span className="text-slate-600">Page {page} of {totalPages}</span>
          <button disabled={page >= totalPages} onClick={() => setPage(page + 1)} className="px-3 py-1.5 rounded-md border border-slate-300 disabled:opacity-40 hover:bg-slate-50">Next</button>
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={() => setShowForm(false)}>
          <div className="bg-white rounded-lg p-6 w-96 shadow-lg" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-semibold mb-4 text-slate-800">{editing ? "Edit User" : "Add User"}</h2>
            <form onSubmit={handleSubmit}>
              <label className="block text-sm font-medium text-slate-600 mb-1">Username</label>
              <input
                type="text"
                value={formUsername}
                onChange={(e) => setFormUsername(e.target.value)}
                autoFocus
                disabled={!!editing}
                className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm mb-4 disabled:bg-slate-100 disabled:text-slate-400"
              />

              {!editing && (
                <>
                  <label className="block text-sm font-medium text-slate-600 mb-1">Password</label>
                  <input
                    type="password"
                    value={formPassword}
                    onChange={(e) => setFormPassword(e.target.value)}
                    className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm mb-4"
                  />
                </>
              )}

              <label className="block text-sm font-medium text-slate-600 mb-1">Role</label>
              <select
                value={formRole}
                onChange={(e) => setFormRole(e.target.value)}
                className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm mb-4"
              >
                {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>

              {editing && (
                <label className="flex items-center gap-2 text-sm text-slate-600 mb-4">
                  <input type="checkbox" checked={formActive} onChange={(e) => setFormActive(e.target.checked)} />
                  Active
                </label>
              )}

              {error && <p className="text-red-600 text-sm mb-2">{error}</p>}
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 text-sm text-slate-600 hover:text-slate-900">Cancel</button>
                <button type="submit" className="px-4 py-2 rounded-md bg-slate-800 text-white text-sm hover:bg-slate-700">Save</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
