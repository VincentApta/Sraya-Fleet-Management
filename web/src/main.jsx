import React from "react"
import { createRoot } from "react-dom/client"
import { BrowserRouter, Route, Routes } from "react-router-dom"
import "./index.css"
import { AuthProvider } from "./context/AuthContext"
import ProtectedRoute from "./components/ProtectedRoute"
import Login from "./pages/Login"
import Dashboard from "./pages/Dashboard"
import Drivers from "./pages/Drivers"
import PickupSites from "./pages/PickupSites"
import Trucks from "./pages/Trucks"
import Trips from "./pages/Trips"
import History from "./pages/History"
import Users from "./pages/Users"

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route element={<ProtectedRoute />}>
            <Route path="/" element={<Dashboard />} />
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
    </BrowserRouter>
  </React.StrictMode>,
)
