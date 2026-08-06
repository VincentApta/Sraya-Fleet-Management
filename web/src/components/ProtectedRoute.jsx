import { Navigate, Outlet } from "react-router-dom"
import { useAuth } from "../context/AuthContext"
import Layout from "./Layout"

// Guards authenticated routes: while the session is being checked show a
// spinner; if there is no user, bounce to /login; otherwise render the Layout
// (header + logout) whose <Outlet/> hosts the matched child route.
export default function ProtectedRoute() {
  const { me, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-slate-500">
        Loading…
      </div>
    )
  }
  if (!me) {
    return <Navigate to="/login" replace />
  }
  return (
    <Layout>
      <Outlet />
    </Layout>
  )
}
