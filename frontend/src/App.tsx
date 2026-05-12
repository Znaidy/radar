import { useState, useEffect, useCallback } from 'react'
import { BrowserRouter, Routes, Route, NavLink, Navigate } from 'react-router-dom'
import { ToastContainer } from './components/Toast'
import { Leads } from './pages/Leads'
import { Broadcasts } from './pages/Broadcasts'
import { Search } from './pages/Search'
import { Settings } from './pages/Settings'
import { api } from '@/api/client'
import { cn } from '@/lib/utils'
import type { MonitorStatus } from './types'
import { Users, Megaphone, Search as SearchIcon, Settings2 } from 'lucide-react'

const DEFAULT_STATUS: MonitorStatus = { running: false, found_today: 0 }

const NAV = [
  { to: '/leads',      label: 'Leads',     icon: Users },
  { to: '/broadcasts', label: 'Campaigns', icon: Megaphone },
  { to: '/search',     label: 'Search',    icon: SearchIcon },
  { to: '/settings',   label: 'Settings',  icon: Settings2 },
]

function Layout() {
  const [tgStatus, setTgStatus] = useState<MonitorStatus>(DEFAULT_STATUS)

  const pollStatus = useCallback(async () => {
    const s = await api.get<MonitorStatus>('/tg/status')
    setTgStatus(s ?? DEFAULT_STATUS)
  }, [])

  useEffect(() => {
    pollStatus()
    const id = setInterval(pollStatus, 15000)
    return () => clearInterval(id)
  }, [pollStatus])

  return (
    <div className="flex h-screen bg-white overflow-hidden">
      <aside className="w-14 bg-zinc-950 flex flex-col items-center shrink-0 py-3 border-r border-zinc-900">
        <div className="h-9 w-9 flex items-center justify-center text-sm font-bold tracking-tight text-white mb-2 select-none">R</div>
        <div className="h-px w-6 bg-zinc-800 mb-2" />
        <nav className="flex flex-col gap-1 flex-1 w-full px-2">
          {NAV.map(item => (
            <NavLink key={item.to} to={item.to} title={item.label}
              className={({ isActive }) => cn(
                'h-10 rounded-md flex items-center justify-center transition-colors relative group',
                isActive ? 'bg-zinc-900 text-white' : 'text-zinc-500 hover:text-zinc-200 hover:bg-zinc-900/60',
              )}
            >
              {({ isActive }) => (
                <>
                  {isActive && <span className="absolute left-0 top-2 bottom-2 w-0.5 bg-white rounded-r" />}
                  <item.icon className="h-[18px] w-[18px]" strokeWidth={1.5} />
                  <span className="absolute left-full ml-2 px-2.5 py-1 rounded-md bg-zinc-900 text-zinc-100 text-[11px] tracking-wide whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50 shadow-xl border border-zinc-800">
                    {item.label}
                  </span>
                </>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="flex flex-col items-center gap-1.5 pb-1" title={`Telegram ${tgStatus.running ? 'running' : 'stopped'}`}>
          <span className={cn('h-1 w-1 rounded-full', tgStatus.running ? 'bg-white animate-pulse' : 'bg-zinc-700')} />
        </div>
      </aside>

      <main className="flex-1 overflow-hidden">
        <Routes>
          <Route path="/"           element={<Navigate to="/leads" replace />} />
          <Route path="/leads"      element={<Leads />} />
          <Route path="/broadcasts" element={<Broadcasts />} />
          <Route path="/search"     element={<Search tgStatus={tgStatus} onStatusChange={pollStatus} />} />
          <Route path="/tools"      element={<Navigate to="/search?mode=manual" replace />} />
          <Route path="/monitor"    element={<Navigate to="/search" replace />} />
          <Route path="/settings"   element={<Settings />} />
        </Routes>
      </main>

      <ToastContainer />
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <Layout />
    </BrowserRouter>
  )
}
