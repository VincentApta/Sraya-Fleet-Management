import { useEffect, useState } from "react"
import { api } from "../api"

// datetime-local value for "now" in the user's local timezone.
function localNow() {
  const d = new Date()
  const pad = (n) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// Format a number of seconds as "1h 23m" / "12m" / "45s".
function formatElapsed(seconds) {
  const s = Math.max(0, Math.floor(seconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m`
  return `${sec}s`
}

// Tailwind classes for the load_status badge: green at capacity, blue under, red over.
function loadStatusClass(status) {
  switch (status) {
    case "At capacity":
      return "bg-green-50 text-green-700"
    case "Underweight":
      return "bg-blue-50 text-blue-700"
    case "Overweight":
      return "bg-red-50 text-red-700"
    default:
      return "bg-slate-50 text-slate-600"
  }
}

export default function Trips() {
  const [trips, setTrips] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  // Dispatch form state.
  const [showForm, setShowForm] = useState(false)
  const [availableTrucks, setAvailableTrucks] = useState([])
  const [drivers, setDrivers] = useState([])
  const [sites, setSites] = useState([])
  const [formTruck, setFormTruck] = useState("")
  const [formDriver, setFormDriver] = useState("")
  const [formSite, setFormSite] = useState("")
  const [formMoney, setFormMoney] = useState("")
  const [formNotes, setFormNotes] = useState("")
  const [formDispatchTime, setFormDispatchTime] = useState(localNow())
  const [formError, setFormError] = useState("")

  // Returned trips + collapsible section. ponytail: there is no list endpoint
  // yet (Go files are off-limits for this change). We fetch GET /api/trips/returned
  // for forward compatibility — it no-ops today — and also prepend each trip
  // returned this session from the POST response, so the feature works end to end.
  // Add a listReturned handler + route and this UI populates on load for free.
  const [returnedTrips, setReturnedTrips] = useState([])
  const [showReturned, setShowReturned] = useState(false)

  // Return form state; returnTarget is the active trip being returned (null = closed).
  const [returnTarget, setReturnTarget] = useState(null)
  const [rPickupGross, setRPickupGross] = useState("")
  const [rPickupTare, setRPickupTare] = useState("")
  const [rFactoryGross, setRFactoryGross] = useState("")
  const [rFactoryTare, setRFactoryTare] = useState("")
  const [rReturnTime, setRReturnTime] = useState(localNow())
  const [returnError, setReturnError] = useState("")

  useEffect(() => {
    fetchActive()
    fetchReturned()
  }, [])

  async function fetchActive() {
    setLoading(true)
    const { ok, data } = await api.get("/api/trips/active")
    if (ok) setTrips(data.data || [])
    setLoading(false)
  }

  async function fetchReturned() {
    const { ok, data } = await api.get("/api/trips/returned")
    if (ok) setReturnedTrips(data.data || [])
  }

  async function openForm() {
    setFormError("")
    setError("")
    // Load option sets in parallel; available trucks drive the truck dropdown.
    const [avail, drv, st] = await Promise.all([
      api.get("/api/trucks/available"),
      api.get("/api/drivers?is_active=true&per_page=100"),
      api.get("/api/pickup-sites?is_active=true&per_page=100"),
    ])
    setAvailableTrucks(avail.ok ? avail.data.data || [] : [])
    setDrivers(drv.ok ? drv.data.data || [] : [])
    setSites(st.ok ? st.data.data || [] : [])
    setFormTruck("")
    setFormDriver("")
    setFormSite("")
    setFormMoney("")
    setFormNotes("")
    setFormDispatchTime(localNow())
    setShowForm(true)
  }

  // Prefill the usual driver when a truck is selected (if the driver is free).
  function selectTruck(id) {
    setFormTruck(id)
    const truck = availableTrucks.find((t) => String(t.id) === id)
    if (truck?.usual_driver) setFormDriver(String(truck.usual_driver.id))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!formTruck) { setFormError("Truck is required"); return }
    if (!formDriver) { setFormError("Driver is required"); return }
    if (!formSite) { setFormError("Pickup site is required"); return }
    const money = Number(formMoney)
    if (formMoney === "" || isNaN(money) || money < 0) { setFormError("Trip money must be >= 0"); return }

    const payload = {
      truck_id: Number(formTruck),
      driver_id: Number(formDriver),
      pickup_site_id: Number(formSite),
      trip_money_idr: money,
      notes: formNotes.trim(),
      dispatch_time: formDispatchTime,
    }
    const { ok, data } = await api.post("/api/trips", payload)
    if (!ok) { setFormError(data.error || "Dispatch failed"); return }
    setShowForm(false)
    fetchActive()
  }

  function openReturn(trip) {
    setReturnTarget(trip)
    setRPickupGross("")
    setRPickupTare("")
    setRFactoryGross("")
    setRFactoryTare("")
    setRReturnTime(localNow())
    setReturnError("")
  }

  async function handleReturn(e) {
    e.preventDefault()
    const raw = [rPickupGross, rPickupTare, rFactoryGross, rFactoryTare]
    if (raw.some((v) => v === "")) { setReturnError("All four weights are required"); return }
    const nums = raw.map(Number)
    if (nums.some((n) => !Number.isInteger(n) || n <= 0)) { setReturnError("Weights must be positive integers"); return }

    const payload = {
      pickup_gross_kg: nums[0],
      pickup_tare_kg: nums[1],
      factory_gross_kg: nums[2],
      factory_tare_kg: nums[3],
      return_time: rReturnTime,
    }
    const { ok, data } = await api.post(`/api/trips/${returnTarget.id}/return`, payload)
    if (!ok) { setReturnError(data.error || "Return failed"); return }

    // Response is the trip with computed fields; show it and refresh active list.
    setReturnTarget(null)
    setShowReturned(true)
    setReturnedTrips((prev) => [data, ...prev])
    fetchActive()
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold text-slate-800">Active Trips</h1>
        <button onClick={openForm} className="px-4 py-2 rounded-md bg-slate-800 text-white text-sm hover:bg-slate-700">
          + Dispatch Trip
        </button>
      </div>

      {error && <div className="mb-4 p-3 rounded-md bg-red-50 text-red-700 text-sm">{error}</div>}

      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-slate-600">Truck</th>
              <th className="text-left px-4 py-3 font-medium text-slate-600">Driver</th>
              <th className="text-left px-4 py-3 font-medium text-slate-600">Pickup Site</th>
              <th className="text-left px-4 py-3 font-medium text-slate-600">Dispatched</th>
              <th className="text-left px-4 py-3 font-medium text-slate-600">Elapsed</th>
              <th className="text-right px-4 py-3 font-medium text-slate-600">Trip Money (IDR)</th>
              <th className="text-right px-4 py-3 font-medium text-slate-600">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-400">Loading…</td></tr>
            ) : trips.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-400">No active trips</td></tr>
            ) : trips.map((t) => (
              <tr key={t.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 text-slate-800">{t.truck ? t.truck.plate_number : "—"}</td>
                <td className="px-4 py-3 text-slate-800">{t.driver ? t.driver.full_name : "—"}</td>
                <td className="px-4 py-3 text-slate-800">{t.pickup_site ? t.pickup_site.site_name : "—"}</td>
                <td className="px-4 py-3 text-slate-800">
                  {new Date(t.dispatch_time).toLocaleString()}
                </td>
                <td className="px-4 py-3 text-slate-600">{formatElapsed(t.elapsed_seconds)}</td>
                <td className="px-4 py-3 text-right text-slate-800">
                  {Number(t.trip_money_idr).toLocaleString("id-ID")}
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    onClick={() => openReturn(t)}
                    className="px-3 py-1 rounded-md bg-slate-700 text-white text-xs hover:bg-slate-600"
                  >
                    Record Return
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Returned trips — collapsible section below the active list. */}
      <div className="mt-8">
        <button
          onClick={() => setShowReturned((s) => !s)}
          className="text-sm font-semibold text-slate-700 hover:text-slate-900"
        >
          {showReturned ? "▾" : "▸"} Returned Trips ({returnedTrips.length})
        </button>

        {showReturned && (
          <div className="mt-3 bg-white rounded-lg border border-slate-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-slate-600">Truck</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-600">Driver</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-600">Pickup Site</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-600">Dispatched</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-600">Returned</th>
                  <th className="text-right px-4 py-3 font-medium text-slate-600">Pickup Net (kg)</th>
                  <th className="text-right px-4 py-3 font-medium text-slate-600">Factory Net (kg)</th>
                  <th className="text-right px-4 py-3 font-medium text-slate-600">Diff (kg)</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-600">Load Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {returnedTrips.length === 0 ? (
                  <tr><td colSpan={9} className="px-4 py-8 text-center text-slate-400">No returned trips</td></tr>
                ) : returnedTrips.map((t) => (
                  <tr key={t.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 text-slate-800">{t.truck ? t.truck.plate_number : "—"}</td>
                    <td className="px-4 py-3 text-slate-800">{t.driver ? t.driver.full_name : "—"}</td>
                    <td className="px-4 py-3 text-slate-800">{t.pickup_site ? t.pickup_site.site_name : "—"}</td>
                    <td className="px-4 py-3 text-slate-600">{new Date(t.dispatch_time).toLocaleString()}</td>
                    <td className="px-4 py-3 text-slate-600">
                      {t.return_time ? new Date(t.return_time).toLocaleString() : "—"}
                    </td>
                    <td className="px-4 py-3 text-right text-slate-800">{t.pickup_net_kg ?? "—"}</td>
                    <td className="px-4 py-3 text-right text-slate-800">{t.factory_net_kg ?? "—"}</td>
                    <td className="px-4 py-3 text-right text-slate-800">{t.weight_difference_kg ?? "—"}</td>
                    <td className="px-4 py-3">
                      {t.load_status ? (
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${loadStatusClass(t.load_status)}`}>
                          {t.load_status}
                        </span>
                      ) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={() => setShowForm(false)}>
          <div className="bg-white rounded-lg p-6 w-96 shadow-lg max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-semibold mb-4 text-slate-800">Dispatch Trip</h2>
            <form onSubmit={handleSubmit}>
              <label className="block text-sm font-medium text-slate-600 mb-1">Truck</label>
              <select
                value={formTruck}
                onChange={(e) => selectTruck(e.target.value)}
                autoFocus
                className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm mb-2"
              >
                <option value="">— Select truck —</option>
                {availableTrucks.map((t) => (
                  <option key={t.id} value={t.id}>{t.plate_number} ({t.display_name})</option>
                ))}
              </select>
              <p className="text-xs text-slate-400 mb-4">Only active trucks without a current trip are listed.</p>

              <label className="block text-sm font-medium text-slate-600 mb-1">Driver</label>
              <select
                value={formDriver}
                onChange={(e) => setFormDriver(e.target.value)}
                className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm mb-2"
              >
                <option value="">— Select driver —</option>
                {drivers.map((d) => (
                  <option key={d.id} value={d.id}>{d.full_name}</option>
                ))}
              </select>
              <p className="text-xs text-slate-400 mb-4">Prefilled with the truck's usual driver when selected.</p>

              <label className="block text-sm font-medium text-slate-600 mb-1">Pickup Site</label>
              <select
                value={formSite}
                onChange={(e) => setFormSite(e.target.value)}
                className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm mb-4"
              >
                <option value="">— Select site —</option>
                {sites.map((s) => (
                  <option key={s.id} value={s.id}>{s.site_name}</option>
                ))}
              </select>

              <label className="block text-sm font-medium text-slate-600 mb-1">Trip Money (IDR)</label>
              <input
                type="number"
                step="1"
                min="0"
                value={formMoney}
                onChange={(e) => setFormMoney(e.target.value)}
                className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm mb-4"
              />

              <label className="block text-sm font-medium text-slate-600 mb-1">Dispatch Time</label>
              <input
                type="datetime-local"
                value={formDispatchTime}
                onChange={(e) => setFormDispatchTime(e.target.value)}
                className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm mb-4"
              />

              <label className="block text-sm font-medium text-slate-600 mb-1">Notes</label>
              <textarea
                value={formNotes}
                onChange={(e) => setFormNotes(e.target.value)}
                rows={2}
                className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm mb-4"
              />

              {formError && <p className="text-red-600 text-sm mb-2">{formError}</p>}
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 text-sm text-slate-600 hover:text-slate-900">Cancel</button>
                <button type="submit" className="px-4 py-2 rounded-md bg-slate-800 text-white text-sm hover:bg-slate-700">Dispatch</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {returnTarget && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={() => setReturnTarget(null)}>
          <div className="bg-white rounded-lg p-6 w-96 shadow-lg max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-semibold mb-1 text-slate-800">Record Return</h2>
            <p className="text-xs text-slate-500 mb-4">
              {returnTarget.truck?.plate_number} · {returnTarget.driver?.full_name} · {returnTarget.pickup_site?.site_name}
            </p>
            <form onSubmit={handleReturn}>
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div>
                  <label className="block text-sm font-medium text-slate-600 mb-1">Pickup Gross (kg)</label>
                  <input
                    type="number"
                    step="1"
                    min="1"
                    value={rPickupGross}
                    onChange={(e) => setRPickupGross(e.target.value)}
                    className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-600 mb-1">Pickup Tare (kg)</label>
                  <input
                    type="number"
                    step="1"
                    min="1"
                    value={rPickupTare}
                    onChange={(e) => setRPickupTare(e.target.value)}
                    className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-600 mb-1">Factory Gross (kg)</label>
                  <input
                    type="number"
                    step="1"
                    min="1"
                    value={rFactoryGross}
                    onChange={(e) => setRFactoryGross(e.target.value)}
                    className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-600 mb-1">Factory Tare (kg)</label>
                  <input
                    type="number"
                    step="1"
                    min="1"
                    value={rFactoryTare}
                    onChange={(e) => setRFactoryTare(e.target.value)}
                    className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
                  />
                </div>
              </div>

              <label className="block text-sm font-medium text-slate-600 mb-1">Return Time</label>
              <input
                type="datetime-local"
                value={rReturnTime}
                onChange={(e) => setRReturnTime(e.target.value)}
                className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm mb-4"
              />

              {returnError && <p className="text-red-600 text-sm mb-2">{returnError}</p>}
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setReturnTarget(null)} className="px-4 py-2 text-sm text-slate-600 hover:text-slate-900">Cancel</button>
                <button type="submit" className="px-4 py-2 rounded-md bg-slate-800 text-white text-sm hover:bg-slate-700">Save</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
