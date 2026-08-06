import { useAuth } from "../context/AuthContext"

// Placeholder landing page behind auth; the real dashboard (trips, KPIs) lands
// in a later issue.
export default function Dashboard() {
  const { me } = useAuth()
  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-800">Welcome, {me?.username}</h1>
      <p className="mt-2 text-slate-600">
        You are signed in as <span className="font-medium">{me?.role}</span>.
      </p>
    </div>
  )
}
