import { Link, useNavigate } from "react-router-dom"
import { useAuth } from "../context/AuthContext"

// App shell: header with the current user and a logout button, then the page
// content passed as children.
export default function Layout({ children }) {
  const { me, logout } = useAuth()
  const navigate = useNavigate()
  const isAdmin = me?.role === "Administrator"

  async function handleLogout() {
    await logout()
    navigate("/login", { replace: true })
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <span className="font-semibold text-slate-800">Sraya Fleet Management</span>
            <nav className="flex items-center gap-4 text-sm">
              <Link to="/" className="text-slate-600 hover:text-slate-900">Dashboard</Link>
              <Link to="/drivers" className="text-slate-600 hover:text-slate-900">Drivers</Link>
              <Link to="/pickup-sites" className="text-slate-600 hover:text-slate-900">Pickup Sites</Link>
              <Link to="/trucks" className="text-slate-600 hover:text-slate-900">Trucks</Link>
              <Link to="/trips" className="text-slate-600 hover:text-slate-900">Trips</Link>
              {isAdmin && <Link to="/users" className="text-slate-600 hover:text-slate-900">Users</Link>}
            </nav>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="text-slate-600">
              {me?.username} <span className="text-slate-400">· {me?.role}</span>
            </span>
            <button
              onClick={handleLogout}
              className="px-3 py-1.5 rounded-md bg-slate-800 text-white hover:bg-slate-700"
            >
              Logout
            </button>
          </div>
        </div>
      </header>
      <main className="max-w-6xl mx-auto px-4 py-6">{children}</main>
    </div>
  )
}
