import { useEffect, useState } from "react"
import { CircleAlert } from "lucide-react"
import { api } from "../api"
import { useAuth } from "../context/AuthContext"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

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
    return <p className="py-8 text-center text-sm text-muted-foreground">No data in range</p>
  }
  return (
    <div className="flex flex-col gap-2">
      {data.map((d, i) => {
        const v = Number(d[valueKey]) || 0
        const pct = (v / max) * 100
        return (
          <div key={i} className="flex items-center gap-3">
            <div className="w-28 shrink-0 truncate text-xs text-muted-foreground">{d[labelKey]}</div>
            <div className="h-5 flex-1 overflow-hidden rounded bg-muted">
              <div className="h-full rounded bg-primary" style={{ width: `${pct}%` }} />
            </div>
            <div className="w-28 text-right text-xs text-foreground">
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
    <Card>
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-2xl">{value}</CardTitle>
      </CardHeader>
      {hint && (
        <CardContent>
          <p className="text-xs text-muted-foreground">{hint}</p>
        </CardContent>
      )}
    </Card>
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
      <h1 className="mb-4 text-xl font-semibold text-foreground">
        Dashboard <span className="font-normal text-muted-foreground">· {me?.role}</span>
      </h1>

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <KpiCard label="Active Trips" value={stats.active_trip_count} hint="Dispatched" />
        <KpiCard label="Trucks Out" value={stats.trucks_out} hint="On dispatched trips" />
        <KpiCard
          label={tbsLabel}
          value={`${Number(stats.todays_factory_tbs_total).toLocaleString("id-ID")} kg`}
          hint={`Returned ${start} → ${end}`}
        />
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Active Trips</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Truck</TableHead>
                <TableHead>Driver</TableHead>
                <TableHead>Pickup Site</TableHead>
                <TableHead>Dispatched</TableHead>
                <TableHead>Elapsed</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loadingTrips ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-16 text-center text-muted-foreground">Loading…</TableCell>
                </TableRow>
              ) : trips.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-16 text-center text-muted-foreground">No active trips</TableCell>
                </TableRow>
              ) : trips.map((t) => (
                <TableRow key={t.id}>
                  <TableCell>{t.truck ? t.truck.plate_number : "—"}</TableCell>
                  <TableCell>{t.driver ? t.driver.full_name : "—"}</TableCell>
                  <TableCell>{t.pickup_site ? t.pickup_site.site_name : "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{new Date(t.dispatch_time).toLocaleString()}</TableCell>
                  <TableCell className="text-muted-foreground">{formatElapsed(t.elapsed_seconds)}</TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" onClick={() => openReturn(t)}>
                      Record Return
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="mb-3 flex flex-wrap items-end gap-3">
        <div className="flex w-40 flex-col gap-1">
          <Label htmlFor="start-date" className="text-xs text-muted-foreground">Start date</Label>
          <Input id="start-date" type="date" value={start} onChange={(e) => setStart(e.target.value)} />
        </div>
        <div className="flex w-40 flex-col gap-1">
          <Label htmlFor="end-date" className="text-xs text-muted-foreground">End date</Label>
          <Input id="end-date" type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
        </div>
        <Button variant="link" onClick={() => { setStart(todayStr()); setEnd(todayStr()) }}>
          Today
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Daily Factory TBS Total (kg)</CardTitle>
          </CardHeader>
          <CardContent>
            <BarChart data={chart.daily_tbs} labelKey="date" valueKey="total_kg" unit=" kg" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Completed Trips by Pickup Site</CardTitle>
          </CardHeader>
          <CardContent>
            <BarChart data={chart.trips_by_site} labelKey="site_name" valueKey="count" unit="" />
          </CardContent>
        </Card>
      </div>

      <Dialog open={!!returnTarget} onOpenChange={(o) => !o && setReturnTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record Return</DialogTitle>
            <DialogDescription>
              {returnTarget?.truck?.plate_number} · {returnTarget?.driver?.full_name} · {returnTarget?.pickup_site?.site_name}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleReturn}>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <Label htmlFor="r-pickup-gross">Pickup Gross (kg)</Label>
                <Input id="r-pickup-gross" type="number" step="1" min="1" value={rPickupGross} onChange={(e) => setRPickupGross(e.target.value)} />
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor="r-pickup-tare">Pickup Tare (kg)</Label>
                <Input id="r-pickup-tare" type="number" step="1" min="1" value={rPickupTare} onChange={(e) => setRPickupTare(e.target.value)} />
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor="r-factory-gross">Factory Gross (kg)</Label>
                <Input id="r-factory-gross" type="number" step="1" min="1" value={rFactoryGross} onChange={(e) => setRFactoryGross(e.target.value)} />
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor="r-factory-tare">Factory Tare (kg)</Label>
                <Input id="r-factory-tare" type="number" step="1" min="1" value={rFactoryTare} onChange={(e) => setRFactoryTare(e.target.value)} />
              </div>
            </div>

            <div className="mt-4 flex flex-col gap-1">
              <Label htmlFor="r-return-time">Return Time</Label>
              <Input id="r-return-time" type="datetime-local" value={rReturnTime} onChange={(e) => setRReturnTime(e.target.value)} />
            </div>

            {returnError && (
              <Alert variant="destructive" className="mt-4">
                <CircleAlert />
                <AlertDescription>{returnError}</AlertDescription>
              </Alert>
            )}
            <DialogFooter>
              <DialogClose render={<Button type="button" variant="outline" />}>
                Cancel
              </DialogClose>
              <Button type="submit">Save</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
