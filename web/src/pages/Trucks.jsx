import { useEffect, useState } from "react"
import { PlusIcon } from "lucide-react"
import { api } from "../api"
import { useAuth } from "../context/AuthContext"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Field, FieldGroup, FieldLabel, FieldDescription, FieldError } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
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

const STATUS_ITEMS = [
  { value: null, label: "All" },
  { value: "true", label: "Active" },
  { value: "false", label: "Inactive" },
]

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

  const driverItems = [
    { value: null, label: "— None —" },
    ...driverOptions.map((d) => ({ value: String(d.id), label: d.full_name })),
  ]

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
      <div className="mb-4 flex items-center justify-between gap-4">
        <h1 className="text-xl font-semibold">Trucks</h1>
        {isAdmin && (
          <Button onClick={openCreate}>
            <PlusIcon data-icon="inline-start" />
            Add Truck
          </Button>
        )}
      </div>

      {error && (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="mb-4 flex items-center gap-2">
        <Select
          value={filter || null}
          onValueChange={(v) => { setFilter(v ?? ""); setPage(1) }}
        >
          <SelectTrigger className="w-40">
            <SelectValue placeholder="All" />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {STATUS_ITEMS.map((it) => (
                <SelectItem key={it.value ?? "all"} value={it.value}>
                  {it.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>

      <div className="overflow-hidden rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Plate</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Capacity (kg)</TableHead>
              <TableHead>Usual Driver</TableHead>
              <TableHead>Status</TableHead>
              {isAdmin && <TableHead className="text-right">Actions</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                  Loading…
                </TableCell>
              </TableRow>
            ) : trucks.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                  No trucks found
                </TableCell>
              </TableRow>
            ) : trucks.map((t) => (
              <TableRow key={t.id}>
                <TableCell>{t.plate_number}</TableCell>
                <TableCell>{t.display_name}</TableCell>
                <TableCell>{t.capacity_kg}</TableCell>
                <TableCell>{t.usual_driver ? t.usual_driver.full_name : "—"}</TableCell>
                <TableCell>
                  <Badge variant={t.is_active ? "default" : "secondary"}>
                    {t.is_active ? "Active" : "Inactive"}
                  </Badge>
                </TableCell>
                {isAdmin && (
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="sm" onClick={() => openEdit(t)}>
                        Edit
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => handleToggleActive(t)}>
                        {t.is_active ? "Deactivate" : "Activate"}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive"
                        onClick={() => handleDelete(t)}
                      >
                        Delete
                      </Button>
                    </div>
                  </TableCell>
                )}
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
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => setPage(page + 1)}
          >
            Next
          </Button>
        </div>
      )}

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Truck" : "Add Truck"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit}>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="truck-plate">Plate Number</FieldLabel>
                <Input
                  id="truck-plate"
                  type="text"
                  value={formPlate}
                  onChange={(e) => setFormPlate(e.target.value)}
                  autoFocus
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="truck-name">Display Name</FieldLabel>
                <Input
                  id="truck-name"
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="truck-capacity">Capacity (kg)</FieldLabel>
                <Input
                  id="truck-capacity"
                  type="number"
                  step="1"
                  min="1"
                  value={formCapacity}
                  onChange={(e) => setFormCapacity(e.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="truck-driver">Usual Driver</FieldLabel>
                <Select
                  value={formDriver || null}
                  onValueChange={(v) => setFormDriver(v ?? "")}
                >
                  <SelectTrigger id="truck-driver" className="w-full">
                    <SelectValue placeholder="— None —" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {driverItems.map((it) => (
                        <SelectItem key={it.value ?? "none"} value={it.value}>
                          {it.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
                {!editing && (
                  <FieldDescription>
                    New trucks are created active and require a usual driver.
                  </FieldDescription>
                )}
                {driverChanging && (
                  <FieldDescription>
                    Reassigning the usual driver: if the selected driver already drives another truck,
                    the API will return an error describing how to resolve the former truck.
                  </FieldDescription>
                )}
                {error && <FieldError>{error}</FieldError>}
              </Field>
            </FieldGroup>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowForm(false)}>
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
