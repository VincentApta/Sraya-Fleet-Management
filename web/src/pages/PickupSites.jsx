import { useEffect, useState } from "react"
import { api } from "../api"
import { useAuth } from "../context/AuthContext"

export default function PickupSites() {
  const { me } = useAuth()
  const isAdmin = me?.role === "Administrator"

  const [sites, setSites] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [perPage] = useState(25)
  const [filter, setFilter] = useState("")
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState(null)
  const [formName, setFormName] = useState("")
  const [formDistance, setFormDistance] = useState("")
  const [error, setError] = useState("")

  useEffect(() => {
    fetchSites()
  }, [page, filter])

  async function fetchSites() {
    setLoading(true)
    const params = new URLSearchParams({ page, per_page: perPage })
    if (filter) params.set("is_active", filter)
    const { ok, data } = await api.get(`/api/pickup-sites?${params}`)
    if (ok) {
      setSites(data.data || [])
      setTotal(data.total || 0)
    }
    setLoading(false)
  }

  function openCreate() {
    setEditing(null)
    setFormName("")
    setFormDistance("")
    setError("")
    setShowForm(true)
  }

  function openEdit(s) {
    setEditing(s)
    setFormName(s.site_name)
    setFormDistance(String(s.distance_km))
    setError("")
    setShowForm(true)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!formName.trim()) {
      setError("Site name is required")
      return
    }
    const dist = parseFloat(formDistance)
    if (!formDistance || isNaN(dist) || dist <= 0) {
      setError("Distance must be greater than 0")
      return
    }
    const payload = { site_name: formName.trim(), distance_km: dist }
    if (editing) {
      const { ok, data } = await api.put(`/api/pickup-sites/${editing.id}`, payload)
      if (!ok) { setError(data.error || "Update failed"); return }
    } else {
      const { ok, data } = await api.post("/api/pickup-sites", payload)
      if (!ok) { setError(data.error || "Create failed"); return }
    }
    setShowForm(false)
    fetchSites()
  }

  async function handleToggleActive(s) {
    const { ok, data } = await api.put(`/api/pickup-sites/${s.id}`, { is_active: !s.is_active })
    if (!ok) { setError(data.error || "Toggle failed"); return }
    fetchSites()
  }

  async function handleDelete(s) {
    if (!confirm(`Delete pickup site "${s.site_name}"? This cannot be undone.`)) return
    const { ok, data } = await api.del(`/api/pickup-sites/${s.id}`)
    if (!ok) { setError(data.error || "Delete failed"); return }
    fetchSites()
  }

  const totalPages = Math.ceil(total / perPage)

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold text-slate-800">Pickup Sites</h1>
        {isAdmin && (
          <button onClick={openCreate} className="px-4 py-2 rounded-md bg-slate-800 text-white text-sm hover:bg-slate-700">
            + Add Pickup Site
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
              <th className="text-left px-4 py-3 font-medium text-slate-600">Distance (km)</th>
              <th className="text-left px-4 py-3 font-medium text-slate-600">Status</th>
              {isAdmin && <th className="text-right px-4 py-3 font-medium text-slate-600">Actions</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr><td colSpan={4} className="px-4 py-8 text-center text-slate-400">Loading…</td></tr>
            ) : sites.length === 0 ? (
              <tr><td colSpan={4} className="px-4 py-8 text-center text-slate-400">No pickup sites found</td></tr>
            ) : sites.map((s) => (
              <tr key={s.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 text-slate-800">{s.site_name}</td>
                <td className="px-4 py-3 text-slate-800">{s.distance_km}</td>
                <td className="px-4 py-3">
                  <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${s.is_active ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-500"}`}>
                    {s.is_active ? "Active" : "Inactive"}
                  </span>
                </td>
                {isAdmin && (
                  <td className="px-4 py-3 text-right space-x-2">
                    <button onClick={() => openEdit(s)} className="text-slate-600 hover:text-slate-900 text-sm">Edit</button>
                    <button onClick={() => handleToggleActive(s)} className="text-slate-600 hover:text-slate-900 text-sm">
                      {s.is_active ? "Deactivate" : "Activate"}
                    </button>
                    <button onClick={() => handleDelete(s)} className="text-red-500 hover:text-red-700 text-sm">Delete</button>
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
            <h2 className="text-lg font-semibold mb-4 text-slate-800">{editing ? "Edit Pickup Site" : "Add Pickup Site"}</h2>
            <form onSubmit={handleSubmit}>
              <label className="block text-sm font-medium text-slate-600 mb-1">Site Name</label>
              <input
                type="text"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                autoFocus
                className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm mb-4"
              />
              <label className="block text-sm font-medium text-slate-600 mb-1">Distance (km)</label>
              <input
                type="number"
                step="any"
                min="0"
                value={formDistance}
                onChange={(e) => setFormDistance(e.target.value)}
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
