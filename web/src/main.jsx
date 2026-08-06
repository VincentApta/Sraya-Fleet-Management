import React from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'

function App() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="text-center">
        <h1 className="text-3xl font-bold text-slate-800">Sraya Fleet Management</h1>
        <p className="mt-2 text-slate-500">Local dev environment is running.</p>
      </div>
    </div>
  )
}

createRoot(document.getElementById('root')).render(<App />)
