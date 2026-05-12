import { useState, useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useConfig } from '@/hooks/useConfig'
import { showToast } from '@/components/Toast'
import { api } from '@/api/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { Send, Eye, EyeOff, CheckCircle2, XCircle } from 'lucide-react'

type SectionId = 'api' | 'auth' | 'bot'

export function Settings() {
  const [params, setParams] = useSearchParams()
  const section: SectionId = (params.get('section') as SectionId) || 'api'

  const { config, update, loading } = useConfig()

  const [apiHash, setApiHash]         = useState('')
  const [hashVisible, setHashVisible] = useState(false)
  const apiHashInitialized            = useRef(false)

  const [authStatus, setAuthStatus] = useState<'authorized' | 'unauthorized' | null>(null)
  const [phone, setPhone]           = useState('')
  const [code, setCode]             = useState('')
  const [pass2fa, setPass2fa]       = useState('')
  const [phoneHash, setPhoneHash]   = useState('')
  const [showCode, setShowCode]     = useState(false)
  const [show2fa, setShow2fa]       = useState(false)

  useEffect(() => {
    if (!loading && !apiHashInitialized.current && config.api_hash_set) {
      setApiHash('••••••••••••••••')
      apiHashInitialized.current = true
    }
  }, [loading, config.api_hash_set])

  useEffect(() => {
    api.get<{ authorized: boolean }>('/auth/status').then(r =>
      setAuthStatus(r?.authorized ? 'authorized' : 'unauthorized')
    )
  }, [])

  if (loading) return null

  function setSection(s: SectionId) {
    const next = new URLSearchParams(params)
    if (s === 'api') next.delete('section')
    else next.set('section', s)
    setParams(next, { replace: true })
  }

  async function saveApiKeys() {
    if (!config.api_id) { showToast('Enter API ID'); return }
    const body: Record<string, string> = { api_id: config.api_id }
    if (apiHash && !apiHash.startsWith('••')) body.api_hash = apiHash
    await api.patch('/config', body)
    showToast('API keys saved')
  }

  async function toggleHash() {
    if (apiHash.startsWith('••')) {
      if (!config.api_id) { showToast('Enter API ID first'); return }
      const r = await api.post<{ api_hash: string; detail?: string }>('/config/reveal-hash', { api_id: config.api_id })
      if (r?.api_hash) { setApiHash(r.api_hash); setHashVisible(true) }
      else showToast(r?.detail ?? 'Could not reveal hash')
    } else setHashVisible(!hashVisible)
  }

  async function sendCode() {
    if (!phone) { showToast('Enter phone number'); return }
    const r = await api.post<{ status?: string; phone_hash?: string; detail?: string }>('/auth/send-code', { phone })
    if (!r) { showToast('Error'); return }
    if (r.status === 'already_authorized') { showToast('Already authorized'); setAuthStatus('authorized'); return }
    if (r.phone_hash) { setPhoneHash(r.phone_hash); setShowCode(true); showToast('Code sent') }
    else showToast('Error: ' + (r.detail ?? ''))
  }

  async function verifyCode() {
    const body: Record<string, string> = { phone, code, phone_hash: phoneHash }
    if (pass2fa) body.password = pass2fa
    const resp = await fetch('/api/auth/verify-code', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    })
    const r = await resp.json()
    if (resp.status === 428 && r.detail === '2FA_REQUIRED') { setShow2fa(true); showToast('Enter 2FA password'); return }
    if (r?.status === 'authorized') { showToast('Authorized!'); setAuthStatus('authorized'); setShowCode(false) }
    else showToast('Error: ' + (r?.detail ?? 'invalid code'))
  }

  const SECTIONS: { id: SectionId; label: string; desc: string }[] = [
    { id: 'api',  label: 'Telegram API',  desc: config.api_id ? (config.api_hash_set ? `ID ${config.api_id} · Hash saved` : `ID ${config.api_id}`) : 'Not configured' },
    { id: 'auth', label: 'Authorization', desc: authStatus === 'authorized' ? 'Account connected' : authStatus === 'unauthorized' ? 'Not authorized' : 'Checking…' },
    { id: 'bot',  label: 'Telegram Bot',  desc: config.tg_bot_token ? (config.tg_bot_chat_id ? 'Configured' : 'Token saved') : 'Not configured' },
  ]

  const active = SECTIONS.find(s => s.id === section) ?? SECTIONS[0]

  return (
    <div className="flex h-full">
      {/* LIST COLUMN */}
      <div className="w-[40%] min-w-0 border-r flex flex-col bg-white">
        <div className="px-5 py-3.5 border-b shrink-0">
          <h1 className="text-base font-bold tracking-tight">Settings</h1>
          <p className="text-[11px] text-muted-foreground mt-0.5">Global service parameters</p>
        </div>

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
        <div className="px-6 py-3.5 border-b shrink-0">
          <p className="text-sm font-semibold">{active.label}</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">{active.desc}</p>
        </div>

        <div className="flex-1 overflow-y-auto">
          {section === 'api' && (
            <div className="px-6 py-5 max-w-2xl space-y-4">
              <p className="text-xs text-muted-foreground">
                Get keys from <a href="https://my.telegram.org/apps" target="_blank" rel="noreferrer" className="text-zinc-900 underline underline-offset-2">my.telegram.org/apps</a>
              </p>
              <div className="space-y-1.5">
                <Label className="text-[11px] uppercase tracking-wider text-zinc-400 font-medium">API ID</Label>
                <Input value={config.api_id} placeholder="12345678" onChange={e => update({ api_id: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[11px] uppercase tracking-wider text-zinc-400 font-medium">API Hash</Label>
                <div className="flex gap-2">
                  <Input type={hashVisible ? 'text' : 'password'} value={apiHash} placeholder="abcdef1234567890"
                    onChange={e => setApiHash(e.target.value)} className="flex-1" />
                  <Button variant="outline" size="icon" onClick={toggleHash}>
                    {hashVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
              <Button size="sm" onClick={saveApiKeys}>Save keys</Button>
            </div>
          )}

          {section === 'auth' && (
            <div className="px-6 py-5 max-w-2xl space-y-4">
              <p className="text-xs text-muted-foreground">
                Sign in with your Telegram account. Configure API ID / Hash first.
              </p>
              <div className="flex items-center gap-2">
                {authStatus === 'authorized'
                  ? <><CheckCircle2 className="h-4 w-4 text-zinc-900" /><span className="text-sm text-zinc-900 font-medium">Account authorized</span></>
                  : authStatus === 'unauthorized'
                    ? <><XCircle className="h-4 w-4 text-zinc-400" /><span className="text-sm text-zinc-500 font-medium">Not authorized</span></>
                    : <span className="text-sm text-zinc-400">Checking...</span>
                }
              </div>
              {authStatus === 'unauthorized' && (
                <div className="space-y-3 pt-2">
                  <div className="space-y-1.5">
                    <Label className="text-[11px] uppercase tracking-wider text-zinc-400 font-medium">Phone number</Label>
                    <Input value={phone} placeholder="+380991234567" onChange={e => setPhone(e.target.value)} />
                  </div>
                  <Button variant="outline" size="sm" onClick={sendCode}>Send code</Button>
                  {showCode && (
                    <div className="space-y-3 pt-1">
                      <div className="space-y-1.5">
                        <Label className="text-[11px] uppercase tracking-wider text-zinc-400 font-medium">Telegram code</Label>
                        <Input value={code} placeholder="12345" onChange={e => setCode(e.target.value)} />
                      </div>
                      {show2fa && (
                        <div className="space-y-1.5">
                          <Label className="text-[11px] uppercase tracking-wider text-zinc-400 font-medium">2FA password</Label>
                          <Input type="password" value={pass2fa} onChange={e => setPass2fa(e.target.value)} />
                        </div>
                      )}
                      <Button size="sm" onClick={verifyCode}>Verify</Button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {section === 'bot' && (
            <div className="px-6 py-5 max-w-2xl space-y-4">
              <p className="text-xs text-muted-foreground">
                The bot sends new-lead notifications. Create a bot via @BotFather, paste the token, send /start to your bot, then press “Detect chat”.
              </p>
              <div className="space-y-1.5">
                <Label className="text-[11px] uppercase tracking-wider text-zinc-400 font-medium">Bot token</Label>
                <Input value={config.tg_bot_token} placeholder="123456789:AAF..."
                  onChange={e => update({ tg_bot_token: e.target.value })} />
              </div>
              {config.tg_bot_chat_id && (
                <div className="space-y-1.5">
                  <Label className="text-[11px] uppercase tracking-wider text-zinc-400 font-medium">Chat ID</Label>
                  <Input value={config.tg_bot_chat_id} readOnly className="bg-zinc-50" />
                </div>
              )}
              <div className="flex gap-2 pt-2">
                <Button size="sm" onClick={async () => {
                  await api.patch('/config', { tg_bot_token: config.tg_bot_token })
                  showToast('Saved')
                }}>
                  Save
                </Button>
                <Button variant="outline" size="sm" onClick={async () => {
                  const r = await api.get<{ chat_id: string; detail?: string }>('/config/detect-chat-id')
                  if (r?.chat_id) {
                    await api.patch('/config', { tg_bot_chat_id: r.chat_id })
                    update({ tg_bot_chat_id: r.chat_id })
                    showToast('Chat detected and saved')
                  } else showToast(r?.detail ?? 'No messages — send /start to the bot')
                }}>
                  Detect chat
                </Button>
                <Button variant="outline" size="sm" className="gap-1.5" onClick={async () => {
                  const r = await api.post<{ status: string }>('/config/test-notify')
                  showToast(r?.status === 'sent' ? 'Test message sent' : 'Error — check the token or send /start')
                }}>
                  <Send className="h-3.5 w-3.5" />Test
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
