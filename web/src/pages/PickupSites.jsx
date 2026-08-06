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
      <div className="mb-4 flex items-center justify-between gap-4">
        <h1 className="text-xl font-semibold">Pickup Sites</h1>
        {isAdmin && (
          <Button onClick={openCreate}>
            <PlusIcon data-icon="inline-start" />
            Add Pickup Site
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
              <TableHead>Distance (km)</TableHead>
              <TableHead>Status</TableHead>
              {isAdmin && <TableHead className="text-right">Actions</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={4} className="h-24 text-center text-muted-foreground">
                  Loading…
                </TableCell>
              </TableRow>
            ) : sites.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="h-24 text-center text-muted-foreground">
                  No pickup sites found
                </TableCell>
              </TableRow>
            ) : sites.map((s) => (
              <TableRow key={s.id}>
                <TableCell>{s.site_name}</TableCell>
                <TableCell>{s.distance_km}</TableCell>
                <TableCell>
                  <Badge variant={s.is_active ? "default" : "secondary"}>
                    {s.is_active ? "Active" : "Inactive"}
                  </Badge>
                </TableCell>
                {isAdmin && (
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="sm" onClick={() => openEdit(s)}>
                        Edit
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => handleToggleActive(s)}>
                        {s.is_active ? "Deactivate" : "Activate"}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive"
                        onClick={() => handleDelete(s)}
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
            <DialogTitle>{editing ? "Edit Pickup Site" : "Add Pickup Site"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit}>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="site-name">Site Name</FieldLabel>
                <Input
                  id="site-name"
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  autoFocus
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="site-distance">Distance (km)</FieldLabel>
                <Input
                  id="site-distance"
                  type="number"
                  step="any"
                  min="0"
                  value={formDistance}
                  onChange={(e) => setFormDistance(e.target.value)}
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
