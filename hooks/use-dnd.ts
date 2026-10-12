'use client';

import { mutate } from 'swr';
import { api } from '@/lib/client/api';
import type { Preferences } from '@/lib/client/types';
import { keys, usePrefs } from './use-chat-data';
import { useUi } from './use-ui';

/** Do not disturb, stored in the workspace preferences. */
export function useDnd() {
  const { data } = usePrefs();
  const dnd = !!data?.dnd_enabled;
  const toggle = async () => {
    const ws = useUi.getState().workspaceId;
    if (!ws) return;
    const key = keys.prefs(ws);
    await mutate(key, (p?: Preferences) => p && { ...p, dnd_enabled: !dnd }, { revalidate: false });
    await api('PUT', key, { dnd_enabled: !dnd }).finally(() => mutate(key));
  };
  return { dnd, toggle };
}
