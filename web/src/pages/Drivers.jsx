import { useEffect, useState } from "react"
import { api } from "../api"
import { useAuth } from "../context/AuthContext"

export default function Drivers() {
  const { me } = useAuth()
  const isAdmin = me?.role === "Administrator"

  const [drivers, setDrivers] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [perPage] = useState(25)
  const [filter, setFilter] = useState("")
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState(null)
  const [formName, setFormName] = useState("")
  const [error, setError] = useState("")

  useEffect(() => {
    fetchDrivers()
  }, [page, filter])

  async function fetchDrivers() {
    setLoading(true)
    const params = new URLSearchParams({ page, per_page: perPage })
    if (filter) params.set("is_active", filter)
    const { ok, data } = await api.get(`/api/drivers?${params}`)
    if (ok) {
      setDrivers(data.data || [])
      setTotal(data.total || 0)
    }
    setLoading(false)
  }

  function openCreate() {
    setEditing(null)
    setFormName("")
    setError("")
    setShowForm(true)
  }

  function openEdit(d) {
    setEditing(d)
    setFormName(d.full_name)
    setError("")
    setShowForm(true)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!formName.trim()) {
      setError("Full name is required")
      return
    }
    if (editing) {
      const { ok, data } = await api.put(`/api/drivers/${editing.id}`, { full_name: formName })
      if (!ok) { setError(data.error || "Update failed"); return }
    } else {
      const { ok, data } = await api.post("/api/drivers", { full_name: formName })
      if (!ok) { setError(data.error || "Create failed"); return }
    }
    setShowForm(false)
    fetchDrivers()
  }

  async function handleToggleActive(d) {
    const { ok, data } = await api.put(`/api/drivers/${d.id}`, { is_active: !d.is_active })
    if (!ok) { setError(data.error || "Toggle failed"); return }
    fetchDrivers()
  }

  async function handleDelete(d) {
    if (!confirm(`Delete driver "${d.full_name}"? This cannot be undone.`)) return
    const { ok, data } = await api.del(`/api/drivers/${d.id}`)
    if (!ok) { setError(data.error || "Delete failed"); return }
    fetchDrivers()
  }

  const totalPages = Math.ceil(total / perPage)

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold text-slate-800">Drivers</h1>
        {isAdmin && (
          <button onClick={openCreate} className="px-4 py-2 rounded-md bg-slate-800 text-white text-sm hover:bg-slate-700">
            + Add Driver
          </button>
        )}
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
              <th className="text-left px-4 py-3 font-medium text-slate-600">Name</th>
              <th className="text-left px-4 py-3 font-medium text-slate-600">Status</th>
              {isAdmin && <th className="text-right px-4 py-3 font-medium text-slate-600">Actions</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr><td colSpan={3} className="px-4 py-8 text-center text-slate-400">Loading…</td></tr>
            ) : drivers.length === 0 ? (
              <tr><td colSpan={3} className="px-4 py-8 text-center text-slate-400">No drivers found</td></tr>
            ) : drivers.map((d) => (
              <tr key={d.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 text-slate-800">{d.full_name}</td>
                <td className="px-4 py-3">
                  <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${d.is_active ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-500"}`}>
                    {d.is_active ? "Active" : "Inactive"}
                  </span>
                </td>
                {isAdmin && (
                  <td className="px-4 py-3 text-right space-x-2">
                    <button onClick={() => openEdit(d)} className="text-slate-600 hover:text-slate-900 text-sm">Edit</button>
                    <button onClick={() => handleToggleActive(d)} className="text-slate-600 hover:text-slate-900 text-sm">
                      {d.is_active ? "Deactivate" : "Activate"}
                    </button>
                    <button onClick={() => handleDelete(d)} className="text-red-500 hover:text-red-700 text-sm">Delete</button>
                  </td>
                )}
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
            <h2 className="text-lg font-semibold mb-4 text-slate-800">{editing ? "Edit Driver" : "Add Driver"}</h2>
            <form onSubmit={handleSubmit}>
              <label className="block text-sm font-medium text-slate-600 mb-1">Full Name</label>
              <input
                type="text"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                autoFocus
                className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm mb-4"
              />
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
