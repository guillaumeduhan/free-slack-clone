'use client';

import { useEffect, useState } from 'react';
import { mutate } from 'swr';
import { api } from '@/lib/client/api';
import { uploadFile } from '@/lib/client/chat-actions';
import { cn } from '@/lib/client/cn';
import { initials, isOnline } from '@/lib/client/format';
import type { Preferences, Role, Workspace } from '@/lib/client/types';
import { keys, useInvitations, useMe, useMembers, usePrefs, useWorkspace } from '@/hooks/use-chat-data';
import { useUi, type SettingsTab } from '@/hooks/use-ui';
import { useViewport } from '@/hooks/use-viewport';
import { IconButton } from '@/components/ui/modal';
import { Avatar, presenceDot } from '@/components/ui/avatar';
import { Switch } from '@/components/ui/switch';
import { CloseIcon, SearchIcon } from '@/components/ui/icons';
import { EMAIL_RE } from './dialog-parts';

const TABS: [Exclude<SettingsTab, null>, string][] = [['general', 'General'], ['members', 'Members'], ['notifications', 'Notifications']];
const FIELD_LABEL = 'flex flex-col gap-1.5 text-[13px] font-bold text-txt2';
const FIELD_INPUT = 'h-[38px] rounded-md border border-line3 bg-bg px-3 text-sm font-normal text-txt outline-none';
const errorText = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong');
const close = () => useUi.getState().set({ settings: null });

/** Square workspace tile: logo image, or initials on --txt. */
function Logo({ ws, name, size, radius, fontSize }: { ws: Workspace | undefined; name: string; size: number; radius: number; fontSize: number }) {
  const logo = ws?.logo_url;
  return (
    <div
      className="flex flex-none items-center justify-center bg-txt bg-cover bg-center font-black text-bg"
      style={{ width: size, height: size, borderRadius: radius, fontSize, backgroundImage: logo ? `url(${logo})` : 'none' }}
    >
      {logo ? '' : initials(name || '?')}
    </div>
  );
}

export function SettingsDialog() {
  const tab = useUi((s) => s.settings);
  const { mobile } = useViewport();
  const { data: ws } = useWorkspace();

  useEffect(() => {
    if (!tab) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [tab]);

  if (!tab) return null;
  const title = TABS.find(([k]) => k === tab)?.[1] ?? '';

  return (
    <div onClick={close} className="fixed inset-0 z-[55] flex items-center justify-center bg-black/60" style={{ padding: mobile ? 0 : 24 }}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex h-[min(600px,100%)] w-[min(820px,100%)] overflow-hidden rounded-xl border border-line bg-bg shadow-[0_24px_60px_rgba(0,0,0,.55)]"
        style={{ flexDirection: mobile ? 'column' : 'row' }}
      >
        <nav
          className="flex flex-none gap-0.5 overflow-x-auto bg-rail"
          style={{
            width: mobile ? 'auto' : 210, flexDirection: mobile ? 'row' : 'column', padding: mobile ? 8 : '20px 12px',
            borderRight: mobile ? 0 : '1px solid var(--line)', borderBottom: mobile ? '1px solid var(--line)' : 0,
          }}
        >
          {!mobile && (
            <div className="flex items-center gap-2.5 px-2 pb-[18px]">
              <Logo ws={ws} name={ws?.name ?? ''} size={32} radius={8} fontSize={13} />
              <div className="min-w-0">
                <div className="truncate text-[15px] font-black">{ws?.name}</div>
                <div className="text-xs text-mute">Settings</div>
              </div>
            </div>
          )}
          {TABS.map(([k, label]) => (
            <div
              key={k}
              onClick={() => useUi.getState().set({ settings: k })}
              className={cn('flex h-9 flex-none cursor-pointer items-center rounded-md px-2.5 text-[15px] font-bold hover:text-txt', tab === k ? 'bg-line text-txt' : 'text-mute')}
            >
              {label}
            </div>
          ))}
        </nav>
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex h-[60px] flex-none items-center justify-between border-b border-line pr-4 pl-7">
            <span className="text-xl font-black">{title}</span>
            <IconButton onClick={close} title="Close" size={32}><CloseIcon size={18} className="text-txt2" /></IconButton>
          </div>
          <div className="flex-1 overflow-y-auto" style={{ padding: mobile ? 16 : '24px 28px 28px' }}>
            {tab === 'general' && ws && <General key={ws.id} ws={ws} />}
            {tab === 'members' && ws && <MembersTab ws={ws} />}
            {tab === 'notifications' && <Notifications />}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- General */

function General({ ws }: { ws: Workspace }) {
  const isAdmin = ws.role === 'owner' || ws.role === 'admin';
  const isOwner = ws.role === 'owner';
  const [name, setName] = useState(ws.name);
  const [slug, setSlug] = useState(ws.slug);
  const [desc, setDesc] = useState(ws.description ?? '');
  const [drag, setDrag] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dirty = name !== ws.name || slug !== ws.slug || desc !== (ws.description ?? '');
  const canSave = isAdmin && dirty && !!name.trim();
  const edit = (fn: () => void) => { fn(); setSaved(false); setError(null); };

  const patch = async (body: Partial<Workspace>) => {
    await api('PATCH', `/api/workspaces/${ws.id}`, body);
    await Promise.all([mutate(keys.workspace(ws.id)), mutate(keys.workspaces), mutate(keys.me)]);
  };

  const setLogo = async (file: File | undefined) => {
    setDrag(false);
    if (!isAdmin || !file || !/^image\//.test(file.type)) return;
    setError(null);
    try {
      const f = await uploadFile(ws.id, file);
      await patch({ logo_url: `${location.origin}${f.url}` });
    } catch (e) {
      setError(errorText(e));
    }
  };
  const removeLogo = () => patch({ logo_url: null }).catch((e) => setError(errorText(e)));

  const save = async () => {
    if (!canSave) return;
    try {
      await patch({ name: name.trim(), slug, description: desc.trim() || null });
      setSaved(true);
    } catch (e) {
      setError(errorText(e));
    }
  };

  const remove = async () => {
    if (!isOwner || !window.confirm(`Delete ${ws.name}? This permanently removes all channels, messages and files.`)) return;
    try {
      await api('DELETE', `/api/workspaces/${ws.id}`);
      await mutate(keys.workspaces);
      useUi.getState().set({ workspaceId: null, conversationId: null, settings: null });
    } catch (e) {
      setError(errorText(e));
    }
  };

  return (
    <div className="flex max-w-[520px] flex-col gap-5">
      <div
        onDragOver={(e) => { e.preventDefault(); if (!drag) setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setLogo(e.dataTransfer.files?.[0]); }}
        className="flex items-center gap-4 rounded-xl border-2 border-dashed p-3.5 transition-[background,border-color] duration-150"
        style={{ borderColor: drag ? '#7c3aed' : 'var(--line3)', background: drag ? 'rgba(124,58,237,.10)' : 'transparent' }}
      >
        <Logo ws={ws} name={name || ws.name} size={64} radius={14} fontSize={24} />
        <div className="min-w-0 flex-1">
          <div className="font-bold">Workspace logo</div>
          <div className="mt-0.5 text-[13px] text-mute">
            Drag &amp; drop an image here, or{' '}
            <label className="cursor-pointer font-bold text-[#a78bfa] underline underline-offset-[3px]">
              browse
              <input type="file" accept="image/*" disabled={!isAdmin} className="hidden" onChange={(e) => { setLogo(e.target.files?.[0]); e.target.value = ''; }} />
            </label>
            . Square PNG or SVG, at least 256px.
          </div>
        </div>
        {ws.logo_url && isAdmin && (
          <button onClick={removeLogo} className="h-8 flex-none cursor-pointer rounded-md border border-line3 bg-transparent px-3 text-[13px] font-bold text-txt outline-none hover:bg-hover">
            Remove
          </button>
        )}
      </div>
      <label className={FIELD_LABEL}>
        Workspace name
        <input value={name} readOnly={!isAdmin} onChange={(e) => edit(() => setName(e.target.value))} className={FIELD_INPUT} />
      </label>
      <label className={FIELD_LABEL}>
        Workspace URL
        <div className="flex h-[38px] items-center overflow-hidden rounded-md border border-line3 bg-bg">
          <input
            value={slug}
            readOnly={!isAdmin}
            onChange={(e) => edit(() => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '')))}
            className="h-full min-w-0 flex-1 border-0 bg-transparent px-3 text-sm font-normal text-txt outline-none"
          />
          <span className="flex h-full items-center border-l border-line3 bg-hover px-3 text-sm font-normal text-mute">.{typeof window === 'undefined' ? '' : window.location.hostname}</span>
        </div>
      </label>
      <label className={FIELD_LABEL}>
        Description
        <textarea
          value={desc}
          readOnly={!isAdmin}
          onChange={(e) => edit(() => setDesc(e.target.value))}
          rows={3}
          placeholder="What is this workspace for?"
          className="resize-y rounded-md border border-line3 bg-bg px-3 py-2.5 text-sm leading-[1.5] font-normal text-txt outline-none"
        />
      </label>
      <div className="flex items-center gap-3">
        <button
          onClick={save}
          className="h-9 cursor-pointer rounded-md border-0 px-4 text-[13px] font-bold text-white outline-none"
          style={{ background: canSave ? '#7c3aed' : 'var(--line3)' }}
        >
          Save changes
        </button>
        {saved && <span className="text-[13px] font-bold text-[#4cc38a]">Saved</span>}
        {error && <span className="text-[13px] text-[#ff6369]">{error}</span>}
      </div>
      <div className="mt-3 flex items-center justify-between gap-4 rounded-lg border border-[rgba(229,72,77,.4)] p-4">
        <div>
          <div className="font-bold">Delete workspace</div>
          <div className="mt-0.5 text-[13px] text-mute">Permanently removes all channels, messages and files.</div>
        </div>
        <button
          onClick={remove}
          disabled={!isOwner}
          className="h-[34px] flex-none cursor-pointer rounded-md border border-[#e5484d] bg-transparent px-3.5 text-[13px] font-bold text-[#ff6369] outline-none hover:bg-[rgba(229,72,77,.12)] disabled:cursor-default disabled:opacity-50 disabled:hover:bg-transparent"
        >
          Delete
        </button>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- Members */

const ROLE_LABEL: Record<Role, string> = { owner: 'Owner', admin: 'Admin', member: 'Member' };

function MembersTab({ ws }: { ws: Workspace }) {
  const isAdmin = ws.role === 'owner' || ws.role === 'admin';
  const { data: me } = useMe();
  const { data } = useMembers();
  const { data: invites, mutate: reloadInvites } = useInvitations(isAdmin);
  const [email, setEmail] = useState('');
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);

  const run = async (fn: () => Promise<unknown>) => {
    setError(null);
    try { await fn(); } catch (e) { setError(errorText(e)); }
  };
  const sendInvite = () => run(async () => {
    const em = email.trim();
    if (!EMAIL_RE.test(em)) return;
    await api('POST', `/api/workspaces/${ws.id}/invitations`, { email: em });
    setEmail('');
    await reloadInvites();
  });
  const revoke = (id: string) => run(async () => {
    await api('DELETE', `/api/invitations/${id}`);
    await reloadInvites();
  });
  const setRole = (userId: string, name: string, role: Role) => run(async () => {
    if (role === 'owner') {
      if (!window.confirm(`Transfer workspace ownership to ${name}? There can only be one owner; the current owner becomes an Admin.`)) return;
      await api('POST', `/api/workspaces/${ws.id}/transfer-ownership`, { user_id: userId });
    } else {
      await api('PATCH', `/api/workspaces/${ws.id}/members/${userId}`, { role });
    }
    await Promise.all([mutate(keys.members(ws.id)), mutate(keys.workspace(ws.id)), mutate(keys.workspaces)]);
  });
  const profile = (userId: string) => {
    close();
    useUi.getState().openProfile(userId);
  };

  const members = data?.members ?? [];
  const counts = data?.counts ?? {};
  const [o, a, m] = [counts.owner ?? 0, counts.admin ?? 0, counts.member ?? 0];
  const q = query.trim().toLowerCase();
  const pending = invites ?? [];

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-lg border border-line bg-hover p-4">
        <div className="mb-2.5 font-bold">Invite people</div>
        <div className="flex gap-2">
          <input
            value={email}
            onChange={(e) => { setEmail(e.target.value); setError(null); }}
            onKeyDown={(e) => e.key === 'Enter' && sendInvite()}
            placeholder="name@company.com"
            className="h-[38px] min-w-0 flex-1 rounded-md border border-line3 bg-bg px-3 text-sm text-txt outline-none"
          />
          <button
            onClick={sendInvite}
            className="h-[38px] flex-none cursor-pointer rounded-md border-0 px-4 text-[13px] font-bold whitespace-nowrap text-white outline-none"
            style={{ background: EMAIL_RE.test(email) ? '#7c3aed' : 'var(--line3)' }}
          >
            Send invite
          </button>
        </div>
        {error && <div className="mt-2 text-[13px] text-[#ff6369]">{error}</div>}
        {pending.length > 0 && (
          <div className="mt-3 flex flex-col gap-1.5">
            {pending.map((iv) => (
              <div key={iv.id} className="flex items-center gap-2.5 text-sm">
                <span className="rounded-full border border-[rgba(245,165,36,.5)] px-2 py-px text-[11px] font-bold text-[#f5a524]">Pending</span>
                <span className="min-w-0 flex-1 truncate">{iv.email}</span>
                <span onClick={() => revoke(iv.id)} className="cursor-pointer text-[13px] text-mute hover:text-[#ff6369]">Revoke</span>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="flex items-center justify-between gap-3">
        <span className="flex flex-col gap-0.5">
          <span className="font-bold">{members.length} members</span>
          <span className="text-xs text-mute">{`${o} owner · ${a} ${a === 1 ? 'admin' : 'admins'} · ${m} members`}</span>
        </span>
        <div className="flex h-[34px] w-[220px] items-center gap-2 rounded-md border border-line3 px-2.5">
          <SearchIcon size={14} className="flex-none text-mute" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search members" className="min-w-0 flex-1 border-0 bg-transparent text-[13px] text-txt outline-none" />
        </div>
      </div>
      <div className="overflow-hidden rounded-lg border border-line">
        {members
          .filter((mb) => !q || mb.user.display_name.toLowerCase().includes(q))
          .map(({ user: u, role }) => (
            <div key={u.id} className="flex items-center gap-3 border-b border-hover px-3.5 py-2.5">
              <Avatar id={u.id} name={u.display_name} size={34} fontSize={12} dot={presenceDot(isOnline(u))} onClick={() => profile(u.id)} />
              <div className="min-w-0 flex-1">
                <div className="font-bold">{u.display_name}{u.id === me?.id && ' (you)'}</div>
                <div className="truncate text-xs text-mute">{[u.title, u.email].filter(Boolean).join(' · ')}</div>
              </div>
              {role === 'owner' ? (
                <span className="rounded-full border border-[rgba(124,58,237,.45)] bg-[rgba(124,58,237,.16)] px-2.5 py-[3px] text-xs font-bold text-accent-text">Owner</span>
              ) : (
                <select
                  value={role}
                  disabled={!isAdmin}
                  onChange={(e) => setRole(u.id, u.display_name, e.target.value as Role)}
                  className="h-8 cursor-pointer rounded-md border border-line3 bg-hover px-2 text-[13px] text-txt outline-none disabled:cursor-default"
                >
                  {(['owner', 'admin', 'member'] as Role[]).map((r) => (
                    <option key={r} value={r}>{r === 'owner' ? 'Owner (transfer)' : ROLE_LABEL[r]}</option>
                  ))}
                </select>
              )}
            </div>
          ))}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- Notifications */

type Toggle = 'desktop_enabled' | 'sound_enabled' | 'email_digest' | 'dnd_enabled';

const MODES: [Preferences['notify_level'], string][] = [
  ['all', 'All new messages'],
  ['mentions', 'Direct messages, mentions & keywords'],
  ['none', 'Nothing'],
];
const TOGGLES: [Toggle, string, string][] = [
  ['desktop_enabled', 'Desktop notifications', 'Show a banner when a new message arrives'],
  ['sound_enabled', 'Notification sound', 'Play a sound for new notifications'],
  ['email_digest', 'Email digest', 'Daily summary of unread activity'],
  ['dnd_enabled', 'Do not disturb', 'Pause notifications from 7:00 PM to 8:00 AM'],
];

function Notifications() {
  const ws = useUi((s) => s.workspaceId)!;
  const { data: prefs, mutate: setPrefs } = usePrefs();

  const update = (patch: Partial<Preferences>) => {
    if (!prefs) return;
    setPrefs(api<Preferences>('PUT', keys.prefs(ws), patch), { optimisticData: { ...prefs, ...patch }, rollbackOnError: true, revalidate: false });
  };

  return (
    <div className="flex max-w-[560px] flex-col gap-6">
      <div>
        <div className="mb-2.5 font-bold">Notify me about</div>
        <div className="flex flex-col gap-1">
          {MODES.map(([k, label]) => {
            const on = prefs?.notify_level === k;
            return (
              <div key={k} onClick={() => update({ notify_level: k })} className="flex cursor-pointer items-center gap-3 px-1 py-2 text-[15px]">
                <span className="flex size-[18px] flex-none items-center justify-center rounded-full border-2" style={{ borderColor: on ? '#7c3aed' : 'var(--mute2)' }}>
                  {on && <span className="size-2 rounded-full bg-[#7c3aed]" />}
                </span>
                {label}
              </div>
            );
          })}
        </div>
      </div>
      <div className="overflow-hidden rounded-lg border border-line">
        {TOGGLES.map(([k, label, sub]) => (
          <div
            key={k}
            onClick={() => prefs && update({ [k]: !prefs[k] })}
            className="flex cursor-pointer items-center justify-between gap-4 border-b border-hover px-4 py-3.5 hover:bg-hover"
          >
            <div>
              <div className="font-bold">{label}</div>
              <div className="mt-0.5 text-[13px] text-mute">{sub}</div>
            </div>
            <Switch on={!!prefs?.[k]} />
          </div>
        ))}
      </div>
    </div>
  );
}
