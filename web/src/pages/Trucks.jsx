import { useEffect, useState } from "react"
import { api } from "../api"
import { useAuth } from "../context/AuthContext"

export default function Trucks() {
  const { me } = useAuth()
  const isAdmin = me?.role === "Administrator"

  const [trucks, setTrucks] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [perPage] = useState(25)
  const [filter, setFilter] = useState("")
  const [loading, setLoading] = useState(true)

  // Active drivers populate the usual-driver dropdown.
  const [drivers, setDrivers] = useState([])

  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState(null)
  const [formPlate, setFormPlate] = useState("")
  const [formName, setFormName] = useState("")
  const [formCapacity, setFormCapacity] = useState("")
  const [formDriver, setFormDriver] = useState("")
  const [error, setError] = useState("")

  useEffect(() => {
    fetchTrucks()
  }, [page, filter])

  useEffect(() => {
    fetchDriverOptions()
  }, [])

  async function fetchTrucks() {
    setLoading(true)
    const params = new URLSearchParams({ page, per_page: perPage })
    if (filter) params.set("is_active", filter)
    const { ok, data } = await api.get(`/api/trucks?${params}`)
    if (ok) {
      setTrucks(data.data || [])
      setTotal(data.total || 0)
    }
    setLoading(false)
  }

  async function fetchDriverOptions() {
    const { ok, data } = await api.get("/api/drivers?is_active=true&per_page=100")
    if (ok) setDrivers(data.data || [])
  }

  function openCreate() {
    setEditing(null)
    setFormPlate("")
    setFormName("")
    setFormCapacity("")
    setFormDriver("")
    setError("")
    setShowForm(true)
  }

  function openEdit(t) {
    setEditing(t)
    setFormPlate(t.plate_number)
    setFormName(t.display_name)
    setFormCapacity(String(t.capacity_kg))
    setFormDriver(t.usual_driver_id ? String(t.usual_driver_id) : "")
    setError("")
    setShowForm(true)
  }

  // Active drivers, plus the truck's current driver if they're somehow missing
  // (e.g. deactivated since assignment) so the selection still renders.
  const driverOptions = editing?.usual_driver &&
    !drivers.some((d) => d.id === editing.usual_driver.id)
    ? [editing.usual_driver, ...drivers]
    : drivers

  const driverChanging =
    editing && formDriver && Number(formDriver) !== editing.usual_driver_id

  async function handleSubmit(e) {
    e.preventDefault()
    if (!formPlate.trim()) { setError("Plate number is required"); return }
    if (!formName.trim()) { setError("Display name is required"); return }
    const cap = Number(formCapacity)
    if (!formCapacity || isNaN(cap) || cap <= 0) { setError("Capacity must be greater than 0"); return }
    const driverVal = formDriver === "" ? null : Number(formDriver)

    const payload = {
      plate_number: formPlate.trim(),
      display_name: formName.trim(),
      capacity_kg: cap,
      usual_driver_id: driverVal,
    }

    if (editing) {
      const { ok, data } = await api.put(`/api/trucks/${editing.id}`, payload)
      if (!ok) { setError(data.error || "Update failed"); return }
    } else {
      // New trucks are created active, so a usual driver is required.
      if (!driverVal) { setError("An active truck requires a usual driver"); return }
      const { ok, data } = await api.post("/api/trucks", payload)
      if (!ok) { setError(data.error || "Create failed"); return }
    }
    setShowForm(false)
    fetchTrucks()
  }

  async function handleToggleActive(t) {
    const { ok, data } = await api.put(`/api/trucks/${t.id}`, { is_active: !t.is_active })
    if (!ok) { setError(data.error || "Toggle failed"); return }
    fetchTrucks()
  }

  async function handleDelete(t) {
    if (!confirm(`Delete truck "${t.plate_number}"? This cannot be undone.`)) return
    const { ok, data } = await api.del(`/api/trucks/${t.id}`)
    if (!ok) { setError(data.error || "Delete failed"); return }
    fetchTrucks()
  }

  const totalPages = Math.ceil(total / perPage)

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold text-slate-800">Trucks</h1>
        {isAdmin && (
          <button onClick={openCreate} className="px-4 py-2 rounded-md bg-slate-800 text-white text-sm hover:bg-slate-700">
            + Add Truck
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
              <th className="text-left px-4 py-3 font-medium text-slate-600">Plate</th>
              <th className="text-left px-4 py-3 font-medium text-slate-600">Name</th>
              <th className="text-left px-4 py-3 font-medium text-slate-600">Capacity (kg)</th>
              <th className="text-left px-4 py-3 font-medium text-slate-600">Usual Driver</th>
              <th className="text-left px-4 py-3 font-medium text-slate-600">Status</th>
              {isAdmin && <th className="text-right px-4 py-3 font-medium text-slate-600">Actions</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">Loading…</td></tr>
            ) : trucks.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">No trucks found</td></tr>
            ) : trucks.map((t) => (
              <tr key={t.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 text-slate-800">{t.plate_number}</td>
                <td className="px-4 py-3 text-slate-800">{t.display_name}</td>
                <td className="px-4 py-3 text-slate-800">{t.capacity_kg}</td>
                <td className="px-4 py-3 text-slate-800">{t.usual_driver ? t.usual_driver.full_name : "—"}</td>
                <td className="px-4 py-3">
                  <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${t.is_active ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-500"}`}>
                    {t.is_active ? "Active" : "Inactive"}
                  </span>
                </td>
                {isAdmin && (
                  <td className="px-4 py-3 text-right space-x-2">
                    <button onClick={() => openEdit(t)} className="text-slate-600 hover:text-slate-900 text-sm">Edit</button>
                    <button onClick={() => handleToggleActive(t)} className="text-slate-600 hover:text-slate-900 text-sm">
                      {t.is_active ? "Deactivate" : "Activate"}
                    </button>
                    <button onClick={() => handleDelete(t)} className="text-red-500 hover:text-red-700 text-sm">Delete</button>
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
            <h2 className="text-lg font-semibold mb-4 text-slate-800">{editing ? "Edit Truck" : "Add Truck"}</h2>
            <form onSubmit={handleSubmit}>
              <label className="block text-sm font-medium text-slate-600 mb-1">Plate Number</label>
              <input
                type="text"
                value={formPlate}
                onChange={(e) => setFormPlate(e.target.value)}
                autoFocus
                className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm mb-4"
              />
              <label className="block text-sm font-medium text-slate-600 mb-1">Display Name</label>
              <input
                type="text"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm mb-4"
              />
              <label className="block text-sm font-medium text-slate-600 mb-1">Capacity (kg)</label>
              <input
                type="number"
                step="1"
                min="1"
                value={formCapacity}
                onChange={(e) => setFormCapacity(e.target.value)}
                className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm mb-4"
              />
              <label className="block text-sm font-medium text-slate-600 mb-1">Usual Driver</label>
              <select
                value={formDriver}
                onChange={(e) => setFormDriver(e.target.value)}
                className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm mb-2"
              >
                <option value="">— None —</option>
                {driverOptions.map((d) => (
                  <option key={d.id} value={d.id}>{d.full_name}</option>
                ))}
              </select>
              {!editing && (
                <p className="text-xs text-slate-400 mb-2">New trucks are created active and require a usual driver.</p>
              )}
              {driverChanging && (
                <p className="text-xs text-amber-600 mb-2">
                  Reassigning the usual driver: if the selected driver already drives another truck,
                  the API will return an error describing how to resolve the former truck.
                </p>
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
