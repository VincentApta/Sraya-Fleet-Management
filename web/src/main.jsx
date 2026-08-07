import React from "react"
import { createRoot } from "react-dom/client"
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom"
import "./index.css"
import { AuthProvider, useAuth } from "./context/AuthContext"
import { ThemeProvider } from "./context/ThemeContext"
import ProtectedRoute from "./components/ProtectedRoute"
import Login from "./pages/Login"
import Splash from "./pages/Splash"
import Dashboard from "./pages/Dashboard"
import Drivers from "./pages/Drivers"
import PickupSites from "./pages/PickupSites"
import Trucks from "./pages/Trucks"
import Trips from "./pages/Trips"
import History from "./pages/History"
import Users from "./pages/Users"

// Root route: signed-in users land on the dashboard, everyone else sees the
// splash. Awaiting the session check avoids a Splash→Dashboard flash.
function Root() {
  const { me, loading } = useAuth()
  if (loading) return null
  return me ? <Navigate to="/dashboard" replace /> : <Splash />
}

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <ThemeProvider>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<Root />} />
          <Route path="/login" element={<Login />} />
          <Route element={<ProtectedRoute />}>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/drivers" element={<Drivers />} />
            <Route path="/pickup-sites" element={<PickupSites />} />
            <Route path="/trucks" element={<Trucks />} />
            <Route path="/trips" element={<Trips />} />
            <Route path="/history" element={<History />} />
            <Route path="/users" element={<Users />} />
          </Route>
          <Route path="*" element={<Login />} />
        </Routes>
      </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  </React.StrictMode>,
)
