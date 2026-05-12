export interface Config {
  channels: string[];
  keywords: string[];
  exclude: string[];
  parse_history: boolean;
  history_limit: number;
  api_id: string;
  api_hash_set: boolean;
  tg_autostart: boolean;
  tg_bot_token: string;
  tg_bot_chat_id: string;
}

export interface MonitorStatus {
  running: boolean;
  found_today: number;
}

export type LeadStatus = 'new' | 'contacted' | 'negotiating' | 'won' | 'lost'

export interface Lead {
  id: number
  source: string
  title: string
  channel?: string
  contact?: string
  notes?: string
  url?: string
  status: LeadStatus
  found_at: string
  updated_at: string
}

export type CampaignStatus = 'draft' | 'running' | 'completed' | 'error' | 'scheduled'

export interface Campaign {
  id: number
  name: string
  message: string
  status: CampaignStatus
  sent_count: number
  scheduled_at?: string
  created_at: string
  updated_at: string
}

export interface ParsedMessage {
  id: number
  text: string
  url: string
  date: string
  sender_username?: string
  sender_name?: string
  sender_id?: number
  contact?: string
  mentions?: string[]
  phones?: string[]
}
