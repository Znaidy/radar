import { useSearchParams } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { Monitor } from './Monitor'
import { Tools } from './Tools'
import type { MonitorStatus } from '@/types'
import { Radio, Search as SearchIcon } from 'lucide-react'

type Mode = 'auto' | 'manual'

interface Props {
  tgStatus: MonitorStatus
  onStatusChange: () => void
}

export function Search({ tgStatus, onStatusChange }: Props) {
  const [params, setParams] = useSearchParams()
  const mode: Mode = params.get('mode') === 'manual' ? 'manual' : 'auto'

  function setMode(m: Mode) {
    const next = new URLSearchParams(params)
    if (m === 'auto') next.delete('mode')
    else next.set('mode', m)
    setParams(next, { replace: true })
  }

  const header = (
    <div className="px-5 py-3.5 border-b bg-white shrink-0 flex items-center justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-base font-bold tracking-tight">Search</h1>
        <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
          {mode === 'auto'
            ? 'Continuous channel monitoring'
            : 'One-off channel parse'}
        </p>
      </div>
      <div className="flex border border-zinc-200 rounded-md overflow-hidden shrink-0">
        <button onClick={() => setMode('auto')}
          className={cn('flex items-center gap-1 px-2 h-7 text-[11px] font-medium uppercase tracking-wide transition-colors',
            mode === 'auto' ? 'bg-zinc-900 text-white' : 'text-zinc-500 hover:text-zinc-900 hover:bg-zinc-50')}>
          <Radio className="h-3 w-3" strokeWidth={1.5} />
          24/7
        </button>
        <button onClick={() => setMode('manual')}
          className={cn('flex items-center gap-1 px-2 h-7 text-[11px] font-medium uppercase tracking-wide border-l border-zinc-200 transition-colors',
            mode === 'manual' ? 'bg-zinc-900 text-white' : 'text-zinc-500 hover:text-zinc-900 hover:bg-zinc-50')}>
          <SearchIcon className="h-3 w-3" strokeWidth={1.5} />
          Manual
        </button>
      </div>
    </div>
  )

  return mode === 'auto'
    ? <Monitor tgStatus={tgStatus} onStatusChange={onStatusChange} headerSlot={header} />
    : <Tools headerSlot={header} />
}
