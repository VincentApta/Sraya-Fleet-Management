import { useEffect, useState } from "react"
import { ChevronDownIcon, PlusIcon } from "lucide-react"
import { api } from "../api"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Field, FieldGroup, FieldLabel, FieldDescription, FieldError } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
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

// Badge variant for load_status: success at capacity, info under, destructive over.
function loadStatusVariant(status) {
  switch (status) {
    case "At capacity":
      return "success"
    case "Underweight":
      return "info"
    case "Overweight":
      return "destructive"
    default:
      return "secondary"
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

  const truckItems = [
    { value: null, label: "— Select truck —" },
    ...availableTrucks.map((t) => ({ value: String(t.id), label: `${t.plate_number} (${t.display_name})` })),
  ]
  const driverItems = [
    { value: null, label: "— Select driver —" },
    ...drivers.map((d) => ({ value: String(d.id), label: d.full_name })),
  ]
  const siteItems = [
    { value: null, label: "— Select site —" },
    ...sites.map((s) => ({ value: String(s.id), label: s.site_name })),
  ]

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
      <div className="mb-4 flex items-center justify-between gap-4">
        <h1 className="text-xl font-semibold">Active Trips</h1>
        <Button onClick={openForm}>
          <PlusIcon data-icon="inline-start" />
          Dispatch Trip
        </Button>
      </div>

      {error && (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="overflow-hidden rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Truck</TableHead>
              <TableHead>Driver</TableHead>
              <TableHead>Pickup Site</TableHead>
              <TableHead>Dispatched</TableHead>
              <TableHead>Elapsed</TableHead>
              <TableHead className="text-right">Trip Money (IDR)</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                  Loading…
                </TableCell>
              </TableRow>
            ) : trips.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                  No active trips
                </TableCell>
              </TableRow>
            ) : trips.map((t) => (
              <TableRow key={t.id}>
                <TableCell>{t.truck ? t.truck.plate_number : "—"}</TableCell>
                <TableCell>{t.driver ? t.driver.full_name : "—"}</TableCell>
                <TableCell>{t.pickup_site ? t.pickup_site.site_name : "—"}</TableCell>
                <TableCell>{new Date(t.dispatch_time).toLocaleString()}</TableCell>
                <TableCell className="text-muted-foreground">{formatElapsed(t.elapsed_seconds)}</TableCell>
                <TableCell className="text-right">
                  {Number(t.trip_money_idr).toLocaleString("id-ID")}
                </TableCell>
                <TableCell className="text-right">
                  <Button size="sm" onClick={() => openReturn(t)}>
                    Record Return
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Returned trips — collapsible section below the active list. */}
      <div className="mt-8 flex flex-col gap-3">
        <Button
          variant="ghost"
          onClick={() => setShowReturned((s) => !s)}
          className="w-fit font-medium"
        >
          <ChevronDownIcon
            data-icon="inline-start"
            className={cn("transition-transform", !showReturned && "-rotate-90")}
          />
          Returned Trips ({returnedTrips.length})
        </Button>

        {showReturned && (
          <div className="overflow-hidden rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Truck</TableHead>
                  <TableHead>Driver</TableHead>
                  <TableHead>Pickup Site</TableHead>
                  <TableHead>Dispatched</TableHead>
                  <TableHead>Returned</TableHead>
                  <TableHead className="text-right">Pickup Net (kg)</TableHead>
                  <TableHead className="text-right">Factory Net (kg)</TableHead>
                  <TableHead className="text-right">Diff (kg)</TableHead>
                  <TableHead>Load Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {returnedTrips.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="h-24 text-center text-muted-foreground">
                      No returned trips
                    </TableCell>
                  </TableRow>
                ) : returnedTrips.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell>{t.truck ? t.truck.plate_number : "—"}</TableCell>
                    <TableCell>{t.driver ? t.driver.full_name : "—"}</TableCell>
                    <TableCell>{t.pickup_site ? t.pickup_site.site_name : "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{new Date(t.dispatch_time).toLocaleString()}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {t.return_time ? new Date(t.return_time).toLocaleString() : "—"}
                    </TableCell>
                    <TableCell className="text-right">{t.pickup_net_kg ?? "—"}</TableCell>
                    <TableCell className="text-right">{t.factory_net_kg ?? "—"}</TableCell>
                    <TableCell className="text-right">{t.weight_difference_kg ?? "—"}</TableCell>
                    <TableCell>
                      {t.load_status ? (
                        <Badge variant={loadStatusVariant(t.load_status)}>
                          {t.load_status}
                        </Badge>
                      ) : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Dispatch Trip</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit}>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="trip-truck">Truck</FieldLabel>
                <Select
                  value={formTruck || null}
                  onValueChange={(v) => selectTruck(v ?? "")}
                >
                  <SelectTrigger id="trip-truck" className="w-full">
                    <SelectValue placeholder="— Select truck —" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {truckItems.map((it) => (
                        <SelectItem key={it.value ?? "truck"} value={it.value}>
                          {it.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
                <FieldDescription>
                  Only active trucks without a current trip are listed.
                </FieldDescription>
              </Field>

              <Field>
                <FieldLabel htmlFor="trip-driver">Driver</FieldLabel>
                <Select
                  value={formDriver || null}
                  onValueChange={(v) => setFormDriver(v ?? "")}
                >
                  <SelectTrigger id="trip-driver" className="w-full">
                    <SelectValue placeholder="— Select driver —" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {driverItems.map((it) => (
                        <SelectItem key={it.value ?? "driver"} value={it.value}>
                          {it.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
                <FieldDescription>
                  Prefilled with the truck's usual driver when selected.
                </FieldDescription>
              </Field>

              <Field>
                <FieldLabel htmlFor="trip-site">Pickup Site</FieldLabel>
                <Select
                  value={formSite || null}
                  onValueChange={(v) => setFormSite(v ?? "")}
                >
                  <SelectTrigger id="trip-site" className="w-full">
                    <SelectValue placeholder="— Select site —" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {siteItems.map((it) => (
                        <SelectItem key={it.value ?? "site"} value={it.value}>
                          {it.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>

              <Field>
                <FieldLabel htmlFor="trip-money">Trip Money (IDR)</FieldLabel>
                <Input
                  id="trip-money"
                  type="number"
                  step="1"
                  min="0"
                  value={formMoney}
                  onChange={(e) => setFormMoney(e.target.value)}
                />
              </Field>

              <Field>
                <FieldLabel htmlFor="trip-dispatch-time">Dispatch Time</FieldLabel>
                <Input
                  id="trip-dispatch-time"
                  type="datetime-local"
                  value={formDispatchTime}
                  onChange={(e) => setFormDispatchTime(e.target.value)}
                />
              </Field>

              <Field>
                <FieldLabel htmlFor="trip-notes">Notes</FieldLabel>
                <Textarea
                  id="trip-notes"
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  rows={2}
                />
              </Field>

              {formError && <FieldError>{formError}</FieldError>}
            </FieldGroup>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowForm(false)}>
                Cancel
              </Button>
              <Button type="submit">Dispatch</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!returnTarget} onOpenChange={(o) => !o && setReturnTarget(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Record Return</DialogTitle>
            <DialogDescription>
              {returnTarget?.truck?.plate_number} · {returnTarget?.driver?.full_name} ·{" "}
              {returnTarget?.pickup_site?.site_name}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleReturn}>
            <FieldGroup>
              <div className="grid grid-cols-2 gap-3">
                <Field>
                  <FieldLabel htmlFor="r-pickup-gross">Pickup Gross (kg)</FieldLabel>
                  <Input
                    id="r-pickup-gross"
                    type="number"
                    step="1"
                    min="1"
                    value={rPickupGross}
                    onChange={(e) => setRPickupGross(e.target.value)}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="r-pickup-tare">Pickup Tare (kg)</FieldLabel>
                  <Input
                    id="r-pickup-tare"
                    type="number"
                    step="1"
                    min="1"
                    value={rPickupTare}
                    onChange={(e) => setRPickupTare(e.target.value)}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="r-factory-gross">Factory Gross (kg)</FieldLabel>
                  <Input
                    id="r-factory-gross"
                    type="number"
                    step="1"
                    min="1"
                    value={rFactoryGross}
                    onChange={(e) => setRFactoryGross(e.target.value)}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="r-factory-tare">Factory Tare (kg)</FieldLabel>
                  <Input
                    id="r-factory-tare"
                    type="number"
                    step="1"
                    min="1"
                    value={rFactoryTare}
                    onChange={(e) => setRFactoryTare(e.target.value)}
                  />
                </Field>
              </div>

              <Field>
                <FieldLabel htmlFor="r-return-time">Return Time</FieldLabel>
                <Input
                  id="r-return-time"
                  type="datetime-local"
                  value={rReturnTime}
                  onChange={(e) => setRReturnTime(e.target.value)}
                />
              </Field>

              {returnError && <FieldError>{returnError}</FieldError>}
            </FieldGroup>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setReturnTarget(null)}>
                Cancel
              </Button>
              <Button type="submit">Save</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
