import { useState } from 'react'
import { api } from '@/api/client'
import { cn } from '@/lib/utils'
import { showToast } from '@/components/Toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { ParsedMessage } from '@/types'
import { Search, Save, Loader2, CheckCircle2, ExternalLink, Send } from 'lucide-react'


function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

interface Props {
  headerSlot?: React.ReactNode
}

export function Tools({ headerSlot }: Props = {}) {
  const [channel, setChannel]     = useState('')
  const [keywords, setKeywords]   = useState('')
  const [limit, setLimit]         = useState('50')
  const [parsing, setParsing]     = useState(false)
  const [messages, setMessages]   = useState<ParsedMessage[]>([])
  const [saved, setSaved]         = useState<Set<number>>(new Set())
  const [savingAll, setSavingAll] = useState(false)
  const [selectedId, setSelectedId] = useState<number | null>(null)

  const selected = selectedId != null ? messages.find(m => m.id === selectedId) ?? null : null

  async function parse() {
    const ch = channel.trim().replace(/^@/, '')
    if (!ch) { showToast('Enter a channel'); return }
    setParsing(true)
    setMessages([])
    setSaved(new Set())
    setSelectedId(null)
    const kws = keywords.split(',').map(s => s.trim()).filter(Boolean)
    const r = await api.post<{ messages: ParsedMessage[]; total: number }>('/tools/parse', {
      channel: ch,
      keywords: kws,
      limit: parseInt(limit) || 50,
    })
    setParsing(false)
    if (r) {
      setMessages(r.messages)
      if (r.messages.length === 0) showToast('No messages found')
    }
  }

  async function saveLead(msg: ParsedMessage) {
    const r = await api.post('/tools/save-lead', {
      id:      msg.id,
      text:    msg.text,
      url:     msg.url,
      date:    msg.date,
      channel: channel.trim().replace(/^@/, ''),
      contact: msg.contact ?? null,
    })
    if (r) {
      setSaved(prev => new Set(prev).add(msg.id))
      showToast('Lead saved')
    }
  }

  async function saveAll() {
    const unsaved = messages.filter(m => !saved.has(m.id))
    if (!unsaved.length) { showToast('All already saved'); return }
    setSavingAll(true)
    const ch = channel.trim().replace(/^@/, '')
    let count = 0
    for (const msg of unsaved) {
      const r = await api.post('/tools/save-lead', {
        id: msg.id, text: msg.text, url: msg.url, date: msg.date, channel: ch, contact: msg.contact ?? null,
      })
      if (r) { setSaved(prev => new Set(prev).add(msg.id)); count++ }
    }
    setSavingAll(false)
    showToast(`Saved ${count} leads`)
  }

  return (
    <div className="flex h-full">
      {/* LIST COLUMN */}
      <div className="flex flex-col min-w-0 w-[40%] border-r">
        {headerSlot}
        <div className="px-5 py-4 border-b bg-white shrink-0 space-y-3">
          <div className="grid grid-cols-3 gap-2.5">
            <div className="space-y-1">
              <Label className="text-[11px] text-muted-foreground">Channel</Label>
              <Input value={channel} onChange={e => setChannel(e.target.value)}
                placeholder="@channel" className="h-8 text-xs"
                onKeyDown={e => e.key === 'Enter' && parse()} />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px] text-muted-foreground">Keywords</Label>
              <Input value={keywords} onChange={e => setKeywords(e.target.value)}
                placeholder="looking for, hire" className="h-8 text-xs" />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px] text-muted-foreground">Limit</Label>
              <Input value={limit} onChange={e => setLimit(e.target.value)}
                type="number" min={1} max={500} className="h-8 text-xs" />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={parse} disabled={parsing} className="gap-1.5 h-8">
              {parsing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
              {parsing ? 'Parsing...' : 'Parse'}
            </Button>
            {messages.length > 0 && (
              <Button variant="outline" size="sm" onClick={saveAll} disabled={savingAll} className="gap-1.5 h-8">
                {savingAll ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                Save all ({messages.filter(m => !saved.has(m.id)).length})
              </Button>
            )}
            {messages.length > 0 && (
              <span className="text-xs text-muted-foreground ml-auto">
                {messages.length} · {saved.size} saved
              </span>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-auto bg-zinc-50">
          {messages.length === 0 ? (
            <div className="p-10 text-center text-sm text-muted-foreground">
              {parsing ? 'Parsing...' : 'Enter a channel and press Parse'}
            </div>
          ) : (
            <ul className="divide-y bg-white">
              {messages.map(msg => (
                <li key={msg.id} onClick={() => setSelectedId(msg.id)}
                  className={cn('px-5 py-3.5 cursor-pointer transition-colors border-l-2',
                    selectedId === msg.id ? 'bg-zinc-50 border-l-zinc-900' : 'border-l-transparent hover:bg-zinc-50/60')}>
                  <p className="text-xs leading-4 line-clamp-2 text-zinc-900">{msg.text}</p>
                  <div className="flex items-center gap-3 mt-2 text-[11px] text-zinc-500">
                    {msg.sender_username && <span className="text-zinc-700 font-medium truncate">{msg.sender_username}</span>}
                    {msg.contact && !msg.sender_username && <span className="truncate">{msg.contact}</span>}
                    <span className="ml-auto shrink-0 tabular-nums text-zinc-400">{formatDate(msg.date)}</span>
                    {saved.has(msg.id) && <CheckCircle2 className="h-3 w-3 text-zinc-900 shrink-0" />}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* DETAIL COLUMN */}
      {selected && (
        <div className="flex-1 min-w-0 flex flex-col bg-white">
          <div className="px-6 py-3.5 border-b shrink-0 flex items-center justify-between gap-2">
            <p className="text-sm font-semibold">Message</p>
            <a href={selected.url} target="_blank" rel="noreferrer"
              className="h-8 w-8 flex items-center justify-center text-zinc-400 hover:text-zinc-900 transition-colors rounded-md hover:bg-zinc-50">
              <ExternalLink className="h-4 w-4" />
            </a>
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
            <div className="bg-zinc-50 rounded-lg p-4 text-sm leading-6 text-zinc-700 border whitespace-pre-wrap break-words">
              {selected.text}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-[10px] uppercase tracking-wider text-zinc-400 mb-1.5">Sender</p>
                {selected.sender_username ? (
                  <a href={`https://t.me/${selected.sender_username.replace('@','')}`} target="_blank" rel="noreferrer"
                    className="text-xs text-zinc-900 font-medium hover:underline block">
                    {selected.sender_username}
                  </a>
                ) : (
                  <p className="text-xs text-zinc-400">—</p>
                )}
                {selected.sender_name && <p className="text-[11px] text-zinc-500 mt-0.5">{selected.sender_name}</p>}
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-zinc-400 mb-1.5">Date</p>
                <p className="text-xs tabular-nums text-zinc-900">{formatDate(selected.date)}</p>
              </div>
            </div>

            {(selected.mentions?.length || selected.phones?.length) && (
              <div>
                <p className="text-[10px] uppercase tracking-wider text-zinc-400 mb-2">Contacts</p>
                <div className="space-y-1">
                  {selected.mentions?.map(m => (
                    <a key={m} href={`https://t.me/${m.replace('@','')}`} target="_blank" rel="noreferrer"
                      className="text-xs text-zinc-900 hover:underline block">{m}</a>
                  ))}
                  {selected.phones?.map(p => (
                    <span key={p} className="text-xs text-zinc-500 block">{p}</span>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="px-6 py-3.5 border-t flex items-center justify-end gap-2 shrink-0">
            {selected.contact && (
              <a href={`https://t.me/${selected.contact.replace('@','')}`} target="_blank" rel="noreferrer">
                <Button variant="outline" size="sm" className="gap-1.5">
                  <Send className="h-3.5 w-3.5" />Message
                </Button>
              </a>
            )}
            {saved.has(selected.id) ? (
              <Button size="sm" disabled className="gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5" />Saved
              </Button>
            ) : (
              <Button size="sm" onClick={() => saveLead(selected)} className="gap-1.5">
                <Save className="h-3.5 w-3.5" />Save as lead
              </Button>
            )}
          </div>
        </div>
      )}

      {!selected && (
        <div className="flex-1 flex items-center justify-center bg-zinc-50 text-xs text-muted-foreground">
          {messages.length > 0 ? 'Select a message from the list' : 'Enter a channel and press Parse'}
        </div>
      )}
    </div>
  )
}
