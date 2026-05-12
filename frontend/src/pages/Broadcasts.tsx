import { useEffect, useState, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api } from '@/api/client'
import { cn } from '@/lib/utils'
import { showToast } from '@/components/Toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { Campaign, CampaignStatus, Lead, LeadStatus } from '@/types'
import { Plus, Play, Trash2, Users, CheckCircle2, AlertCircle, Clock, CalendarClock, FileUp, User2, ChevronRight, ArrowLeft, Save } from 'lucide-react'

const TIMEZONES = [
  { value: 'Europe/Kyiv',          label: 'Kyiv (UTC+2/3)' },
  { value: 'Europe/Moscow',        label: 'Moscow (UTC+3)' },
  { value: 'Europe/Warsaw',        label: 'Warsaw (UTC+1/2)' },
  { value: 'Europe/Berlin',        label: 'Berlin (UTC+1/2)' },
  { value: 'Europe/London',        label: 'London (UTC+0/1)' },
  { value: 'UTC',                  label: 'UTC' },
  { value: 'America/New_York',     label: 'New York (UTC-5/-4)' },
  { value: 'America/Los_Angeles',  label: 'Los Angeles (UTC-8/-7)' },
  { value: 'Asia/Dubai',           label: 'Dubai (UTC+4)' },
  { value: 'Asia/Tbilisi',         label: 'Tbilisi (UTC+4)' },
  { value: 'Asia/Almaty',          label: 'Almaty (UTC+5)' },
]

const DAYS_UA = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const HOURS = Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2, '0')}:00`)
const DEFAULT_SCHEDULE = () => Array(7).fill(null).map((_, i) => ({ enabled: i < 5, from: '09:00', to: '18:00' }))

function toUTCISOString(localDatetime: string, tz: string): string {
  const naive = new Date(localDatetime + 'Z')
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: tz,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).formatToParts(naive)
  const p: Record<string, number> = {}
  for (const part of parts) {
    if (part.type !== 'literal') p[part.type] = parseInt(part.value)
  }
  const tzUTC = new Date(Date.UTC(p.year, p.month - 1, p.day, p.hour === 24 ? 0 : p.hour, p.minute, p.second))
  return new Date(naive.getTime() + (naive.getTime() - tzUTC.getTime())).toISOString()
}

function nextWeekday(dayIndex: number, time: string, tz: string): string {
  const jsTarget = (dayIndex + 1) % 7
  const DOW = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']
  const now = new Date()
  for (let offset = 0; offset <= 7; offset++) {
    const d = new Date(now.getTime() + offset * 86400000)
    const dow = DOW.indexOf(new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'long' }).format(d))
    if (dow !== jsTarget) continue
    const dateStr = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(d)
    const utc = toUTCISOString(`${dateStr}T${time}`, tz)
    if (new Date(utc) > now) return utc
  }
  for (let offset = 1; offset <= 14; offset++) {
    const d = new Date(now.getTime() + offset * 86400000)
    const dow = DOW.indexOf(new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'long' }).format(d))
    if (dow !== jsTarget) continue
    const dateStr = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(d)
    return toUTCISOString(`${dateStr}T${time}`, tz)
  }
  throw new Error('unreachable')
}

const STATUS_LABEL: Record<CampaignStatus, string> = {
  draft: 'Draft', running: 'Sending...', completed: 'Completed', error: 'Error', scheduled: 'Scheduled',
}
const STATUS_STYLE: Record<CampaignStatus, string> = {
  draft:     'border border-zinc-200 text-zinc-500',
  running:   'border border-zinc-900 text-zinc-900',
  completed: 'bg-zinc-900 text-white border border-zinc-900',
  error:     'border border-zinc-300 text-zinc-400 line-through',
  scheduled: 'border border-zinc-500 text-zinc-700',
}
const STATUS_ICON: Record<CampaignStatus, React.ElementType> = {
  draft: Clock, running: Play, completed: CheckCircle2, error: AlertCircle, scheduled: CalendarClock,
}
const LEAD_STATUS_LABELS: Record<LeadStatus, string> = {
  new: 'New', contacted: 'Contacted', negotiating: 'Negotiating', won: 'Won', lost: 'Lost',
}
const LEAD_STATUS_STYLES: Record<LeadStatus, string> = {
  new:         'border border-zinc-300 text-zinc-600',
  contacted:   'border border-zinc-400 text-zinc-700',
  negotiating: 'border border-zinc-600 text-zinc-800',
  won:         'bg-zinc-900 text-white border border-zinc-900',
  lost:        'border border-zinc-200 text-zinc-400 line-through',
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

type Mode = null | 'new' | 'edit' | 'send'

export function Broadcasts() {
  const [params, setParams] = useSearchParams()
  const selectedId = params.get('id') ? parseInt(params.get('id')!) : null
  const mode: Mode = (params.get('mode') as Mode) ?? (selectedId ? 'edit' : null)

  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [loading, setLoading]     = useState(true)

  // form state
  const [formName, setFormName]     = useState('')
  const [formMsg, setFormMsg]       = useState('')
  const [formSaving, setFormSaving] = useState(false)

  // send state
  const [sendStep, setSendStep]         = useState<'source' | 'contacts'>('source')
  const [sendSource, setSendSource]     = useState<'crm' | 'csv' | 'groups' | null>(null)
  const [leads, setLeads]               = useState<Lead[]>([])
  const [csvContacts, setCsvContacts]   = useState<string[]>([])
  const [selectedIds, setSelectedIds]   = useState<Set<number>>(new Set())
  const [leadSearch, setLeadSearch]     = useState('')
  const [leadFilter, setLeadFilter]     = useState<string>('all')
  const [sending, setSending]           = useState(false)
  const [scheduleMode, setScheduleMode] = useState<'now' | 'later'>('now')
  const [weekSchedule, setWeekSchedule] = useState(DEFAULT_SCHEDULE)
  const [scheduleTz, setScheduleTz]     = useState('Europe/Kyiv')

  const load = useCallback(async () => {
    const data = await api.get<Campaign[]>('/campaigns')
    setCampaigns(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const selected = selectedId ? campaigns.find(c => c.id === selectedId) ?? null : null

  // sync form when selection changes
  useEffect(() => {
    if (selected && mode === 'edit') {
      setFormName(selected.name)
      setFormMsg(selected.message)
    }
    if (mode === 'new') {
      setFormName('')
      setFormMsg('')
    }
    if (mode === 'send') {
      setSendStep('source')
      setSendSource(null)
      setLeads([])
      setCsvContacts([])
      setSelectedIds(new Set())
      setLeadSearch('')
      setLeadFilter('all')
      setScheduleMode('now')
      setWeekSchedule(DEFAULT_SCHEDULE())
      setScheduleTz('Europe/Kyiv')
    }
  }, [selected?.id, mode])

  function navigate(opts: { id?: number | null; mode?: Mode }) {
    const next = new URLSearchParams(params)
    if (opts.id === null) next.delete('id')
    else if (opts.id !== undefined) next.set('id', String(opts.id))
    if (opts.mode === null) next.delete('mode')
    else if (opts.mode !== undefined) next.set('mode', opts.mode)
    setParams(next, { replace: true })
  }

  async function selectSource(source: 'crm' | 'csv' | 'groups') {
    setSendSource(source)
    if (source === 'crm' || source === 'groups') {
      const data = await api.get<Lead[]>('/tg/leads')
      const filtered = (data ?? []).filter(l => l.contact?.startsWith('@'))
      setLeads(filtered)
      setSelectedIds(new Set(filtered.map(l => l.id)))
    }
    setSendStep('contacts')
  }

  function handleCsvUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      const text = ev.target?.result as string
      const contacts: string[] = []
      for (const line of text.split(/\r?\n/)) {
        for (const cell of line.split(',')) {
          const v = cell.trim().replace(/^["']|["']$/g, '')
          if (v.startsWith('@')) contacts.push(v)
          else if (/^\w{4,}$/.test(v)) contacts.push(`@${v}`)
        }
      }
      setCsvContacts([...new Set(contacts)])
      setSendSource('csv')
      setSendStep('contacts')
    }
    reader.readAsText(file)
  }

  async function saveForm() {
    if (!formName.trim() || !formMsg.trim()) { showToast('Fill all fields'); return }
    setFormSaving(true)
    if (mode === 'edit' && selected) {
      const r = await api.patch(`/campaigns/${selected.id}`, { name: formName, message: formMsg })
      if (r) {
        setCampaigns(prev => prev.map(c => c.id === selected.id ? { ...c, name: formName, message: formMsg } : c))
        showToast('Saved')
      }
    } else {
      const r = await api.post<Campaign>('/campaigns', { name: formName, message: formMsg })
      if (r) {
        setCampaigns(prev => [r, ...prev])
        showToast('Campaign created')
        navigate({ id: r.id, mode: 'edit' })
      }
    }
    setFormSaving(false)
  }

  async function deleteCampaign(id: number) {
    await fetch(`/api/campaigns/${id}`, { method: 'DELETE' })
    setCampaigns(prev => prev.filter(c => c.id !== id))
    if (selectedId === id) navigate({ id: null, mode: null })
    showToast('Deleted')
  }

  async function sendCampaign() {
    if (!selected) return
    const contacts = sendSource === 'csv'
      ? csvContacts
      : leads.filter(l => selectedIds.has(l.id) && l.contact).map(l => l.contact as string)
    if (!contacts.length) { showToast('No contacts selected'); return }
    const body: Record<string, unknown> = { contacts, message: selected.message }
    if (scheduleMode === 'later') {
      const enabled = weekSchedule.map((d, i) => d.enabled ? { day: i, from: d.from } : null).filter(Boolean) as { day: number; from: string }[]
      if (!enabled.length) { showToast('Select at least one day'); return }
      const times = enabled.map(e => nextWeekday(e.day, e.from, scheduleTz))
      body.scheduled_at = times.sort()[0]
    }

    setSending(true)
    const r = await api.post<{ status: string; total: number }>(`/campaigns/${selected.id}/send`, body)
    setSending(false)
    if (r?.status === 'started') {
      setCampaigns(prev => prev.map(c => c.id === selected.id ? { ...c, status: 'running' } : c))
      showToast(`Sending started — ${r.total} contacts`)
      navigate({ mode: 'edit' })
    } else if (r?.status === 'scheduled') {
      setCampaigns(prev => prev.map(c => c.id === selected.id ? { ...c, status: 'scheduled', scheduled_at: body.scheduled_at as string } : c))
      const tzLabel = TIMEZONES.find(t => t.value === scheduleTz)?.label ?? scheduleTz
      showToast(`Scheduled — ${r.total} contacts · ${tzLabel}`)
      navigate({ mode: 'edit' })
    } else {
      showToast('Launch failed')
    }
  }

  const visibleLeads = leads.filter(l => {
    if (leadFilter !== 'all' && l.status !== leadFilter) return false
    if (!leadSearch) return true
    const q = leadSearch.toLowerCase()
    return l.title?.toLowerCase().includes(q) ||
           l.contact?.toLowerCase().includes(q) ||
           l.channel?.toLowerCase().includes(q)
  })

  function toggleLead(id: number) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function toggleAll() {
    const allVisible = visibleLeads.map(l => l.id)
    const allSelected = allVisible.every(id => selectedIds.has(id))
    setSelectedIds(prev => {
      const next = new Set(prev)
      allSelected ? allVisible.forEach(id => next.delete(id)) : allVisible.forEach(id => next.add(id))
      return next
    })
  }

  const hasRightPane = !!mode

  return (
    <div className="flex h-full">
      {/* LIST COLUMN */}
      <div className="flex flex-col min-w-0 w-[40%] border-r">
        <div className="px-5 py-3.5 border-b bg-white shrink-0 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-base font-bold tracking-tight">Campaigns</h1>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {loading ? 'Loading…' : `${campaigns.length} campaigns`}
            </p>
          </div>
          <Button size="sm" className="gap-1.5" onClick={() => navigate({ id: null, mode: 'new' })}>
            <Plus className="h-3.5 w-3.5" />New
          </Button>
        </div>

        <div className="flex-1 overflow-auto bg-zinc-50">
          {loading ? (
            <div className="p-10 text-center text-sm text-muted-foreground">Loading…</div>
          ) : campaigns.length === 0 ? (
            <div className="p-10 text-center text-sm text-muted-foreground">No campaigns yet</div>
          ) : (
            <ul className="divide-y bg-white">
              {campaigns.map(c => {
                const Icon = STATUS_ICON[c.status]
                return (
                  <li key={c.id} onClick={() => navigate({ id: c.id, mode: 'edit' })}
                    className={cn('px-5 py-3.5 cursor-pointer transition-colors border-l-2',
                      selectedId === c.id ? 'bg-zinc-50 border-l-zinc-900' : 'border-l-transparent hover:bg-zinc-50/60')}>
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <p className="text-sm font-semibold truncate text-zinc-900">{c.name}</p>
                      <span className={cn('flex items-center gap-1 px-1.5 py-0.5 rounded-sm text-[10px] font-medium uppercase tracking-wide shrink-0', STATUS_STYLE[c.status])}>
                        <Icon className="h-2.5 w-2.5" />
                        {STATUS_LABEL[c.status]}
                      </span>
                    </div>
                    <p className="text-[11px] text-zinc-500 line-clamp-2 leading-4">{c.message}</p>
                    <div className="flex items-center gap-3 text-[11px] text-zinc-500 mt-2">
                      <span>Sent: <strong className="text-zinc-900 tabular-nums">{c.sent_count}</strong></span>
                      {c.status === 'scheduled' && c.scheduled_at ? (
                        <span className="text-zinc-700 tabular-nums">
                          {new Date(c.scheduled_at).toLocaleString('uk-UA', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                        </span>
                      ) : (
                        <span className="text-zinc-400 tabular-nums">{formatDate(c.created_at)}</span>
                      )}
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>

      {/* RIGHT PANE */}
      {!hasRightPane && (
        <div className="flex-1 flex items-center justify-center bg-zinc-50 text-xs text-muted-foreground">
          Select a campaign or create a new one
        </div>
      )}

      {(mode === 'new' || mode === 'edit') && (
        <div className="flex-1 min-w-0 flex flex-col bg-white">
          <div className="px-6 py-3.5 border-b shrink-0 flex items-center justify-between gap-2">
            <p className="text-sm font-semibold">
              {mode === 'new' ? 'New campaign' : selected?.name}
            </p>
            <div className="flex items-center gap-2">
              {selected && mode === 'edit' && selected.status !== 'running' && selected.status !== 'scheduled' && (
                <Button size="sm" className="gap-1.5" onClick={() => navigate({ mode: 'send' })}>
                  <Play className="h-3 w-3" />Send
                </Button>
              )}
              {selected && (
                <button onClick={() => deleteCampaign(selected.id)}
                  className="h-8 w-8 flex items-center justify-center text-zinc-400 hover:text-zinc-900 transition-colors rounded-md hover:bg-zinc-50">
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4 max-w-2xl">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Name</Label>
              <Input value={formName} onChange={e => setFormName(e.target.value)}
                placeholder="My campaign" className="h-9 text-sm" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Message</Label>
              <textarea value={formMsg} onChange={e => setFormMsg(e.target.value)}
                placeholder="Hi! Saw your post..."
                className="w-full h-64 px-3 py-2.5 text-sm border rounded-md bg-background resize-none focus:outline-none focus:ring-1 focus:ring-ring" />
              <p className="text-[11px] text-muted-foreground">Sent from your Telegram account</p>
            </div>
            {selected && mode === 'edit' && (
              <div className="grid grid-cols-3 gap-3 pt-2 border-t">
                <div>
                  <p className="text-[11px] text-muted-foreground">Sent</p>
                  <p className="text-lg font-bold tabular-nums">{selected.sent_count}</p>
                </div>
                <div>
                  <p className="text-[11px] text-muted-foreground">Status</p>
                  <p className="text-sm font-medium">{STATUS_LABEL[selected.status]}</p>
                </div>
                <div>
                  <p className="text-[11px] text-muted-foreground">Created</p>
                  <p className="text-sm font-medium tabular-nums">{formatDate(selected.created_at)}</p>
                </div>
              </div>
            )}
          </div>
          <div className="px-6 py-3.5 border-t flex items-center justify-end gap-2 shrink-0">
            <Button variant="outline" size="sm" onClick={() => navigate({ id: null, mode: null })}>
              Cancel
            </Button>
            <Button size="sm" onClick={saveForm} disabled={formSaving} className="gap-1.5">
              <Save className="h-3.5 w-3.5" />
              {formSaving ? 'Saving...' : mode === 'new' ? 'Create' : 'Save'}
            </Button>
          </div>
        </div>
      )}

      {mode === 'send' && selected && (
        <div className="flex-1 min-w-0 flex flex-col bg-white">
          <div className="px-6 py-3.5 border-b shrink-0 flex items-center gap-2">
            <button onClick={() => navigate({ mode: 'edit' })}
              className="h-8 w-8 flex items-center justify-center text-muted-foreground hover:text-foreground rounded-md hover:bg-zinc-50">
              <ArrowLeft className="h-4 w-4" />
            </button>
            <p className="text-sm font-semibold truncate">Send: {selected.name}</p>
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4 max-w-2xl">
            {sendStep === 'source' && (
              <div className="space-y-2">
                {[
                  { key: 'csv',    Icon: FileUp,  title: 'Upload CSV',   desc: 'Upload a CSV file with contacts' },
                  { key: 'crm',    Icon: User2,   title: 'Leads from CRM', desc: 'Use leads from CRM' },
                  { key: 'groups', Icon: Users,   title: 'Groups from CRM', desc: 'Send to groups' },
                ].map(({ key, Icon, title, desc }) => (
                  <label key={key} className="relative flex items-center gap-4 p-4 bg-white border border-zinc-200 rounded-md cursor-pointer hover:border-zinc-900 transition-colors">
                    <div className="h-10 w-10 rounded-md bg-zinc-100 flex items-center justify-center shrink-0">
                      <Icon className="h-5 w-5 text-zinc-700" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold">{title}</p>
                      <p className="text-xs text-muted-foreground">{desc}</p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                    {key === 'csv' ? (
                      <input type="file" accept=".csv,.txt" className="absolute inset-0 opacity-0 cursor-pointer" onChange={handleCsvUpload} />
                    ) : (
                      <button className="absolute inset-0" onClick={() => selectSource(key as 'crm' | 'groups')} />
                    )}
                  </label>
                ))}
              </div>
            )}

            {sendStep === 'contacts' && (
              <div className="space-y-3">
                {sendSource === 'csv' ? (
                  <div className="border rounded-md overflow-hidden">
                    <div className="px-3 py-2 bg-zinc-50 border-b text-[10px] uppercase tracking-wider text-zinc-500 font-medium">
                      {csvContacts.length} contacts from file
                    </div>
                    <div className="max-h-80 overflow-y-auto divide-y">
                      {csvContacts.map(c => (
                        <div key={c} className="px-3 py-2 text-xs font-medium text-zinc-900">{c}</div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center gap-2">
                      <Select value={leadFilter} onValueChange={v => setLeadFilter(v ?? 'all')}>
                        <SelectTrigger className="h-8 w-36 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all" className="text-xs">All statuses</SelectItem>
                          {(Object.keys(LEAD_STATUS_LABELS) as LeadStatus[]).map(s => (
                            <SelectItem key={s} value={s} className="text-xs">{LEAD_STATUS_LABELS[s]}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Input value={leadSearch} onChange={e => setLeadSearch(e.target.value)} placeholder="Search…" className="h-8 text-xs flex-1" />
                      <span className="text-xs text-muted-foreground whitespace-nowrap">{selectedIds.size} / {leads.length}</span>
                    </div>

                    <div className="border rounded-lg overflow-hidden">
                      <div className="flex items-center gap-2.5 px-3 py-2 bg-zinc-50 border-b">
                        <Checkbox
                          checked={visibleLeads.length > 0 && visibleLeads.every(l => selectedIds.has(l.id))}
                          onCheckedChange={toggleAll}
                        />
                        <span className="text-[11px] text-muted-foreground font-medium">
                          {visibleLeads.every(l => selectedIds.has(l.id)) ? 'Clear all' : 'Select all'} ({visibleLeads.length})
                        </span>
                      </div>
                      <div className="max-h-80 overflow-y-auto divide-y">
                        {visibleLeads.length === 0
                          ? <div className="py-6 text-center text-xs text-muted-foreground">No leads with a contact</div>
                          : visibleLeads.map(lead => (
                            <div key={lead.id} onClick={() => toggleLead(lead.id)}
                              className={cn('flex items-center gap-2.5 px-3 py-2.5 cursor-pointer transition-colors',
                                selectedIds.has(lead.id) ? 'bg-zinc-50' : 'hover:bg-zinc-50/60')}>
                              <Checkbox checked={selectedIds.has(lead.id)} onCheckedChange={() => toggleLead(lead.id)} />
                              <span className="flex-1 text-xs font-medium truncate text-zinc-900">{lead.contact}</span>
                              <span className={cn('text-[10px] font-medium px-1.5 py-0.5 rounded-sm uppercase tracking-wide shrink-0', LEAD_STATUS_STYLES[lead.status])}>
                                {LEAD_STATUS_LABELS[lead.status]}
                              </span>
                            </div>
                          ))
                        }
                      </div>
                    </div>
                  </>
                )}

                <div className="border rounded-lg p-3 space-y-3">
                  <div className="flex gap-1.5">
                    <Button size="sm" className="flex-1" variant={scheduleMode === 'now' ? 'default' : 'outline'} onClick={() => setScheduleMode('now')}>Now</Button>
                    <Button size="sm" className="flex-1" variant={scheduleMode === 'later' ? 'default' : 'outline'} onClick={() => setScheduleMode('later')}>Schedule</Button>
                  </div>
                  {scheduleMode === 'later' && (
                    <div className="space-y-3">
                      <div className="divide-y border rounded-lg overflow-hidden">
                        {DAYS_UA.map((day, i) => {
                          const d = weekSchedule[i]
                          return (
                            <div key={i} className={cn('flex items-center gap-3 px-3 py-2', !d.enabled && 'opacity-40')}>
                              <Checkbox checked={d.enabled} onCheckedChange={() => setWeekSchedule(prev => prev.map((x, idx) => idx === i ? { ...x, enabled: !x.enabled } : x))} />
                              <span className="flex-1 text-sm">{day}</span>
                              <Select value={d.from} disabled={!d.enabled} onValueChange={v => v && setWeekSchedule(prev => prev.map((x, idx) => idx === i ? { ...x, from: v } : x))}>
                                <SelectTrigger size="sm" className="w-20 text-xs"><SelectValue /></SelectTrigger>
                                <SelectContent className="max-h-48">{HOURS.map(h => <SelectItem key={h} value={h} className="text-xs">{h}</SelectItem>)}</SelectContent>
                              </Select>
                              <span className="text-muted-foreground text-xs">—</span>
                              <Select value={d.to} disabled={!d.enabled} onValueChange={v => v && setWeekSchedule(prev => prev.map((x, idx) => idx === i ? { ...x, to: v } : x))}>
                                <SelectTrigger size="sm" className="w-20 text-xs"><SelectValue /></SelectTrigger>
                                <SelectContent className="max-h-48">{HOURS.map(h => <SelectItem key={h} value={h} className="text-xs">{h}</SelectItem>)}</SelectContent>
                              </Select>
                            </div>
                          )
                        })}
                      </div>
                      <Select value={scheduleTz} onValueChange={v => setScheduleTz(v ?? 'Europe/Kyiv')}>
                        <SelectTrigger className="h-9 text-sm w-full"><SelectValue /></SelectTrigger>
                        <SelectContent>{TIMEZONES.map(tz => <SelectItem key={tz.value} value={tz.value} className="text-xs">{tz.label}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {sendStep === 'contacts' && (
            <div className="px-6 py-3.5 border-t flex items-center justify-end gap-2 shrink-0">
              <Button variant="outline" size="sm" onClick={() => setSendStep('source')}>Back</Button>
              <Button size="sm" onClick={sendCampaign}
                disabled={sending || (sendSource === 'csv' ? csvContacts.length === 0 : selectedIds.size === 0)}
                className="gap-1.5">
                {scheduleMode === 'later' ? <CalendarClock className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                {sending ? 'Starting...' : scheduleMode === 'later'
                  ? `Schedule (${sendSource === 'csv' ? csvContacts.length : selectedIds.size})`
                  : `Send (${sendSource === 'csv' ? csvContacts.length : selectedIds.size})`}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
