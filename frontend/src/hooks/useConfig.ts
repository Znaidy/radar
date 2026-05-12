import { useState, useEffect, useCallback } from 'react';
import { api } from '../api/client';
import type { Config } from '../types';

const DEFAULTS: Config = {
  channels: [], keywords: [], exclude: [], parse_history: false, history_limit: 50,
  api_id: '', api_hash_set: false, tg_autostart: false,
  tg_bot_token: '', tg_bot_chat_id: '',
};

export function useConfig() {
  const [config, setConfig] = useState<Config>(DEFAULTS);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    const cfg = await api.get<Config>('/config');
    if (cfg) setConfig({ ...DEFAULTS, ...cfg });
    setLoading(false);
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const update = useCallback(async (patch: Partial<Config>) => {
    setConfig(prev => ({ ...prev, ...patch }));
    await api.patch('/config', patch);
  }, []);

  return { config, setConfig, update, loading, reload };
}
