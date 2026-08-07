import { useEffect, useState } from "react"
import { Navigate } from "react-router-dom"
import { PlusIcon } from "lucide-react"
import { api } from "../api"
import { useAuth } from "../context/AuthContext"
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

const ROLES = ["Administrator", "Fleet Operator"]
const ROLE_ITEMS = ROLES.map((r) => ({ value: r, label: r }))
const STATUS_ITEMS = [
  { value: null, label: "All" },
  { value: "true", label: "Active" },
  { value: "false", label: "Inactive" },
]

// Administrator-only account management. Non-admins are bounced to the dashboard
// (the API enforces the same with 403 on every endpoint); the nav link is also
// hidden for non-admins in Layout.
export default function Users() {
  const { me } = useAuth()
  const [users, setUsers] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [perPage] = useState(25)
  const [filter, setFilter] = useState("")
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState(null) // null = create mode
  const [formUsername, setFormUsername] = useState("")
  const [formPassword, setFormPassword] = useState("")
  const [formRole, setFormRole] = useState("Fleet Operator")
  const [formActive, setFormActive] = useState(true)
  const [error, setError] = useState("")

  // Reset-password dialog state; resetUser is the target (null = closed).
  const [resetUser, setResetUser] = useState(null)
  const [resetPassword, setResetPassword] = useState("")
  const [resetError, setResetError] = useState("")

  useEffect(() => {
    fetchUsers()
  }, [page, filter])

  // All hooks are above; safe to short-circuit the render here.
  if (me?.role !== "Administrator") return <Navigate to="/" replace />

  async function fetchUsers() {
    setLoading(true)
    const params = new URLSearchParams({ page, per_page: perPage })
    if (filter) params.set("is_active", filter)
    const { ok, data } = await api.get(`/api/users?${params}`)
    if (ok) {
      setUsers(data.data || [])
      setTotal(data.total || 0)
    }
    setLoading(false)
  }

  function openCreate() {
    setEditing(null)
    setFormUsername("")
    setFormPassword("")
    setFormRole("Fleet Operator")
    setFormActive(true)
    setError("")
    setShowForm(true)
  }

  function openEdit(u) {
    setEditing(u)
    setFormUsername(u.username)
    setFormPassword("")
    setFormRole(u.role)
    setFormActive(u.is_active)
    setError("")
    setShowForm(true)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (editing) {
      const { ok, data } = await api.put(`/api/users/${editing.id}`, {
        role: formRole,
        is_active: formActive,
      })
      if (!ok) { setError(data.error || "Update failed"); return }
    } else {
      if (!formUsername.trim()) { setError("Username is required"); return }
      if (!formPassword) { setError("Password is required"); return }
      const { ok, data } = await api.post("/api/users", {
        username: formUsername,
        password: formPassword,
        role: formRole,
      })
      if (!ok) { setError(data.error || "Create failed"); return }
    }
    setShowForm(false)
    fetchUsers()
  }

  async function handleToggleActive(u) {
    const { ok, data } = await api.put(`/api/users/${u.id}`, { is_active: !u.is_active })
    if (!ok) { setError(data.error || "Toggle failed"); return }
    fetchUsers()
  }

  function openReset(u) {
    setResetUser(u)
    setResetPassword("")
    setResetError("")
  }

  async function submitReset(e) {
    e.preventDefault()
    if (!resetPassword) { setResetError("Password is required"); return }
    const { ok, data } = await api.put(`/api/users/${resetUser.id}/reset-password`, { password: resetPassword })
    if (!ok) { setResetError(data.error || "Reset failed"); return }
    setResetUser(null)
    fetchUsers()
  }

  const totalPages = Math.ceil(total / perPage)

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-4">
        <h1 className="text-xl font-semibold">Users</h1>
        <Button onClick={openCreate}>
          <PlusIcon data-icon="inline-start" />
          Add User
        </Button>
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
              <TableHead>Username</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={4} className="h-24 text-center text-muted-foreground">
                  Loading…
                </TableCell>
              </TableRow>
            ) : users.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="h-24 text-center text-muted-foreground">
                  No users found
                </TableCell>
              </TableRow>
            ) : users.map((u) => (
              <TableRow key={u.id}>
                <TableCell>{u.username}</TableCell>
                <TableCell className="text-muted-foreground">{u.role}</TableCell>
                <TableCell>
                  <Badge variant={u.is_active ? "default" : "secondary"}>
                    {u.is_active ? "Active" : "Inactive"}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    <Button variant="ghost" size="sm" onClick={() => openEdit(u)}>
                      Edit
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => handleToggleActive(u)}>
                      {u.is_active ? "Deactivate" : "Activate"}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => openReset(u)}>
                      Reset Password
                    </Button>
                  </div>
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
            <DialogTitle>{editing ? "Edit User" : "Add User"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit}>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="user-username">Username</FieldLabel>
                <Input
                  id="user-username"
                  type="text"
                  value={formUsername}
                  onChange={(e) => setFormUsername(e.target.value)}
                  autoFocus
                  disabled={!!editing}
                />
              </Field>

              {!editing && (
                <Field>
                  <FieldLabel htmlFor="user-password">Password</FieldLabel>
                  <Input
                    id="user-password"
                    type="password"
                    value={formPassword}
                    onChange={(e) => setFormPassword(e.target.value)}
                  />
                </Field>
              )}

              <Field>
                <FieldLabel htmlFor="user-role">Role</FieldLabel>
                <Select
                  value={formRole}
                  onValueChange={setFormRole}
                >
                  <SelectTrigger id="user-role" className="w-full">
                    <SelectValue placeholder="Select role" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {ROLE_ITEMS.map((item) => (
                        <SelectItem key={item.value} value={item.value}>
                          {item.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>

              {editing && (
                <Field orientation="horizontal">
                  <input
                    id="user-active"
                    type="checkbox"
                    checked={formActive}
                    onChange={(e) => setFormActive(e.target.checked)}
                    className="size-4"
                  />
                  <FieldLabel htmlFor="user-active">Active</FieldLabel>
                </Field>
              )}

              {error && <FieldError>{error}</FieldError>}
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

      <Dialog open={!!resetUser} onOpenChange={(o) => !o && setResetUser(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Reset Password</DialogTitle>
            <DialogDescription>
              Enter a new password for {resetUser?.username}.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={submitReset}>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="reset-password">New Password</FieldLabel>
                <Input
                  id="reset-password"
                  type="password"
                  value={resetPassword}
                  onChange={(e) => setResetPassword(e.target.value)}
                  autoFocus
                />
                {resetError && <FieldError>{resetError}</FieldError>}
              </Field>
            </FieldGroup>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setResetUser(null)}>
                Cancel
              </Button>
              <Button type="submit">Reset</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
