import { createContext, useContext, useEffect, useState } from "react"
import { api } from "../api"

const AuthContext = createContext(null)

// AuthProvider tracks the currently logged-in user (`me`). On mount it asks the
// API who the cookie says we are; login/logout update server + local state.
export function AuthProvider({ children }) {
  const [me, setMe] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api
      .get("/api/auth/me")
      .then(({ ok, data }) => setMe(ok ? data.user ?? null : null))
      .finally(() => setLoading(false))
  }, [])

  async function login(username, password) {
    const { ok, data } = await api.post("/api/auth/login", { username, password })
    if (!ok) throw new Error(data.error || "Login failed")
    setMe(data.user)
    return data.user
  }

  async function logout() {
    await api.post("/api/auth/logout")
    setMe(null)
  }

  return (
    <AuthContext.Provider value={{ me, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider")
  return ctx
}
