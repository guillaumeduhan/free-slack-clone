'use client';

import { useState } from 'react';
import { mutate } from 'swr';
import { api, ApiError } from '@/lib/client/api';
import { refresh, sendMessage } from '@/lib/client/chat-actions';
import { colorFor, initials, isOnline, localTime } from '@/lib/client/format';
import type { Conversation, User, Workspace } from '@/lib/client/types';
import { keys, useBrowse, useMe, useMembers, useSidebar } from '@/hooks/use-chat-data';
import { useUi } from '@/hooks/use-ui';
import { Modal, ModalHeader, DialogButton } from '@/components/ui/modal';
import { Avatar, presenceDot } from '@/components/ui/avatar';
import { Switch } from '@/components/ui/switch';
import { DialogTitle, Field, INPUT, SearchField, closeModal, openDm, tzCity } from './dialog-parts';

const errorText = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong');

/** Cancel + optional Create, as in the design's shared modal footer. */
function Footer({ onSubmit, canSubmit }: { onSubmit?: () => void; canSubmit?: boolean }) {
  return (
    <div className="flex justify-end gap-2 p-5">
      <DialogButton variant="secondary" onClick={closeModal}>Cancel</DialogButton>
      {onSubmit && <DialogButton disabled={!canSubmit} onClick={onSubmit} className="px-4!">Create</DialogButton>}
    </div>
  );
}

/* ---------------------------------------------------------------- Channel */

export function ChannelDialog() {
  const open = useUi((s) => s.modal === 'channel');
  return open ? <ChannelForm /> : null;
}

function ChannelForm() {
  const ws = useUi((s) => s.workspaceId)!;
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [priv, setPriv] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const n = name.trim().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '');
    if (!n || busy) return;
    setBusy(true);
    try {
      const conv = await api<Conversation>('POST', `/api/workspaces/${ws}/conversations`, { name: n, private: priv, topic: desc.trim() || null });
      await refresh(keys.sidebar(ws));
      useUi.getState().openConversation(conv.id);
      closeModal();
    } catch (e) {
      setError(e instanceof ApiError && e.status === 409 ? 'A channel with that name already exists.' : errorText(e));
      setBusy(false);
    }
  };
  const onKey = (e: React.KeyboardEvent) => e.key === 'Enter' && submit();

  return (
    <Modal onClose={closeModal}>
      <ModalHeader title="Create a channel" sub="Channels organize conversations by topic." onClose={closeModal} />
      <div className="flex flex-col gap-3.5 px-5 pt-4">
        <Field label="Name">
          <div className="flex h-[38px] items-center gap-2 rounded-md border border-line3 px-3">
            <span className="font-mono text-mute">{priv ? '◦' : '#'}</span>
            <input
              autoFocus
              value={name}
              onChange={(e) => {
                setName(e.target.value.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9_-]/g, '').replace(/-{2,}/g, '-').slice(0, 80));
                setError(null);
              }}
              onKeyDown={onKey}
              placeholder="e.g. marketing-q4"
              className="min-w-0 flex-1 border-0 bg-transparent text-sm font-normal text-txt outline-none"
            />
          </div>
        </Field>
        <Field label={<>Description <span className="-mt-1 text-xs font-normal text-mute">Optional</span></>}>
          <input value={desc} onChange={(e) => setDesc(e.target.value)} onKeyDown={onKey} placeholder="What is this channel about?" className={`${INPUT} font-normal`} />
        </Field>
        <div onClick={() => setPriv((p) => !p)} className="flex cursor-pointer items-center justify-between gap-4 rounded-md border border-line p-3">
          <div>
            <div className="text-sm font-bold">Private channel</div>
            <div className="mt-0.5 text-xs text-mute">Only visible to invited members</div>
          </div>
          <Switch on={priv} size="sm" />
        </div>
        {error && <div className="text-[13px] text-[#ff6369]">{error}</div>}
      </div>
      <Footer onSubmit={submit} canSubmit={!!name.trim()} />
    </Modal>
  );
}

/* ---------------------------------------------------------------- DM / forward */

export function DmDialog() {
  const modal = useUi((s) => s.modal);
  return modal === 'dm' || modal === 'forward' ? <DmPicker forward={modal === 'forward'} /> : null;
}

function DmPicker({ forward }: { forward: boolean }) {
  const ws = useUi((s) => s.workspaceId)!;
  const { data: me } = useMe();
  const { data: members } = useMembers();
  const { data: sidebar } = useSidebar();
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const q = query.trim().toLowerCase();
  const people = (members?.members ?? [])
    .map((m) => m.user)
    .filter((u) => u.id !== me?.id && !u.is_bot && (!q || u.display_name.toLowerCase().includes(q)));
  const hasDm = (id: string) =>
    !!sidebar?.direct_messages.some((d) => d.other_user_ids?.length === 1 && d.other_user_ids[0] === id);

  const pick = async (id: string) => {
    if (busy) return;
    setBusy(true);
    try {
      const convId = await openDm(ws, id);
      const text = useUi.getState().forwardText;
      if (forward && text) await sendMessage(convId, text);
      useUi.getState().openConversation(convId);
      useUi.getState().set({ modal: null, forwardText: null });
    } catch (e) {
      setError(errorText(e));
      setBusy(false);
    }
  };
  const close = () => useUi.getState().set({ modal: null, forwardText: null });

  return (
    <Modal onClose={close}>
      <ModalHeader
        title={forward ? 'Forward message' : 'New direct message'}
        sub={forward ? 'Pick someone to send it to.' : 'Pick someone from your workspace.'}
        onClose={close}
      />
      <div className="px-5 pt-4">
        <SearchField autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search for a person" />
        <div className="mt-2.5 flex max-h-[280px] flex-col gap-0.5 overflow-y-auto">
          {people.map((u) => {
            const online = isOnline(u);
            return (
              <div key={u.id} onClick={() => pick(u.id)} className="flex cursor-pointer items-center gap-3 rounded-md p-2 hover:bg-hover">
                <Avatar id={u.id} name={u.display_name} size={32} fontSize={11} dot={presenceDot(online)} />
                <div className="min-w-0 flex-1">
                  <div className="font-bold">{u.display_name}</div>
                  <div className="text-xs text-mute">{online ? 'Active' : 'Away'}</div>
                </div>
                <span className="text-xs text-mute">{hasDm(u.id) ? 'Existing conversation' : ''}</span>
              </div>
            );
          })}
          {people.length === 0 && <div className="px-2 py-4 text-[13px] text-mute">No results</div>}
        </div>
        {error && <div className="mt-2 text-[13px] text-[#ff6369]">{error}</div>}
      </div>
      <div className="flex justify-end gap-2 p-5">
        <DialogButton variant="secondary" onClick={close}>Cancel</DialogButton>
      </div>
    </Modal>
  );
}

/* ---------------------------------------------------------------- Workspace */

export function WorkspaceDialog() {
  const open = useUi((s) => s.modal === 'workspace');
  return open ? <WorkspaceForm /> : null;
}

const slugify = (name: string) => {
  const s = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40).replace(/-+$/, '');
  return s.length >= 2 ? s : `${s || 'ws'}-${Math.random().toString(36).slice(2, 6)}`;
};

function WorkspaceForm() {
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const n = name.trim();
    if (!n || busy) return;
    setBusy(true);
    const slug = slugify(n);
    const create = (s: string) => api<Workspace>('POST', '/api/workspaces', { name: n, slug: s });
    try {
      const ws = await create(slug).catch((e) => {
        if (e instanceof ApiError && e.status === 409) return create(`${slug.slice(0, 35)}-${Math.random().toString(36).slice(2, 6)}`);
        throw e;
      });
      await mutate(keys.workspaces);
      useUi.getState().set({ workspaceId: ws.id, conversationId: null, modal: null });
    } catch (e) {
      setError(errorText(e));
      setBusy(false);
    }
  };

  return (
    <Modal onClose={closeModal}>
      <ModalHeader title="Add a workspace" sub="Create a new workspace for another team." onClose={closeModal} />
      <div className="px-5 pt-4">
        <Field label="Workspace name">
          <input
            autoFocus
            value={name}
            onChange={(e) => { setName(e.target.value); setError(null); }}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
            placeholder="e.g. Lumen Studio"
            className={`${INPUT} font-normal`}
          />
        </Field>
        {error && <div className="mt-2 text-[13px] text-[#ff6369]">{error}</div>}
      </div>
      <Footer onSubmit={submit} canSubmit={!!name.trim()} />
    </Modal>
  );
}

/* ---------------------------------------------------------------- Profile */

export function ProfileDialog() {
  const open = useUi((s) => s.modal === 'profile');
  const profileId = useUi((s) => s.profileId);
  return open ? <Profile key={profileId ?? 'me'} profileId={profileId} /> : null;
}

function Profile({ profileId }: { profileId: string | null }) {
  const ws = useUi((s) => s.workspaceId)!;
  const { data: me } = useMe();
  const { byId } = useMembers();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);

  const isMe = !profileId || profileId === me?.id;
  const user: User | null | undefined = byId.get(profileId ?? me?.id ?? '')?.user ?? (isMe ? me : null);
  if (!user) return null;
  const online = isOnline(user);

  const message = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const convId = await openDm(ws, user.id);
      useUi.getState().openConversation(convId);
      closeModal();
    } catch {
      setBusy(false);
    }
  };

  return (
    <Modal onClose={closeModal}>
      {/* The design keeps the (empty) sub line, hence the empty fragment. */}
      <ModalHeader title={editing ? 'Edit profile' : 'Profile'} sub={<></>} onClose={closeModal} />
      {editing ? (
        <ProfileEditor user={user} onDone={() => setEditing(false)} />
      ) : (
        <div className="flex flex-col gap-4 px-5 pt-4 pb-5">
          <div className="flex items-center gap-4">
            <div className="relative size-[88px] flex-none">
              <div className="flex size-[88px] items-center justify-center rounded-xl text-[30px] font-black text-white" style={{ background: colorFor(user.id) }}>
                {initials(user.display_name)}
              </div>
              <div className="absolute -right-1 -bottom-1 size-[18px] rounded-full border-[3px] border-bg" style={{ background: presenceDot(online) }} />
            </div>
            <div className="min-w-0">
              <div className="text-[22px] font-black">{user.display_name}{isMe && ' (you)'}</div>
              <div className="mt-0.5 text-txt3">{user.title ?? ''}</div>
              <div className="mt-1 text-[13px] text-mute">{online ? 'Active' : 'Away'}</div>
            </div>
          </div>
          <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 border-t border-line pt-4 text-sm">
            <span className="text-mute">Local time</span><span>{localTime(user.timezone)}</span>
            <span className="text-mute">Email</span><span className="text-[#a78bfa]">{user.email ?? '—'}</span>
            <span className="text-mute">Location</span><span>{tzCity(user.timezone)}</span>
          </div>
          <div className="flex gap-2">
            <DialogButton onClick={isMe ? () => setEditing(true) : message} className="flex-1">
              {isMe ? 'Edit profile' : 'Message'}
            </DialogButton>
            <DialogButton variant="secondary" onClick={closeModal}>Close</DialogButton>
          </div>
        </div>
      )}
    </Modal>
  );
}

function ProfileEditor({ user, onDone }: { user: User; onDone: () => void }) {
  const ws = useUi((s) => s.workspaceId)!;
  const [name, setName] = useState(user.display_name);
  const [title, setTitle] = useState(user.title ?? '');
  const [emoji, setEmoji] = useState(user.status_emoji ?? '');
  const [status, setStatus] = useState(user.status_text ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const canSave = !!name.trim();

  const save = async () => {
    if (!canSave || busy) return;
    setBusy(true);
    try {
      await api('PATCH', '/api/me', {
        display_name: name.trim(),
        title: title.trim() || null,
        status_emoji: emoji.trim() || null,
        status_text: status.trim() || null,
      });
      await Promise.all([mutate(keys.me), mutate(keys.members(ws))]);
      onDone();
    } catch (e) {
      setError(errorText(e));
      setBusy(false);
    }
  };
  const onKey = (e: React.KeyboardEvent) => e.key === 'Enter' && save();

  return (
    <div className="flex flex-col gap-4 px-5 pt-4 pb-5">
      <div className="flex flex-col gap-3.5">
        <Field label="Full name">
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} onKeyDown={onKey} className={`${INPUT} font-normal`} />
        </Field>
        <Field label="What you do">
          <input value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={onKey} placeholder="e.g. Product designer" className={`${INPUT} font-normal`} />
        </Field>
        <div className="flex gap-2">
          <Field label="Status emoji" className="w-[104px] flex-none">
            <input value={emoji} onChange={(e) => setEmoji(e.target.value)} onKeyDown={onKey} placeholder="🌴" className={`${INPUT} text-center font-normal`} />
          </Field>
          <Field label="Status text" className="min-w-0 flex-1">
            <input value={status} onChange={(e) => setStatus(e.target.value)} onKeyDown={onKey} placeholder="What's your status?" className={`${INPUT} font-normal`} />
          </Field>
        </div>
        {error && <div className="text-[13px] text-[#ff6369]">{error}</div>}
      </div>
      <div className="flex gap-2">
        <DialogButton disabled={!canSave} onClick={save} className="flex-1">Save</DialogButton>
        <DialogButton variant="secondary" onClick={onDone}>Cancel</DialogButton>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- Browse */

export function BrowseDialog() {
  const open = useUi((s) => s.modal === 'browse');
  return open ? <Browse /> : null;
}

function Browse() {
  const ws = useUi((s) => s.workspaceId)!;
  const { data } = useBrowse(true);
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const list = [...(data ?? [])].sort((a, b) => a.name.localeCompare(b.name)).filter((c) => !q || c.name.includes(q));

  const view = async (c: { id: string; joined: boolean }) => {
    closeModal();
    if (!c.joined) {
      await api('POST', `/api/conversations/${c.id}/members`, { join: true });
      await refresh(keys.sidebar(ws));
    }
    useUi.getState().openConversation(c.id);
  };

  return (
    <Modal onClose={closeModal} width={560} top="12vh">
      <DialogTitle title="Browse channels" onClose={closeModal} />
      <div className="px-5 pb-3">
        <SearchField autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search for channels" />
      </div>
      <div className="max-h-[360px] overflow-y-auto border-t border-line">
        {list.map((c) => (
          <div key={c.id} onClick={() => view(c)} className="flex cursor-pointer items-center gap-3 border-b border-hover px-5 py-3 hover:bg-hover">
            <div className="min-w-0 flex-1">
              <div className="font-bold"># {c.name}</div>
              <div className="mt-0.5 truncate text-[13px] text-mute">
                {c.member_count} members{c.topic ? ` · ${c.topic}` : ''}
              </div>
            </div>
            <span className="flex h-[30px] items-center rounded-md border border-line3 px-3 text-[13px] font-bold">View</span>
          </div>
        ))}
      </div>
    </Modal>
  );
}
