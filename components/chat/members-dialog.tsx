'use client';

import { useState } from 'react';
import { mutate } from 'swr';
import { api } from '@/lib/client/api';
import { refresh } from '@/lib/client/chat-actions';
import { channelLabel, isOnline } from '@/lib/client/format';
import { keys, useConvMembers, useConversation, useMe, useMembers, useWorkspace } from '@/hooks/use-chat-data';
import { useUi } from '@/hooks/use-ui';
import { Modal } from '@/components/ui/modal';
import { Avatar, presenceDot } from '@/components/ui/avatar';
import { DialogTitle, EMAIL_RE, SearchField } from './dialog-parts';

const errorText = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong');

export function MembersDialog() {
  const id = useUi((s) => s.membersOf);
  return id ? <Members key={id} id={id} /> : null;
}

function Members({ id }: { id: string }) {
  const ws = useUi((s) => s.workspaceId)!;
  const { data: me } = useMe();
  const { data: workspace } = useWorkspace();
  const { data: conv } = useConversation(id);
  const { data: inChannel, mutate: reload } = useConvMembers(id);
  const { data: wsMembers, byId } = useMembers();
  const [query, setQuery] = useState('');
  const [email, setEmail] = useState('');
  const [invited, setInvited] = useState<{ email: string; url: string | null } | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = () => useUi.getState().set({ membersOf: null });
  const isAdmin = workspace?.role === 'owner' || workspace?.role === 'admin';
  const q = query.trim().toLowerCase();
  const hit = (u: { display_name: string; title: string | null }) =>
    !q || u.display_name.toLowerCase().includes(q) || (u.title ?? '').toLowerCase().includes(q);

  const all = inChannel ?? [];
  const ids = new Set(all.map((m) => m.user.id));
  const list = all.map((m) => m.user).filter(hit);
  const addable = q ? (wsMembers?.members ?? []).map((m) => m.user).filter((u) => !ids.has(u.id) && hit(u)) : [];

  const afterChange = () => Promise.all([reload(), mutate(keys.conversation(id)), refresh(keys.sidebar(ws))]);
  const run = async (fn: () => Promise<unknown>) => {
    setError(null);
    try { await fn(); } catch (e) { setError(errorText(e)); }
  };
  const add = (uid: string) => run(async () => {
    await api('POST', `/api/conversations/${id}/members`, { user_ids: [uid] });
    setQuery('');
    await afterChange();
  });
  const remove = (uid: string) => run(async () => {
    await api('DELETE', `/api/conversations/${id}/members?user_id=${uid}`);
    await afterChange();
  });
  const leave = () => run(async () => {
    await api('DELETE', `/api/conversations/${id}/members`);
    close();
    await refresh(keys.sidebar(ws));
  });
  const profile = (uid: string) => {
    close();
    useUi.getState().openProfile(uid);
  };

  const validEmail = EMAIL_RE.test(email);
  const invite = () => run(async () => {
    const em = email.trim();
    if (!EMAIL_RE.test(em)) return;
    const res = await api<{ invite_url?: string }>('POST', `/api/workspaces/${ws}/invitations`, { email: em });
    setEmail('');
    setCopied(false);
    setInvited({ email: em, url: res.invite_url ?? null });
    mutate(keys.invitations(ws));
  });
  const copyLink = () => {
    if (!invited?.url) return;
    navigator.clipboard?.writeText(invited.url).then(() => setCopied(true), () => {});
  };

  const count = all.length;
  return (
    <Modal onClose={close} width={540} top="10vh" z={80} className="flex max-h-[80vh] flex-col">
      <DialogTitle
        title={conv ? channelLabel(conv) : ''}
        sub={inChannel ? `${count} ${count === 1 ? 'member' : 'members'}` : ''}
        onClose={close}
      />
      <div className="relative px-5 pb-3">
        <SearchField autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find members or add people" />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto border-t border-line">
        {addable.length > 0 && (
          <>
            <div className="px-5 pt-2.5 pb-1 text-xs font-bold text-mute">Add to channel</div>
            {addable.map((u) => (
              <div key={u.id} className="flex items-center gap-3 px-5 py-2 hover:bg-hover">
                <Avatar id={u.id} name={u.display_name} size={32} fontSize={11} />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-bold">{u.display_name}</div>
                  <div className="text-xs text-mute">{u.is_bot ? 'App' : u.title ?? ''}</div>
                </div>
                <button
                  onClick={() => add(u.id)}
                  className="h-[30px] flex-none cursor-pointer rounded-md border-0 bg-[#7c3aed] px-3 text-[13px] font-bold text-white outline-none"
                >
                  Add
                </button>
              </div>
            ))}
            <div className="px-5 pt-2.5 pb-1 text-xs font-bold text-mute">Members</div>
          </>
        )}
        {list.map((u) => {
          const mine = u.id === me?.id;
          const role = byId.get(u.id)?.role;
          const badge = role === 'owner' || role === 'admin' ? role : null;
          return (
            <div key={u.id} className="flex items-center gap-3 px-5 py-2 hover:bg-hover">
              <Avatar id={u.id} name={u.display_name} size={32} fontSize={11} dot={presenceDot(isOnline(u))} onClick={() => profile(u.id)} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="truncate font-bold">{u.display_name}{mine && ' (you)'}</span>
                  {badge && (
                    <span className="flex-none rounded px-[5px] py-0.5 text-[10px] font-black tracking-[.04em] text-accent-text uppercase bg-[rgba(124,58,237,.16)]">
                      {badge}
                    </span>
                  )}
                </div>
                <div className="truncate text-xs text-mute">{u.is_bot ? 'App' : u.title ?? ''}</div>
              </div>
              {(mine || isAdmin) && (
                <button
                  onClick={() => (mine ? leave() : remove(u.id))}
                  className="h-7 flex-none cursor-pointer rounded-md border border-line3 bg-transparent px-2.5 text-xs font-bold text-txt3 outline-none hover:border-[#e5484d] hover:text-[#ff6369]"
                >
                  {mine ? 'Leave' : 'Remove'}
                </button>
              )}
            </div>
          );
        })}
        {inChannel && list.length === 0 && addable.length === 0 && (
          <div className="p-5 text-sm text-mute">No one matches “{query}”. Invite them by email below.</div>
        )}
      </div>
      <div className="border-t border-line bg-sub px-5 pt-3.5 pb-[18px]">
        <div className="mb-2 text-sm font-bold">Invite new people to {workspace?.name}</div>
        <div className="flex gap-2">
          <input
            value={email}
            onChange={(e) => { setEmail(e.target.value); setInvited(null); setError(null); }}
            onKeyDown={(e) => e.key === 'Enter' && invite()}
            placeholder="name@company.com"
            className="h-[38px] min-w-0 flex-1 rounded-md border border-line3 bg-bg px-3 text-sm text-txt outline-none"
          />
          <button
            onClick={invite}
            className="h-[38px] flex-none cursor-pointer rounded-md border-0 px-4 text-[13px] font-bold whitespace-nowrap text-white outline-none"
            style={{ background: validEmail ? '#7c3aed' : 'var(--line3)' }}
          >
            Send invite
          </button>
        </div>
        {invited && (
          <div className="mt-2 text-[13px] font-bold text-[#4cc38a]">
            Invite sent to {invited.email}
            {invited.url && (
              <>
                {' · '}
                <span onClick={copyLink} className="cursor-pointer underline-offset-[3px] hover:underline">{copied ? 'Link copied' : 'Copy link'}</span>
              </>
            )}
          </div>
        )}
        {error && <div className="mt-2 text-[13px] text-[#ff6369]">{error}</div>}
      </div>
    </Modal>
  );
}
