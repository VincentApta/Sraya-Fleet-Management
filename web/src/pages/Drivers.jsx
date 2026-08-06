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
import { Field, FieldGroup, FieldLabel, FieldError } from "@/components/ui/field"
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
      <div className="mb-4 flex items-center justify-between gap-4">
        <h1 className="text-xl font-semibold">Drivers</h1>
        {isAdmin && (
          <Button onClick={openCreate}>
            <PlusIcon data-icon="inline-start" />
            Add Driver
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
          items={STATUS_ITEMS}
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
              <TableHead>Name</TableHead>
              <TableHead>Status</TableHead>
              {isAdmin && <TableHead className="text-right">Actions</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={3} className="h-24 text-center text-muted-foreground">
                  Loading…
                </TableCell>
              </TableRow>
            ) : drivers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={3} className="h-24 text-center text-muted-foreground">
                  No drivers found
                </TableCell>
              </TableRow>
            ) : drivers.map((d) => (
              <TableRow key={d.id}>
                <TableCell>{d.full_name}</TableCell>
                <TableCell>
                  <Badge variant={d.is_active ? "default" : "secondary"}>
                    {d.is_active ? "Active" : "Inactive"}
                  </Badge>
                </TableCell>
                {isAdmin && (
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="sm" onClick={() => openEdit(d)}>
                        Edit
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => handleToggleActive(d)}>
                        {d.is_active ? "Deactivate" : "Activate"}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive"
                        onClick={() => handleDelete(d)}
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
            <DialogTitle>{editing ? "Edit Driver" : "Add Driver"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit}>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="driver-name">Full Name</FieldLabel>
                <Input
                  id="driver-name"
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  autoFocus
                />
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
