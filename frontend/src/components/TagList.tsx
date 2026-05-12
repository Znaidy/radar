import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { X } from 'lucide-react'

interface Props {
  items: string[]
  onChange: (items: string[]) => void
  placeholder?: string
  destructive?: boolean
  inputId?: string
}

export function TagList({ items, onChange, placeholder = 'Add...', destructive = false, inputId }: Props) {
  const [val, setVal] = useState('')

  function add() {
    const v = val.trim()
    if (!v || items.includes(v)) return
    onChange([...items, v])
    setVal('')
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {items.map((item, i) => (
          <Badge key={i} variant="outline"
            className={`gap-1 pr-1 font-normal ${destructive ? 'line-through text-zinc-400' : 'text-zinc-900'}`}>
            {item}
            <button onClick={() => onChange(items.filter((_, j) => j !== i))} className="ml-1 rounded-full hover:bg-zinc-100 no-underline">
              <X className="h-3 w-3" />
            </button>
          </Badge>
        ))}
      </div>
      <div className="flex gap-2">
        <Input id={inputId} value={val} placeholder={placeholder}
          onChange={e => setVal(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && add()} />
        <Button variant="outline" onClick={add}>+</Button>
      </div>
    </div>
  )
}
