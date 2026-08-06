import { useEffect, useState } from "react"
import { api } from "../api"
import { useAuth } from "../context/AuthContext"

// "YYYY-MM-DD" for today, in the user's local timezone.
function todayStr() {
  const d = new Date()
  const pad = (n) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

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

// Horizontal bar chart in pure divs. The text label and value carry the meaning
// (no color-only encoding), so it stays legible without the bar fill.
function BarChart({ data, labelKey, valueKey, unit }) {
  const max = Math.max(1, ...data.map((d) => Number(d[valueKey]) || 0))
  if (data.length === 0) {
    return <p className="text-sm text-slate-400 py-8 text-center">No data in range</p>
  }
  return (
    <div className="space-y-2">
      {data.map((d, i) => {
        const v = Number(d[valueKey]) || 0
        const pct = (v / max) * 100
        return (
          <div key={i} className="flex items-center gap-3">
            <div className="w-28 text-xs text-slate-500 shrink-0 truncate">{d[labelKey]}</div>
            <div className="flex-1 bg-slate-100 rounded h-5 overflow-hidden">
              <div className="h-full bg-slate-700 rounded" style={{ width: `${pct}%` }} />
            </div>
            <div className="w-28 text-xs text-slate-700 text-right">
              {Number(v).toLocaleString("id-ID")}{unit}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function KpiCard({ label, value, hint }) {
  return (
    <div className="bg-white rounded-lg border border-slate-200 p-4">
      <div className="text-xs font-medium text-slate-500 uppercase tracking-wide">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-slate-800">{value}</div>
      {hint && <div className="text-xs text-slate-400 mt-1">{hint}</div>}
    </div>
  )
}

export default function Dashboard() {
  const { me } = useAuth()

  const [start, setStart] = useState(todayStr())
  const [end, setEnd] = useState(todayStr())

  const [stats, setStats] = useState({ active_trip_count: 0, trucks_out: 0, todays_factory_tbs_total: 0 })
  const [chart, setChart] = useState({ daily_tbs: [], trips_by_site: [] })
  const [trips, setTrips] = useState([])
  const [loadingTrips, setLoadingTrips] = useState(true)

  // Return form state; returnTarget is the active trip being returned (null = closed).
  const [returnTarget, setReturnTarget] = useState(null)
  const [rPickupGross, setRPickupGross] = useState("")
  const [rPickupTare, setRPickupTare] = useState("")
  const [rFactoryGross, setRFactoryGross] = useState("")
  const [rFactoryTare, setRFactoryTare] = useState("")
  const [rReturnTime, setRReturnTime] = useState(localNow())
  const [returnError, setReturnError] = useState("")

  async function loadActive() {
    setLoadingTrips(true)
    const { ok, data } = await api.get("/api/trips/active")
    if (ok) setTrips(data.data || [])
    setLoadingTrips(false)
  }

  // KPIs + charts over the selected range. Active trips are always all DISPATCHED
  // trips, independent of the range.
  async function loadDashboard(s, e) {
    const qs = `?start=${encodeURIComponent(s)}&end=${encodeURIComponent(e)}`
    const [st, ch] = await Promise.all([
      api.get(`/api/dashboard/stats${qs}`),
      api.get(`/api/dashboard/chart-data${qs}`),
    ])
    if (st.ok) setStats(st.data)
    if (ch.ok) setChart({ daily_tbs: ch.data.daily_tbs || [], trips_by_site: ch.data.trips_by_site || [] })
  }

  useEffect(() => {
    loadActive()
  }, [])

  useEffect(() => {
    loadDashboard(start, end)
  }, [start, end])

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

    const { ok, data } = await api.post(`/api/trips/${returnTarget.id}/return`, {
      pickup_gross_kg: nums[0],
      pickup_tare_kg: nums[1],
      factory_gross_kg: nums[2],
      factory_tare_kg: nums[3],
      return_time: rReturnTime,
    })
    if (!ok) { setReturnError(data.error || "Return failed"); return }

    setReturnTarget(null)
    loadActive()
    loadDashboard(start, end)
  }

  const isToday = start === todayStr() && end === todayStr()
  const tbsLabel = isToday ? "Factory TBS Today" : "Factory TBS Total"

  return (
    <div>
      <h1 className="text-xl font-semibold text-slate-800 mb-4">
        Dashboard <span className="text-slate-400 font-normal">· {me?.role}</span>
      </h1>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <KpiCard label="Active Trips" value={stats.active_trip_count} hint="Dispatched" />
        <KpiCard label="Trucks Out" value={stats.trucks_out} hint="On dispatched trips" />
        <KpiCard
          label={tbsLabel}
          value={`${Number(stats.todays_factory_tbs_total).toLocaleString("id-ID")} kg`}
          hint={`Returned ${start} → ${end}`}
        />
      </div>

      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden mb-6">
        <div className="px-4 py-3 border-b border-slate-200">
          <h2 className="text-sm font-semibold text-slate-700">Active Trips</h2>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-slate-600">Truck</th>
              <th className="text-left px-4 py-3 font-medium text-slate-600">Driver</th>
              <th className="text-left px-4 py-3 font-medium text-slate-600">Pickup Site</th>
              <th className="text-left px-4 py-3 font-medium text-slate-600">Dispatched</th>
              <th className="text-left px-4 py-3 font-medium text-slate-600">Elapsed</th>
              <th className="text-right px-4 py-3 font-medium text-slate-600">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loadingTrips ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">Loading…</td></tr>
            ) : trips.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">No active trips</td></tr>
            ) : trips.map((t) => (
              <tr key={t.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 text-slate-800">{t.truck ? t.truck.plate_number : "—"}</td>
                <td className="px-4 py-3 text-slate-800">{t.driver ? t.driver.full_name : "—"}</td>
                <td className="px-4 py-3 text-slate-800">{t.pickup_site ? t.pickup_site.site_name : "—"}</td>
                <td className="px-4 py-3 text-slate-600">{new Date(t.dispatch_time).toLocaleString()}</td>
                <td className="px-4 py-3 text-slate-600">{formatElapsed(t.elapsed_seconds)}</td>
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

      <div className="flex flex-wrap items-end gap-3 mb-3">
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Start date</label>
          <input
            type="date"
            value={start}
            onChange={(e) => setStart(e.target.value)}
            className="border border-slate-300 rounded-md px-3 py-1.5 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">End date</label>
          <input
            type="date"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
            className="border border-slate-300 rounded-md px-3 py-1.5 text-sm"
          />
        </div>
        <button
          onClick={() => { setStart(todayStr()); setEnd(todayStr()) }}
          className="px-3 py-1.5 text-sm text-slate-600 hover:text-slate-900 underline"
        >
          Today
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white rounded-lg border border-slate-200 p-4">
          <h3 className="text-sm font-semibold text-slate-700 mb-3">Daily Factory TBS Total (kg)</h3>
          <BarChart data={chart.daily_tbs} labelKey="date" valueKey="total_kg" unit=" kg" />
        </div>
        <div className="bg-white rounded-lg border border-slate-200 p-4">
          <h3 className="text-sm font-semibold text-slate-700 mb-3">Completed Trips by Pickup Site</h3>
          <BarChart data={chart.trips_by_site} labelKey="site_name" valueKey="count" unit="" />
        </div>
      </div>

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
                    type="number" step="1" min="1"
                    value={rPickupGross}
                    onChange={(e) => setRPickupGross(e.target.value)}
                    className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-600 mb-1">Pickup Tare (kg)</label>
                  <input
                    type="number" step="1" min="1"
                    value={rPickupTare}
                    onChange={(e) => setRPickupTare(e.target.value)}
                    className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-600 mb-1">Factory Gross (kg)</label>
                  <input
                    type="number" step="1" min="1"
                    value={rFactoryGross}
                    onChange={(e) => setRFactoryGross(e.target.value)}
                    className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-600 mb-1">Factory Tare (kg)</label>
                  <input
                    type="number" step="1" min="1"
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
