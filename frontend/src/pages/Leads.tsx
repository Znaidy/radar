import { useEffect, useState, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api } from '@/api/client'
import { cn } from '@/lib/utils'
import { showToast } from '@/components/Toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import type { Lead, LeadStatus } from '@/types'
import { Search, RefreshCw, ExternalLink, Send, Plus, Trash2, Download, Loader2 } from 'lucide-react'

const STATUS_LABELS: Record<LeadStatus, string> = {
  new:         'New',
  contacted:   'Contacted',
  negotiating: 'Negotiating',
  won:         'Won',
  lost:        'Lost',
}

const STATUS_STYLES: Record<LeadStatus, string> = {
  new:         'border border-zinc-300 text-zinc-600',
  contacted:   'border border-zinc-400 text-zinc-700',
  negotiating: 'border border-zinc-600 text-zinc-800',
  won:         'bg-zinc-900 text-white border border-zinc-900',
  lost:        'border border-zinc-200 text-zinc-400 line-through',
}

function formatDate(iso: string) {
  const d = new Date(iso)
  return d.toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit' }) +
    ' ' + d.toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' })
}

const EMPTY_FORM = { title: '', channel: '', contact: '', notes: '', url: '', status: 'new' as LeadStatus }

export function Leads() {
  const [params, setParams] = useSearchParams()
  const selectedId = params.get('id') ? parseInt(params.get('id')!) : null

  const [leads, setLeads]           = useState<Lead[]>([])
  const [loading, setLoading]       = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const [query, setQuery]               = useState('')
  const [filterStatus, setFilterStatus] = useState<string>('all')

  // edit state for currently selected lead
  const [editContact, setEditContact] = useState('')
  const [editNotes, setEditNotes]   = useState('')
  const [editStatus, setEditStatus] = useState<LeadStatus>('new')
  const [saving, setSaving]         = useState(false)

  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm]             = useState(EMPTY_FORM)
  const [creating, setCreating]     = useState(false)

  const [showExport, setShowExport]       = useState(false)
  const [exportStatus, setExportStatus]   = useState('all')
  const [exporting, setExporting]         = useState(false)

  const load = useCallback(async () => {
    const data = await api.get<Lead[]>('/tg/leads')
    setLeads(data ?? [])
    setLoading(false)
    setRefreshing(false)
  }, [])

  useEffect(() => { load() }, [load])

  const selected = selectedId ? leads.find(l => l.id === selectedId) ?? null : null

  // sync edit state when selected changes
  useEffect(() => {
    if (selected) {
      setEditContact(selected.contact ?? '')
      setEditNotes(selected.notes ?? '')
      setEditStatus(selected.status)
    }
  }, [selected?.id])

  function setSelected(id: number | null) {
    const next = new URLSearchParams(params)
    if (id == null) next.delete('id')
    else next.set('id', String(id))
    setParams(next, { replace: true })
  }

  function openCreate() { setForm(EMPTY_FORM); setShowCreate(true) }

  async function createLead() {
    if (!form.title.trim()) { showToast('Enter a lead title'); return }
    setCreating(true)
    const r = await api.post<Lead>('/tg/leads', {
      title:   form.title.trim(),
      channel: form.channel.trim() || null,
      contact: form.contact.trim() || null,
      notes:   form.notes.trim()   || null,
      url:     form.url.trim()     || null,
      status:  form.status,
    })
    setCreating(false)
    if (r) {
      setLeads(prev => [r, ...prev])
      setShowCreate(false)
      showToast('Lead created')
    }
  }

  async function exportCsv() {
    setExporting(true)
    const qs = exportStatus !== 'all' ? `?status=${exportStatus}` : ''
    try {
      const res = await fetch(`/api/tools/export${qs}`)
      if (!res.ok) throw new Error()
      const blob = await res.blob()
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href     = url
      a.download = `leads-${new Date().toISOString().slice(0, 10)}.csv`
      a.click()
      URL.revokeObjectURL(url)
      showToast('CSV downloaded')
      setShowExport(false)
    } catch {
      showToast('Export failed')
    }
    setExporting(false)
  }

  async function deleteLead(id: number) {
    await fetch(`/api/tg/leads/${id}`, { method: 'DELETE' })
    setLeads(prev => prev.filter(l => l.id !== id))
    if (selectedId === id) setSelected(null)
    showToast('Lead deleted')
  }

  async function saveLead() {
    if (!selected) return
    setSaving(true)
    const r = await api.patch(`/tg/leads/${selected.id}`, {
      status: editStatus, contact: editContact || null, notes: editNotes || null,
    })
    setSaving(false)
    if (r) {
      setLeads(prev => prev.map(l =>
        l.id === selected.id ? { ...l, status: editStatus, contact: editContact, notes: editNotes } : l
      ))
      showToast('Saved')
    }
  }

  async function quickStatus(id: number, status: LeadStatus) {
    const r = await api.patch(`/tg/leads/${id}`, { status })
    if (r) setLeads(prev => prev.map(l => l.id === id ? { ...l, status } : l))
  }

  const visible = leads.filter(l => {
    if (filterStatus !== 'all' && l.status !== filterStatus) return false
    if (!query) return true
    const q = query.toLowerCase()
    return l.title?.toLowerCase().includes(q) ||
           l.channel?.toLowerCase().includes(q) ||
           l.contact?.toLowerCase().includes(q)
  })

  return (
    <div className="flex h-full">
      {/* LIST COLUMN */}
      <div className="flex flex-col min-w-0 w-[40%] border-r">

        <div className="px-5 py-3.5 border-b bg-white shrink-0 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-base font-bold tracking-tight">Leads</h1>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {loading ? 'Loading…' : `${leads.length} total · ${visible.length} shown`}
            </p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <Select value={filterStatus} onValueChange={v => setFilterStatus(v ?? 'all')}>
              <SelectTrigger className="h-8 w-32 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all" className="text-xs">All statuses</SelectItem>
                {(Object.keys(STATUS_LABELS) as LeadStatus[]).map(s => (
                  <SelectItem key={s} value={s} className="text-xs">{STATUS_LABELS[s]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex items-center gap-2 bg-white border rounded-lg px-3 h-8">
              <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search…"
                className="text-xs outline-none w-28 placeholder:text-muted-foreground bg-transparent" />
            </div>
            <Button variant="outline" size="sm" className="h-8 w-8 p-0" disabled={refreshing}
              onClick={() => { setRefreshing(true); load() }}>
              <RefreshCw className={cn('h-3.5 w-3.5', refreshing && 'animate-spin')} />
            </Button>
            <Button variant="outline" size="sm" className="h-8 w-8 p-0" onClick={() => setShowExport(true)}>
              <Download className="h-3.5 w-3.5" />
            </Button>
            <Button size="sm" className="h-8 gap-1.5" onClick={openCreate}>
              <Plus className="h-3.5 w-3.5" />New
            </Button>
          </div>
        </div>

        <div className="flex-1 overflow-auto bg-white">
          {loading ? (
            <div className="p-10 text-center text-sm text-muted-foreground">Loading…</div>
          ) : visible.length === 0 ? (
            <div className="p-10 text-center text-sm text-muted-foreground">
              {query || filterStatus !== 'all' ? 'No matches' : 'No leads yet'}
            </div>
          ) : (
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-white z-10">
                <tr className="border-b">
                  <th className="text-left text-[10px] uppercase tracking-wider font-medium text-zinc-400 px-5 py-2.5">Lead</th>
                  <th className="text-left text-[10px] uppercase tracking-wider font-medium text-zinc-400 px-3 py-2.5 w-36">Source</th>
                  <th className="text-left text-[10px] uppercase tracking-wider font-medium text-zinc-400 px-3 py-2.5 w-24">Status</th>
                  <th className="text-right text-[10px] uppercase tracking-wider font-medium text-zinc-400 px-5 py-2.5 w-24">Date</th>
                </tr>
              </thead>
              <tbody>
                {visible.map(lead => (
                  <tr key={lead.id} onClick={() => setSelected(lead.id)}
                    className={cn('cursor-pointer transition-colors border-b border-zinc-100',
                      selectedId === lead.id ? 'bg-zinc-50' : 'hover:bg-zinc-50/60')}>
                    <td className="px-5 py-3 max-w-0">
                      {lead.contact ? (
                        <a href={`https://t.me/${lead.contact.replace('@','')}`} target="_blank" rel="noreferrer"
                          onClick={e => e.stopPropagation()}
                          className="text-xs font-semibold leading-4 text-zinc-900 truncate block hover:underline">
                          {lead.contact}
                        </a>
                      ) : (
                        <span className="text-xs text-zinc-400">—</span>
                      )}
                    </td>
                    <td className="px-3 py-3 truncate">
                      {lead.channel ? (
                        <a href={`https://t.me/${lead.channel.replace('@','')}`} target="_blank" rel="noreferrer"
                          onClick={e => e.stopPropagation()}
                          className="text-zinc-700 font-medium hover:underline">
                          {lead.channel}
                        </a>
                      ) : (
                        <span className="text-zinc-300">—</span>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <span className={cn('px-2 py-0.5 rounded-sm text-[10px] font-medium uppercase tracking-wide whitespace-nowrap', STATUS_STYLES[lead.status])}>
                        {STATUS_LABELS[lead.status]}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right text-zinc-400 tabular-nums whitespace-nowrap">
                      {formatDate(lead.found_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* DETAIL COLUMN */}
      {selected && (
        <div className="flex-1 min-w-0 flex flex-col bg-white">
          <div className="px-6 py-3.5 border-b shrink-0 flex items-center justify-between gap-2">
            <p className="text-sm font-semibold truncate">Lead details</p>
            <div className="flex items-center gap-1">
              {selected.url && (
                <a href={selected.url} target="_blank" rel="noreferrer"
                  className="h-8 w-8 flex items-center justify-center text-zinc-400 hover:text-zinc-900 transition-colors rounded-md hover:bg-zinc-50">
                  <ExternalLink className="h-4 w-4" />
                </a>
              )}
              <button onClick={() => deleteLead(selected.id)}
                className="h-8 w-8 flex items-center justify-center text-zinc-400 hover:text-zinc-900 transition-colors rounded-md hover:bg-zinc-50">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
            <div className="bg-zinc-50 rounded-lg p-4 text-sm leading-6 text-zinc-700 border whitespace-pre-wrap break-words">
              {selected.title}
            </div>
            {selected.channel && (
              <div className="flex items-center gap-2">
                <span className="text-[11px] uppercase tracking-wider text-zinc-400">Source</span>
                <span className="text-xs font-medium text-zinc-900">{selected.channel}</span>
              </div>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Status</Label>
                <Select value={editStatus} onValueChange={v => setEditStatus(v as LeadStatus)}>
                  <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.keys(STATUS_LABELS) as LeadStatus[]).map(s => (
                      <SelectItem key={s} value={s} className="text-xs">{STATUS_LABELS[s]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Contact</Label>
                <div className="flex gap-2">
                  <Input value={editContact} onChange={e => setEditContact(e.target.value)}
                    placeholder="@username" className="h-9 text-xs flex-1" />
                  {editContact && (
                    <a href={`https://t.me/${editContact.replace('@', '')}`} target="_blank" rel="noreferrer"
                      className="h-9 w-9 flex items-center justify-center border border-zinc-200 rounded-md text-zinc-400 hover:text-zinc-900 hover:border-zinc-900 transition-colors shrink-0">
                      <Send className="h-3.5 w-3.5" />
                    </a>
                  )}
                </div>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Notes</Label>
              <textarea value={editNotes} onChange={e => setEditNotes(e.target.value)}
                placeholder="Details, agreements, next step..."
                className="w-full h-40 px-3 py-2.5 text-xs border rounded-md bg-background resize-none focus:outline-none focus:ring-1 focus:ring-ring" />
            </div>
            <div className="text-[11px] text-muted-foreground space-y-0.5">
              <p>Found: {formatDate(selected.found_at)}</p>
              <p>Updated: {formatDate(selected.updated_at)}</p>
            </div>
          </div>
          <div className="px-6 py-3.5 border-t flex items-center justify-end gap-2 shrink-0">
            <Button variant="outline" size="sm" onClick={() => quickStatus(selected.id, editStatus)}>
              Quick update
            </Button>
            <Button size="sm" onClick={saveLead} disabled={saving}>
              {saving ? 'Saving...' : 'Save'}
            </Button>
          </div>
        </div>
      )}

      {!selected && (
        <div className="flex-1 flex items-center justify-center bg-zinc-50 text-xs text-muted-foreground">
          Select a lead from the list
        </div>
      )}

      {/* Export modal */}
      <Dialog open={showExport} onOpenChange={v => !v && setShowExport(false)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Export leads</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Status</Label>
              <Select value={exportStatus} onValueChange={v => setExportStatus(v ?? 'all')}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all" className="text-xs">All statuses</SelectItem>
                  {(Object.keys(STATUS_LABELS) as LeadStatus[]).map(s => (
                    <SelectItem key={s} value={s} className="text-xs">{STATUS_LABELS[s]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setShowExport(false)}>Cancel</Button>
              <Button size="sm" onClick={exportCsv} disabled={exporting} className="gap-1.5">
                {exporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                {exporting ? 'Downloading...' : 'Download CSV'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Create modal */}
      <Dialog open={showCreate} onOpenChange={v => !v && setShowCreate(false)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>New lead</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-2">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Title / description *</Label>
              <textarea value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                placeholder="Lead description or request text..."
                className="w-full h-24 px-3 py-2 text-xs border rounded-md bg-background resize-none focus:outline-none focus:ring-1 focus:ring-ring" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Source</Label>
                <Input value={form.channel} onChange={e => setForm(f => ({ ...f, channel: e.target.value }))}
                  placeholder="@channel" className="h-8 text-xs" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Contact</Label>
                <Input value={form.contact} onChange={e => setForm(f => ({ ...f, contact: e.target.value }))}
                  placeholder="@username" className="h-8 text-xs" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Status</Label>
                <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v as LeadStatus }))}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.keys(STATUS_LABELS) as LeadStatus[]).map(s => (
                      <SelectItem key={s} value={s} className="text-xs">{STATUS_LABELS[s]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">URL</Label>
                <Input value={form.url} onChange={e => setForm(f => ({ ...f, url: e.target.value }))}
                  placeholder="https://..." className="h-8 text-xs" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Notes</Label>
              <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                placeholder="Details..."
                className="w-full h-16 px-3 py-2 text-xs border rounded-md bg-background resize-none focus:outline-none focus:ring-1 focus:ring-ring" />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" size="sm" onClick={() => setShowCreate(false)}>Cancel</Button>
              <Button size="sm" onClick={createLead} disabled={creating}>
                {creating ? 'Creating...' : 'Create'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
