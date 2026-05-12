import { useState, useEffect, useCallback, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useConfig } from '@/hooks/useConfig'
import { showToast } from '@/components/Toast'
import { TagList } from '@/components/TagList'
import { api } from '@/api/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'
import { RefreshCw, Play, Square } from 'lucide-react'
import type { MonitorStatus } from '@/types'

function colorLine(line: string) {
  if (line.includes('[OK]') || line.includes('Sent')) return 'text-zinc-100'
  if (line.includes('[ERROR]')) return 'text-zinc-100 underline decoration-zinc-500'
  if (line.includes('[WARNING]') || line.includes('RESET')) return 'text-zinc-200'
  if (line.includes('[SKIP]')) return 'text-zinc-600'
  if (line.includes('[START]') || line.includes('[DAILY RESET]')) return 'text-zinc-300 font-medium'
  return 'text-zinc-500'
}

type SectionId = 'channels' | 'filters' | 'behavior' | 'logs'

interface Props {
  tgStatus: MonitorStatus
  onStatusChange: () => void
  headerSlot?: React.ReactNode
}

export function Monitor({ tgStatus, onStatusChange, headerSlot }: Props) {
  const [params, setParams] = useSearchParams()
  const section: SectionId = (params.get('section') as SectionId) || 'channels'

  const [toggling, setToggling] = useState(false)
  const { config, update, loading } = useConfig()

  function setSection(s: SectionId) {
    const next = new URLSearchParams(params)
    if (s === 'channels') next.delete('section')
    else next.set('section', s)
    setParams(next, { replace: true })
  }

  async function toggle() {
    setToggling(true)
    const running = tgStatus.running
    const r = await api.post<{ status: string; detail?: string }>(`/tg/${running ? 'stop' : 'start'}`)
    if (r?.status === (running ? 'stopped' : 'started')) {
      showToast(`Telegram ${running ? 'stopped' : 'started'}`)
      onStatusChange()
    } else showToast(r?.detail ?? 'Error')
    setToggling(false)
  }

  async function save() {
    await update({
      channels: config.channels, keywords: config.keywords, exclude: config.exclude,
      parse_history: config.parse_history, history_limit: config.history_limit,
      tg_autostart: config.tg_autostart,
    })
    showToast('Saved')
  }

  if (loading) return null

  const SECTIONS: { id: SectionId; label: string; desc: string }[] = [
    { id: 'channels', label: 'Channels', desc: `${config.channels.length} channels` },
    { id: 'filters',  label: 'Filters',  desc: `${config.keywords.length} keywords · ${config.exclude.length} excludes` },
    { id: 'behavior', label: 'Behavior', desc: config.tg_autostart ? 'Autostart on' : 'Autostart off' },
    { id: 'logs',     label: 'Logs',     desc: tgStatus.running ? `Live · ${tgStatus.found_today} today` : 'Stopped' },
  ]

  const activeSection = SECTIONS.find(s => s.id === section) ?? SECTIONS[0]

  return (
    <div className="flex h-full">
      {/* LIST COLUMN */}
      <div className="w-[40%] min-w-0 border-r flex flex-col bg-white">
        {headerSlot}
        <ul className="divide-y bg-white flex-1 overflow-auto">
          {SECTIONS.map(s => (
            <li key={s.id} onClick={() => setSection(s.id)}
              className={cn('px-5 py-3.5 cursor-pointer transition-colors border-l-2',
                section === s.id ? 'bg-zinc-50 border-l-zinc-900' : 'border-l-transparent hover:bg-zinc-50/60')}>
              <p className="text-xs font-semibold text-zinc-900">{s.label}</p>
              <p className="text-[11px] text-zinc-500 mt-0.5">{s.desc}</p>
            </li>
          ))}
        </ul>
      </div>

      {/* DETAIL COLUMN */}
      <div className="flex-1 min-w-0 flex flex-col bg-white">
        <div className="px-6 py-3.5 border-b shrink-0 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold">{activeSection.label}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{activeSection.desc}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <div className="flex items-center gap-1.5 text-[11px] mr-1">
              <span className={cn('h-1.5 w-1.5 rounded-full', tgStatus.running ? 'bg-zinc-900 animate-pulse' : 'bg-zinc-300')} />
              <span className={cn(tgStatus.running ? 'text-zinc-900 font-medium' : 'text-zinc-500')}>
                {tgStatus.running ? `Running · ${tgStatus.found_today}` : 'Stopped'}
              </span>
            </div>
            <Button variant="outline" size="sm" className="h-8" onClick={save}>Save</Button>
            <Button variant={tgStatus.running ? 'outline' : 'default'} size="sm" className="h-8 gap-1.5"
              disabled={toggling} onClick={toggle}>
              {tgStatus.running ? <><Square className="h-3 w-3" />Stop</> : <><Play className="h-3 w-3" />Start</>}
            </Button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {section === 'channels' && (
            <div className="px-6 py-5 max-w-2xl space-y-3">
              <Label className="text-[11px] uppercase tracking-wider text-zinc-400">Channel usernames (no @)</Label>
              <TagList items={config.channels} onChange={channels => update({ channels })} placeholder="jobsqa" />
            </div>
          )}

          {section === 'filters' && (
            <div className="px-6 py-5 max-w-2xl space-y-5">
              <div className="space-y-2">
                <Label className="text-[11px] uppercase tracking-wider text-zinc-400">Include</Label>
                <TagList items={config.keywords} onChange={keywords => update({ keywords })} placeholder="qa, junior..." />
              </div>
              <div className="space-y-2">
                <Label className="text-[11px] uppercase tracking-wider text-zinc-400">Exclude</Label>
                <TagList items={config.exclude} onChange={exclude => update({ exclude })} placeholder="senior, lead..." destructive />
              </div>
              {config.keywords.length === 0 && (
                <p className="text-xs text-zinc-700 bg-zinc-50 border border-zinc-200 rounded-md px-3 py-2">
                  Without keywords every message gets collected
                </p>
              )}
            </div>
          )}

          {section === 'behavior' && (
            <div className="px-6 py-5 max-w-2xl space-y-4">
              <SwitchRow label="Parse history" desc="Read channel messages on startup"
                checked={config.parse_history} onChange={v => update({ parse_history: v })} />
              <Separator />
              <SwitchRow label="Autostart" desc="Start automatically when server boots"
                checked={config.tg_autostart} onChange={v => update({ tg_autostart: v })} />
              <Separator />
              <NumRow label="History limit" desc="Number of messages to parse"
                value={config.history_limit} onChange={v => update({ history_limit: v })} />
            </div>
          )}

          {section === 'logs' && (
            <LogConsole logPath="/tg/logs?lines=500" running={tgStatus.running} />
          )}
        </div>
      </div>
    </div>
  )
}

function LogConsole({ logPath, running }: { logPath: string; running: boolean }) {
  const [lines, setLines] = useState<{ cls: string; text: string }[]>([])
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  const refresh = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    const r = await api.get<{ log: string }>(logPath)
    if (!silent) setLoading(false)
    if (!r?.log) { setLines([{ cls: 'text-zinc-500', text: '// Log is empty' }]); return }
    setLines(r.log.trim().split('\n').filter(Boolean).map(line => ({ cls: colorLine(line), text: line })))
  }, [logPath])

  useEffect(() => { refresh() }, [refresh])

  useEffect(() => {
    if (!running) return
    const id = setInterval(() => refresh(true), 3000)
    return () => clearInterval(id)
  }, [running, refresh])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [lines])

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-6 py-2.5 border-b shrink-0">
        <div className="flex items-center gap-2">
          {running && (
            <span className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-zinc-700 font-medium">
              <span className="h-1.5 w-1.5 rounded-full bg-zinc-900 animate-pulse" />
              live
            </span>
          )}
        </div>
        <Button variant="outline" size="sm" className="h-7 gap-1.5" onClick={() => refresh()} disabled={loading}>
          <RefreshCw className={cn('h-3 w-3', loading && 'animate-spin')} />Refresh
        </Button>
      </div>
      <div className="flex-1 bg-zinc-950 overflow-hidden">
        <ScrollArea className="h-full">
          <div className="p-4 font-mono text-xs leading-5 space-y-0.5">
            {lines.map((l, i) => <div key={i} className={l.cls}>{l.text}</div>)}
            <div ref={bottomRef} />
          </div>
        </ScrollArea>
      </div>
    </div>
  )
}

function SwitchRow({ label, desc, checked, onChange }: { label: string; desc?: string; checked: boolean; onChange: (v: boolean) => void }) {
  const id = label.replace(/\s/g, '-').toLowerCase()
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <Label htmlFor={id} className="font-medium text-sm">{label}</Label>
        {desc && <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>}
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </div>
  )
}

function NumRow({ label, desc, value, onChange }: { label: string; desc?: string; value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <Label className="font-medium text-sm">{label}</Label>
        {desc && <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>}
      </div>
      <Input type="number" value={value} onChange={e => onChange(parseInt(e.target.value) || 0)} className="w-24 text-right" />
    </div>
  )
}
