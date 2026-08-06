import { useEffect, useState } from "react"
import { api } from "../api"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

// Badge variant for a load_status value: red over, muted under, plain at capacity.
function loadStatusVariant(status) {
  switch (status) {
    case "Overweight":
      return "destructive"
    case "Underweight":
      return "secondary"
    case "At capacity":
      return "default"
    default:
      return "outline"
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
      <div className="mb-4 flex items-center justify-between gap-4">
        <h1 className="text-xl font-semibold">Trip History</h1>
        <Button onClick={exportCsv}>Export CSV</Button>
      </div>

      {error && (
        <div className="mb-4 rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
      )}

      <Card className="mb-4">
        <CardContent>
          <form onSubmit={applyFilters} className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="f-start">Return from</Label>
              <Input id="f-start" type="date" value={fStart} onChange={(e) => setFStart(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="f-end">Return to</Label>
              <Input id="f-end" type="date" value={fEnd} onChange={(e) => setFEnd(e.target.value)} />
            </div>
            <FilterSelect label="Truck" id="f-truck" value={fTruck} onChange={setFTruck}>
              <SelectItem value={null}>All</SelectItem>
              {trucks.map((t) => (
                <SelectItem key={t.id} value={String(t.id)}>{t.plate_number}</SelectItem>
              ))}
            </FilterSelect>
            <FilterSelect label="Driver" id="f-driver" value={fDriver} onChange={setFDriver}>
              <SelectItem value={null}>All</SelectItem>
              {drivers.map((d) => (
                <SelectItem key={d.id} value={String(d.id)}>{d.full_name}</SelectItem>
              ))}
            </FilterSelect>
            <FilterSelect label="Site" id="f-site" value={fSite} onChange={setFSite}>
              <SelectItem value={null}>All</SelectItem>
              {sites.map((s) => (
                <SelectItem key={s.id} value={String(s.id)}>{s.site_name}</SelectItem>
              ))}
            </FilterSelect>
            <div className="flex min-w-[12rem] flex-1 flex-col gap-1.5">
              <Label htmlFor="f-q">Search</Label>
              <Input id="f-q" type="text" value={fQ} onChange={(e) => setFQ(e.target.value)} placeholder="Plate, driver, or site" />
            </div>
            <Button type="submit">Search</Button>
            <Button type="button" variant="outline" onClick={clearFilters}>Clear</Button>
          </form>
        </CardContent>
      </Card>

      <div className="overflow-hidden rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <SortHeader col="return_time" label="Returned" onSort={toggleSort} indicator={sortIndicator} />
              <TableHead>Truck</TableHead>
              <TableHead>Driver</TableHead>
              <TableHead>Site</TableHead>
              <TableHead>Dispatched</TableHead>
              <SortHeader col="trip_money_idr" label="Trip Money (IDR)" align="right" onSort={toggleSort} indicator={sortIndicator} />
              <SortHeader col="factory_net_kg" label="Factory Net (kg)" align="right" onSort={toggleSort} indicator={sortIndicator} />
              <SortHeader col="weight_difference_kg" label="Diff (kg)" align="right" onSort={toggleSort} indicator={sortIndicator} />
              <TableHead>Load Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={9} className="h-24 text-center text-muted-foreground">
                  Loading…
                </TableCell>
              </TableRow>
            ) : trips.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="h-24 text-center text-muted-foreground">
                  No completed trips
                </TableCell>
              </TableRow>
            ) : trips.map((t) => (
              <TableRow key={t.id}>
                <TableCell className="text-muted-foreground">{t.return_time ? new Date(t.return_time).toLocaleString() : "—"}</TableCell>
                <TableCell>{t.truck ? t.truck.plate_number : "—"}</TableCell>
                <TableCell>{t.driver ? t.driver.full_name : "—"}</TableCell>
                <TableCell>{t.pickup_site ? t.pickup_site.site_name : "—"}</TableCell>
                <TableCell className="text-muted-foreground">{new Date(t.dispatch_time).toLocaleString()}</TableCell>
                <TableCell className="text-right">{Number(t.trip_money_idr).toLocaleString("id-ID")}</TableCell>
                <TableCell className="text-right">{t.factory_net_kg ?? "—"}</TableCell>
                <TableCell className="text-right">{t.weight_difference_kg ?? "—"}</TableCell>
                <TableCell>
                  {t.load_status ? (
                    <Badge variant={loadStatusVariant(t.load_status)}>{t.load_status}</Badge>
                  ) : "—"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-end gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
            Prev
          </Button>
          <span className="text-sm text-muted-foreground">
            Page {page} of {totalPages}
          </span>
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
            Next
          </Button>
        </div>
      )}
    </div>
  )
}

// Labeled Select wrapper for the filter form. `null` value is the "All" option.
function FilterSelect({ label, id, value, onChange, children }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Select value={value || null} onValueChange={(v) => onChange(v ?? "")}>
        <SelectTrigger id={id} className="w-40">
          <SelectValue placeholder="All" />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>{children}</SelectGroup>
        </SelectContent>
      </Select>
    </div>
  )
}

// A header cell that is click-to-sort when `col` is in the backend whitelist,
// otherwise a plain static header. `indicator(col)` returns " ▲"/" ▼"/"".
function SortHeader({ col, label, align = "left", onSort, indicator }) {
  const sortable = SORTABLE.includes(col)
  const className = cn(align === "right" && "text-right")
  if (!sortable) return <TableHead className={className}>{label}</TableHead>
  return (
    <TableHead className={className}>
      <Button variant="ghost" size="sm" onClick={() => onSort(col)}>
        {label}{indicator(col)}
      </Button>
    </TableHead>
  )
}
