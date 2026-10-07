'use client';

import type { InputHTMLAttributes, ReactNode } from 'react';
import { api } from '@/lib/client/api';
import { refresh } from '@/lib/client/chat-actions';
import { cn } from '@/lib/client/cn';
import { keys } from '@/hooks/use-chat-data';
import { useUi } from '@/hooks/use-ui';
import { IconButton } from '@/components/ui/modal';
import { CloseIcon, SearchIcon } from '@/components/ui/icons';

/** Text input of the design's dialogs (38px, 14px). */
export const INPUT = 'h-[38px] rounded-md border border-line3 bg-transparent px-3 text-sm text-txt outline-none';

export const EMAIL_RE = /.+@.+\..+/;

export const closeModal = () => useUi.getState().set({ modal: null });

/** Label stacked above its control (13px bold). */
export function Field({ label, className, children }: { label: ReactNode; className?: string; children: ReactNode }) {
  return (
    <label className={cn('flex flex-col gap-1.5 text-[13px] font-bold', className)}>
      {label}
      {children}
    </label>
  );
}

/** Bordered search box with the magnifier icon. */
export function SearchField(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="flex h-[38px] items-center gap-2 rounded-md border border-line3 px-3">
      <SearchIcon size={14} className="flex-none text-mute" />
      <input className="min-w-0 flex-1 border-0 bg-transparent text-sm text-txt outline-none" {...props} />
    </div>
  );
}

/** Title (+ optional sub) and close button, for dialogs whose header spacing differs from ModalHeader. */
export function DialogTitle({ title, sub, onClose, className }: { title: ReactNode; sub?: ReactNode; onClose: () => void; className?: string }) {
  return (
    <div className={cn('flex justify-between gap-3 px-5 pt-5 pb-3', sub != null ? 'items-start' : 'items-center', className)}>
      <div className="min-w-0">
        <div className="truncate text-lg font-black">{title}</div>
        {sub != null && <div className="mt-1 text-[13px] text-mute">{sub}</div>}
      </div>
      <IconButton onClick={onClose} title="Close" size={30}><CloseIcon size={16} className="text-txt2" /></IconButton>
    </div>
  );
}

/** Finds or opens the DM with one person, refreshes the sidebar and returns the conversation id. */
export async function openDm(workspaceId: string, userId: string) {
  const conv = await api<{ id: string }>('POST', `/api/workspaces/${workspaceId}/dms`, { user_ids: [userId] });
  await refresh(keys.sidebar(workspaceId));
  return conv.id;
}

/** "Europe/Paris" → "Paris". */
export const tzCity = (tz: string | null | undefined) => (tz?.includes('/') ? tz.split('/').pop()!.replace(/_/g, ' ') : '—');
