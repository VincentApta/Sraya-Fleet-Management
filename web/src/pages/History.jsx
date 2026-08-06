import { useEffect, useState } from "react"
import { api } from "../api"

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

// Columns the backend sort whitelist supports. Everything else renders as a
// static header — client-sorting a paginated column would mislead.
const SORTABLE = ["return_time", "trip_money_idr", "factory_net_kg", "weight_difference_kg"]

export default function History() {
  const [trips, setTrips] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [perPage] = useState(25)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  // Filter form state.
  const [fStart, setFStart] = useState("")
  const [fEnd, setFEnd] = useState("")
  const [fTruck, setFTruck] = useState("")
  const [fDriver, setFDriver] = useState("")
  const [fSite, setFSite] = useState("")
  const [fQ, setFQ] = useState("")

  const [sort, setSort] = useState("-return_time")
  const [nonce, setNonce] = useState(0) // bumped to re-run the current filters

  const [trucks, setTrucks] = useState([])
  const [drivers, setDrivers] = useState([])
  const [sites, setSites] = useState([])

  useEffect(() => {
    Promise.all([
      api.get("/api/trucks?per_page=100"),
      api.get("/api/drivers?per_page=100"),
      api.get("/api/pickup-sites?per_page=100"),
    ]).then(([t, d, s]) => {
      setTrucks(t.ok ? t.data.data || [] : [])
      setDrivers(d.ok ? d.data.data || [] : [])
      setSites(s.ok ? s.data.data || [] : [])
    })
  }, [])

  useEffect(() => {
    fetchHistory()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, sort, nonce])

  function queryParams() {
    const p = new URLSearchParams({ page, per_page: perPage, sort })
    if (fStart) p.set("start", fStart)
    if (fEnd) p.set("end", fEnd)
    if (fTruck) p.set("truck_id", fTruck)
    if (fDriver) p.set("driver_id", fDriver)
    if (fSite) p.set("pickup_site_id", fSite)
    if (fQ.trim()) p.set("q", fQ.trim())
    return p
  }

  async function fetchHistory() {
    setLoading(true)
    setError("")
    const { ok, data } = await api.get(`/api/trips/history?${queryParams()}`)
    if (ok) {
      setTrips(data.data || [])
      setTotal(data.total || 0)
    } else {
      setError(data.error || "Failed to load history")
    }
    setLoading(false)
  }

  function applyFilters(e) {
    e?.preventDefault()
    setPage(1)
    setNonce((n) => n + 1)
  }

  function clearFilters() {
    setFStart(""); setFEnd(""); setFTruck(""); setFDriver(""); setFSite(""); setFQ("")
    setPage(1)
    setNonce((n) => n + 1)
  }

  async function exportCsv() {
    const params = queryParams()
    const res = await fetch(`/api/trips/history/export?${params}`, { credentials: "include" })
    if (!res.ok) { setError("Export failed"); return }
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = "trips_history.csv"
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  function toggleSort(col) {
    setPage(1)
    setSort((prev) => {
      const cur = prev.replace(/^[+-]/, "")
      if (cur !== col) return "-" + col // new column → descending
      return prev.startsWith("-") ? col : "-" + col
    })
  }

  function sortIndicator(col) {
    const cur = sort.replace(/^[+-]/, "")
    if (cur !== col) return ""
    return sort.startsWith("-") ? " ▼" : " ▲"
  }

  const totalPages = Math.ceil(total / perPage)

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold text-slate-800">Trip History</h1>
        <button onClick={exportCsv} className="px-4 py-2 rounded-md bg-slate-800 text-white text-sm hover:bg-slate-700">
          Export CSV
        </button>
      </div>

      {error && <div className="mb-4 p-3 rounded-md bg-red-50 text-red-700 text-sm">{error}</div>}

      <form onSubmit={applyFilters} className="mb-4 bg-white border border-slate-200 rounded-lg p-3 flex flex-wrap items-end gap-3">
        <label className="text-sm">
          <span className="block text-slate-600 mb-1">Return from</span>
          <input type="date" value={fStart} onChange={(e) => setFStart(e.target.value)} className="border border-slate-300 rounded-md px-2 py-1.5 text-sm" />
        </label>
        <label className="text-sm">
          <span className="block text-slate-600 mb-1">Return to</span>
          <input type="date" value={fEnd} onChange={(e) => setFEnd(e.target.value)} className="border border-slate-300 rounded-md px-2 py-1.5 text-sm" />
        </label>
        <label className="text-sm">
          <span className="block text-slate-600 mb-1">Truck</span>
          <select value={fTruck} onChange={(e) => setFTruck(e.target.value)} className="border border-slate-300 rounded-md px-2 py-1.5 text-sm">
            <option value="">All</option>
            {trucks.map((t) => <option key={t.id} value={t.id}>{t.plate_number}</option>)}
          </select>
        </label>
        <label className="text-sm">
          <span className="block text-slate-600 mb-1">Driver</span>
          <select value={fDriver} onChange={(e) => setFDriver(e.target.value)} className="border border-slate-300 rounded-md px-2 py-1.5 text-sm">
            <option value="">All</option>
            {drivers.map((d) => <option key={d.id} value={d.id}>{d.full_name}</option>)}
          </select>
        </label>
        <label className="text-sm">
          <span className="block text-slate-600 mb-1">Site</span>
          <select value={fSite} onChange={(e) => setFSite(e.target.value)} className="border border-slate-300 rounded-md px-2 py-1.5 text-sm">
            <option value="">All</option>
            {sites.map((s) => <option key={s.id} value={s.id}>{s.site_name}</option>)}
          </select>
        </label>
        <label className="text-sm flex-1 min-w-[12rem]">
          <span className="block text-slate-600 mb-1">Search</span>
          <input type="text" value={fQ} onChange={(e) => setFQ(e.target.value)} placeholder="Plate, driver, or site" className="w-full border border-slate-300 rounded-md px-2 py-1.5 text-sm" />
        </label>
        <button type="submit" className="px-4 py-1.5 rounded-md bg-slate-800 text-white text-sm hover:bg-slate-700">Search</button>
        <button type="button" onClick={clearFilters} className="px-4 py-1.5 rounded-md border border-slate-300 text-slate-600 text-sm hover:bg-slate-50">Clear</button>
      </form>

      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <SortHeader col="return_time" label="Returned" onSort={toggleSort} indicator={sortIndicator} />
              <th className="text-left px-4 py-3 font-medium text-slate-600">Truck</th>
              <th className="text-left px-4 py-3 font-medium text-slate-600">Driver</th>
              <th className="text-left px-4 py-3 font-medium text-slate-600">Site</th>
              <th className="text-left px-4 py-3 font-medium text-slate-600">Dispatched</th>
              <SortHeader col="trip_money_idr" label="Trip Money (IDR)" align="right" onSort={toggleSort} indicator={sortIndicator} />
              <SortHeader col="factory_net_kg" label="Factory Net (kg)" align="right" onSort={toggleSort} indicator={sortIndicator} />
              <SortHeader col="weight_difference_kg" label="Diff (kg)" align="right" onSort={toggleSort} indicator={sortIndicator} />
              <th className="text-left px-4 py-3 font-medium text-slate-600">Load Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr><td colSpan={9} className="px-4 py-8 text-center text-slate-400">Loading…</td></tr>
            ) : trips.length === 0 ? (
              <tr><td colSpan={9} className="px-4 py-8 text-center text-slate-400">No completed trips</td></tr>
            ) : trips.map((t) => (
              <tr key={t.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 text-slate-600">{t.return_time ? new Date(t.return_time).toLocaleString() : "—"}</td>
                <td className="px-4 py-3 text-slate-800">{t.truck ? t.truck.plate_number : "—"}</td>
                <td className="px-4 py-3 text-slate-800">{t.driver ? t.driver.full_name : "—"}</td>
                <td className="px-4 py-3 text-slate-800">{t.pickup_site ? t.pickup_site.site_name : "—"}</td>
                <td className="px-4 py-3 text-slate-600">{new Date(t.dispatch_time).toLocaleString()}</td>
                <td className="px-4 py-3 text-right text-slate-800">{Number(t.trip_money_idr).toLocaleString("id-ID")}</td>
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

      {totalPages > 1 && (
        <div className="mt-4 flex items-center gap-2 text-sm">
          <button disabled={page <= 1} onClick={() => setPage(page - 1)} className="px-3 py-1.5 rounded-md border border-slate-300 disabled:opacity-40 hover:bg-slate-50">Prev</button>
          <span className="text-slate-600">Page {page} of {totalPages}</span>
          <button disabled={page >= totalPages} onClick={() => setPage(page + 1)} className="px-3 py-1.5 rounded-md border border-slate-300 disabled:opacity-40 hover:bg-slate-50">Next</button>
        </div>
      )}
    </div>
  )
}

// A header cell that is click-to-sort when `col` is in the backend whitelist,
// otherwise a plain static header. `indicator(col)` returns " ▲"/" ▼"/"".
function SortHeader({ col, label, align = "left", onSort, indicator }) {
  const sortable = SORTABLE.includes(col)
  const cls = `px-4 py-3 font-medium text-slate-600 ${align === "right" ? "text-right" : "text-left"} ${sortable ? "cursor-pointer select-none hover:text-slate-900" : ""}`
  if (!sortable) return <th className={cls}>{label}</th>
  return (
    <th className={cls} onClick={() => onSort(col)}>
      {label}{indicator(col)}
    </th>
  )
}
