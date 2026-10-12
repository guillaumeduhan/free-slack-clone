'use client';

import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { mutate } from 'swr';
import { ChevronLeftIcon, CopyIcon, PlusIcon, SendIcon } from '@/components/ui/icons';
import { DialogButton, Modal } from '@/components/ui/modal';
import { keys, useApp, useApps, useMembers, useSidebar, useWorkspace } from '@/hooks/use-chat-data';
import { useUi } from '@/hooks/use-ui';
import { useViewport } from '@/hooks/use-viewport';
import { api, ApiError } from '@/lib/client/api';
import { APP_COLORS, KIND_COLORS, channelLabel, fmtTime, initials } from '@/lib/client/format';
import type { AppDetail as App, AppKind, AppSummary } from '@/lib/client/types';

const KIND_LABEL: Record<AppKind, string> = { app: 'App', agent: 'Agent', bot: 'Bot' };
const KINDS: [AppKind, string][] = [['app', 'Posts via webhook'], ['agent', 'Reasons and replies'], ['bot', 'Scheduled tasks']];

const mono = 'font-mono text-[12.5px]';
const field = `flex h-[34px] min-w-0 flex-1 items-center overflow-hidden rounded-md border border-line3 bg-sub px-3 ${mono} text-txt2 whitespace-nowrap text-ellipsis`;
const smallBtn = 'flex h-[34px] flex-none cursor-pointer items-center gap-1.5 rounded-md border border-line3 bg-bg px-3 text-[13px] font-bold text-txt outline-none hover:bg-hover disabled:cursor-default disabled:opacity-50 disabled:hover:bg-bg';
const input = 'h-[38px] rounded-md border border-line3 bg-bg px-3 text-sm font-normal text-txt outline-none';

const noop = () => () => {};
const useOrigin = () => useSyncExternalStore(noop, () => window.location.origin, () => '');

function useIsAdmin() {
  const role = useWorkspace().data?.role;
  return role === 'owner' || role === 'admin';
}

/** Channels I can see, sorted by name, for the channel pickers. */
function useChannelOptions() {
  const channels = useSidebar().data?.channels ?? [];
  return [...channels].sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''));
}

const appColor = (apps: AppSummary[] | undefined, id: string) =>
  APP_COLORS[Math.max(0, apps?.findIndex((a) => a.id === id) ?? 0) % APP_COLORS.length];

function KindPill({ kind }: { kind: AppKind }) {
  const [fg, bg] = KIND_COLORS[kind];
  return (
    <span className="flex-none rounded px-[5px] py-0.5 text-[10px] font-black tracking-[.04em] uppercase" style={{ color: fg, background: bg }}>
      {KIND_LABEL[kind]}
    </span>
  );
}

function BackButton() {
  return (
    <button
      onClick={() => useUi.getState().set({ mobilePane: 'list', threadId: null })}
      title="Back"
      className="-ml-2 flex size-9 flex-none cursor-pointer items-center justify-center rounded-md border-0 bg-transparent outline-none hover:bg-hover"
    >
      <ChevronLeftIcon size={20} strokeWidth={2.2} className="text-txt" />
    </button>
  );
}

function Header({ gap, children }: { gap: number; children: ReactNode }) {
  const { mobile } = useViewport();
  return (
    <header className="flex h-14 flex-none items-center border-b border-line" style={{ gap, padding: `0 ${mobile ? 12 : 20}px` }}>
      {children}
    </header>
  );
}

export function AppsList() {
  const { data: apps } = useApps();
  const { mobile } = useViewport();
  const isAdmin = useIsAdmin();
  const set = useUi((s) => s.set);
  const openAdd = () => set({ addAppOpen: true });

  return (
    <>
      <Header gap={12}>
        {mobile && <BackButton />}
        <span className="text-lg font-black whitespace-nowrap">Apps, agents &amp; bots</span>
        <span className="min-w-0 flex-1 truncate text-[13px] text-mute">Integrations that post into your channels</span>
        {isAdmin && (
          <button
            onClick={openAdd}
            className="flex h-[34px] flex-none cursor-pointer items-center gap-1.5 rounded-md border-0 bg-accent px-3.5 text-[13px] font-bold whitespace-nowrap text-white outline-none"
          >
            <PlusIcon size={14} strokeWidth={2.6} />Add an app
          </button>
        )}
      </Header>
      <div className="flex-1 overflow-y-auto pt-5 pb-8" style={{ paddingInline: mobile ? 12 : 20 }}>
        <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(260px,1fr))' }}>
          {apps?.map((a, i) => (
            <div
              key={a.id}
              onClick={() => set({ view: 'app', appId: a.id, threadId: null, mobilePane: 'chat' })}
              className="flex cursor-pointer flex-col gap-2.5 rounded-[10px] border border-line bg-bg p-4 hover:border-line3 hover:bg-hover"
            >
              <div className="flex items-center gap-3">
                <span
                  className="flex size-10 flex-none items-center justify-center rounded-[10px] text-base font-black text-white"
                  style={{ background: APP_COLORS[i % APP_COLORS.length] }}
                >
                  {initials(a.name)}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-base font-black">{a.name}</div>
                  <div className="mt-0.5 truncate text-xs text-mute">
                    {a.default_conversation ? `Posts to #${a.default_conversation.name}` : 'No default channel'}
                  </div>
                </div>
                <KindPill kind={a.kind} />
              </div>
              <div className="line-clamp-2 text-sm leading-normal text-txt3">{a.description}</div>
            </div>
          ))}
          {isAdmin && (
            <div
              onClick={openAdd}
              className="flex min-h-[118px] cursor-pointer items-center justify-center gap-2.5 rounded-[10px] border-2 border-dashed border-line3 p-4 font-bold text-mute hover:border-accent hover:text-txt"
            >
              <PlusIcon size={18} strokeWidth={2.4} />Add an app, agent or bot
            </div>
          )}
        </div>
      </div>
    </>
  );
}

export function AppDetail() {
  const appId = useUi((s) => s.appId);
  const { data: app } = useApp(appId);
  if (!app || app.id !== appId) return null;
  return <AppPage key={app.id} app={app} />;
}

type Resp = { status: number; ok: boolean; text: string; conversationId: string; channel: string };

function AppPage({ app }: { app: App }) {
  const { mobile } = useViewport();
  const isAdmin = useIsAdmin();
  const origin = useOrigin();
  const { data: apps } = useApps();
  const { byId } = useMembers();
  const channels = useChannelOptions();
  const secrets = useUi((s) => s.appSecrets)[app.id] ?? {};
  const set = useUi((s) => s.set);

  const [copied, setCopied] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [tryCh, setTryCh] = useState(app.default_conversation_id ?? '');
  const [tryText, setTryText] = useState(
    app.kind === 'agent' ? 'Here is today’s summary of open customer requests.' : 'Deploy finished ✅ web@main is live.',
  );
  const [resp, setResp] = useState<Resp | null>(null);
  const busy = useRef(false);
  const copyTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(copyTimer.current), []);

  const color = appColor(apps, app.id);
  const creator = app.created_by ? byId.get(app.created_by)?.user.display_name : null;
  const prefix = app.tokens.find((t) => !t.revoked_at)?.token_prefix ?? 'xoxb-';
  const token = isAdmin ? secrets.token : undefined;
  const channelId = tryCh || channels[0]?.id || '';
  const channelName = channels.find((c) => c.id === channelId)?.name ?? '';

  const webhook = secrets.webhookUrl ?? `${origin}/api/hooks/••••••••`;
  const webhookNote = secrets.webhookUrl ? null
    : isAdmin && !app.webhooks.length ? 'Pick a default channel to get a webhook' : 'Shown once at creation';

  const endpoint = `${origin}/api/bot/chat.postMessage`;
  const body = JSON.stringify({ channel: `#${channelName}`, text: tryText });
  const curl = `curl -X POST ${endpoint} \\\n  -H "Authorization: Bearer xoxb-…" \\\n  -H "Content-Type: application/json" \\\n  -d '${body}'`;

  const storeSecret = (patch: { token?: string; webhookUrl?: string }) =>
    set({ appSecrets: { ...useUi.getState().appSecrets, [app.id]: { ...useUi.getState().appSecrets[app.id], ...patch } } });

  const rotate = async () => {
    const res = await api<{ token: string }>('POST', `/api/apps/${app.id}/tokens`);
    storeSecret({ token: res.token });
    mutate(keys.app(app.id));
    return res.token;
  };

  const copyHook = () => {
    if (!secrets.webhookUrl) return;
    navigator.clipboard?.writeText(secrets.webhookUrl).catch(() => {});
    setCopied(true);
    clearTimeout(copyTimer.current);
    copyTimer.current = setTimeout(() => setCopied(false), 1500);
  };

  const onTokenButton = async () => {
    if (token) return setShowToken((v) => !v);
    if (!window.confirm(`Rotate the token for ${app.name}? The current token stops working.`)) return;
    try {
      await rotate();
      setShowToken(true);
    } catch (e) {
      window.alert((e as Error).message);
    }
  };

  const send = async () => {
    if (!tryText.trim() || !channelId || busy.current) return;
    busy.current = true;
    const sent = { conversationId: channelId, channel: `#${channelName}` };
    try {
      const auth = token ?? (isAdmin ? await rotate() : null);
      const res = await fetch('/api/bot/chat.postMessage', {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(auth && { authorization: `Bearer ${auth}` }) },
        body,
      });
      const json = await res.json().catch(() => null);
      setResp({ ...sent, status: res.status, ok: res.ok, text: JSON.stringify(json, null, 2) });
      if (res.ok) {
        mutate(keys.app(app.id));
        mutate(keys.messages(channelId));
      }
    } catch (e) {
      const status = e instanceof ApiError ? e.status : 0;
      setResp({ ...sent, status, ok: false, text: JSON.stringify({ ok: false, error: (e as Error).message }, null, 2) });
    } finally {
      busy.current = false;
    }
  };

  const remove = async () => {
    if (!window.confirm(`Remove ${app.name}? This revokes the webhook and token. Past messages stay.`)) return;
    try {
      await api('DELETE', `/api/apps/${app.id}`);
    } catch (e) {
      return window.alert((e as Error).message);
    }
    const rest = { ...useUi.getState().appSecrets };
    delete rest[app.id];
    set({ view: 'apps', appId: null, appSecrets: rest });
    const ws = useUi.getState().workspaceId;
    if (ws) mutate(keys.apps(ws));
  };

  const open = (id: string) => useUi.getState().openConversation(id);

  return (
    <>
      <Header gap={10}>
        <span
          onClick={() => set({ view: 'apps' })}
          className="flex flex-none cursor-pointer items-center gap-1 text-sm font-bold whitespace-nowrap text-mute hover:text-txt"
        >
          <ChevronLeftIcon size={16} strokeWidth={2.4} />Apps
        </span>
        <span className="text-line3">/</span>
        {mobile && <BackButton />}
        <span className="flex size-[26px] flex-none items-center justify-center rounded-md text-xs font-black text-white" style={{ background: color }}>
          {initials(app.name)}
        </span>
        <span className="truncate text-lg font-black">{app.name}</span>
        <KindPill kind={app.kind} />
      </Header>
      <div className="flex-1 overflow-y-auto">
        <div className="flex max-w-[780px] flex-col gap-7 pt-6 pb-10" style={{ paddingInline: mobile ? 12 : 20 }}>
          <div className="flex items-center gap-4">
            <div className="flex size-16 flex-none items-center justify-center rounded-[14px] text-[26px] font-black text-white" style={{ background: color }}>
              {initials(app.name)}
            </div>
            <div className="min-w-0">
              <div className="text-[22px] font-black">{app.name}</div>
              {app.description && <div className="mt-0.5 text-pretty text-txt3">{app.description}</div>}
              <div className="mt-1 text-[13px] text-mute">
                {creator && `Added by ${creator} · `}
                {app.default_conversation ? `Default channel #${app.default_conversation.name}` : 'No default channel'}
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <div>
              <div className="text-base font-black">Incoming webhook</div>
              <div className="mt-1 text-sm text-pretty text-mute">Send a POST request with a JSON body to post into any channel as {app.name}.</div>
            </div>
            <div className="flex items-center gap-2">
              <div className={field}>{webhook}</div>
              <button onClick={copyHook} disabled={!secrets.webhookUrl} className={smallBtn}>
                <CopyIcon size={13} />{copied ? 'Copied' : 'Copy'}
              </button>
            </div>
            {webhookNote && <div className="-mt-1.5 text-xs text-mute">{webhookNote}</div>}
            <div className="flex items-center gap-2">
              <span className="w-[84px] flex-none text-[13px] font-bold text-mute">Bot token</span>
              <div className={field}>
                {token ? (showToken ? token : `${token.slice(0, 5)}${'•'.repeat(18)}${token.slice(-4)}`) : `${prefix}••••••••••••`}
              </div>
              {isAdmin && (
                <button onClick={onTokenButton} className={smallBtn}>{token ? (showToken ? 'Hide' : 'Reveal') : 'Rotate'}</button>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <div>
              <div className="text-base font-black">Try it</div>
              <div className="mt-1 text-sm text-pretty text-mute">Compose a message, then send the request. It will appear in the channel with the BOT tag.</div>
            </div>
            <div className="overflow-hidden rounded-[10px] border border-line">
              <div className="flex flex-wrap items-start gap-2.5 border-b border-line p-3.5">
                <label className="flex flex-col gap-1.5 text-xs font-bold text-mute">
                  Channel
                  <select
                    value={channelId}
                    onChange={(e) => setTryCh(e.target.value)}
                    className="h-9 min-w-[180px] cursor-pointer rounded-md border border-line3 bg-bg px-2.5 text-sm font-normal text-txt outline-none"
                  >
                    {channels.map((c) => <option key={c.id} value={c.id}>{channelLabel(c)}</option>)}
                  </select>
                </label>
                <label className="flex flex-[1_1_260px] flex-col gap-1.5 text-xs font-bold text-mute">
                  Text
                  <textarea
                    value={tryText}
                    onChange={(e) => setTryText(e.target.value)}
                    rows={2}
                    className="resize-y rounded-md border border-line3 bg-bg px-2.5 py-2 text-sm leading-normal font-normal text-txt outline-none"
                  />
                </label>
              </div>
              <div className="overflow-x-auto bg-sub px-3.5 py-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="font-mono text-xs text-mute">Request</span>
                  <span className="rounded bg-[rgba(48,164,108,.16)] px-1.5 py-0.5 font-mono text-[11px] font-bold text-[#4cc38a]">POST</span>
                </div>
                <pre className={`m-0 ${mono} leading-[1.7] whitespace-pre text-txt2`}>{curl}</pre>
              </div>
              {resp && (
                <div className="border-t border-line bg-bg px-3.5 py-3">
                  <div className="mb-2 flex items-center gap-2">
                    <span className="font-mono text-xs text-mute">Response</span>
                    <span className="font-mono text-[11px] font-bold" style={{ color: resp.ok ? '#4cc38a' : '#ff6369' }}>
                      {resp.ok ? `${resp.status} OK` : resp.status ? `${resp.status} Error` : 'Network error'}
                    </span>
                    <span className="flex-1" />
                    {resp.ok && (
                      <span onClick={() => open(resp.conversationId)} className="cursor-pointer text-[13px] font-bold text-[#a78bfa] hover:underline">
                        View in {resp.channel}
                      </span>
                    )}
                  </div>
                  <pre className={`m-0 overflow-x-auto ${mono} leading-[1.7] whitespace-pre text-txt2`}>{resp.text}</pre>
                </div>
              )}
              <div className="flex justify-end gap-2 border-t border-line px-3.5 py-2.5">
                <button
                  onClick={send}
                  className="flex h-[34px] cursor-pointer items-center gap-1.5 rounded-md border-0 px-4 text-[13px] font-bold text-white outline-none"
                  style={{ background: tryText.trim() ? '#7c3aed' : 'var(--line3)' }}
                >
                  <SendIcon size={14} className="text-white" />Send request
                </button>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <div className="text-base font-black">Recent posts</div>
            {app.recent.map((rp) => (
              <div key={rp.id} onClick={() => open(rp.conversation_id)} className="flex cursor-pointer gap-3 rounded-lg border border-line px-3 py-2.5 hover:bg-hover">
                <div className="min-w-0 flex-1">
                  <div className="flex gap-2 text-xs text-mute">
                    <span className="font-bold">{rp.conversation_name ? `# ${rp.conversation_name}` : 'Direct message'}</span>
                    <span>{fmtTime(rp.created_at)}</span>
                  </div>
                  <div className="mt-0.5 truncate text-txt2">{rp.body}</div>
                </div>
              </div>
            ))}
            {!app.recent.length && <div className="text-sm text-mute">No posts yet. Send a request above to see it here.</div>}
          </div>

          {isAdmin && (
            <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-[rgba(229,72,77,.4)] p-4">
              <div>
                <div className="font-bold">Remove app</div>
                <div className="mt-0.5 text-[13px] text-mute">Revokes the webhook and token. Past messages stay.</div>
              </div>
              <DialogButton variant="danger-outline" onClick={remove} className="flex-none">Remove</DialogButton>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

export function AddAppDialog() {
  const open = useUi((s) => s.addAppOpen);
  return open ? <AddAppForm /> : null;
}

function AddAppForm() {
  const ws = useUi((s) => s.workspaceId);
  const set = useUi((s) => s.set);
  const { data: apps } = useApps();
  const channels = useChannelOptions();
  const [name, setName] = useState('');
  const [kind, setKind] = useState<AppKind>('app');
  const [desc, setDesc] = useState('');
  const [channel, setChannel] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const channelId = channel || (channels.find((c) => c.name === 'general') ?? channels[0])?.id || '';
  const close = () => set({ addAppOpen: false });

  const create = async () => {
    const nm = name.trim();
    if (!nm || !ws || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ app: AppSummary; token: string; webhook_url: string | null }>('POST', `/api/workspaces/${ws}/apps`, {
        name: nm, kind, description: desc.trim() || null, default_conversation_id: channelId || null,
      });
      const secrets = useUi.getState().appSecrets;
      set({
        appSecrets: { ...secrets, [res.app.id]: { token: res.token, webhookUrl: res.webhook_url ?? undefined } },
        addAppOpen: false, view: 'app', appId: res.app.id, threadId: null, mobilePane: 'chat',
      });
      mutate(keys.apps(ws));
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <Modal onClose={close} width={500} top="12vh" z={80} className="flex flex-col gap-4 p-5">
      <div>
        <div className="text-lg font-black">Add an app</div>
        <div className="mt-1 text-[13px] text-mute">Create an app, agent or bot that can post into channels through the API.</div>
      </div>
      <div className="flex items-center gap-3">
        <div
          className="flex size-11 flex-none items-center justify-center rounded-[10px] text-lg font-black text-white"
          style={{ background: APP_COLORS[(apps?.length ?? 0) % APP_COLORS.length] }}
        >
          {(name.trim()[0] ?? '?').toUpperCase()}
        </div>
        <label className="flex flex-1 flex-col gap-1.5 text-[13px] font-bold text-txt2">
          Name
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Invoice Bot" className={input} />
        </label>
      </div>
      <div className="flex flex-col gap-1.5 text-[13px] font-bold text-txt2">
        Type
        <div className="grid grid-cols-3 gap-1.5">
          {KINDS.map(([k, sub]) => (
            <div
              key={k}
              onClick={() => setKind(k)}
              className="flex cursor-pointer flex-col gap-0.5 rounded-lg border p-2.5"
              style={{ borderColor: kind === k ? '#7c3aed' : 'var(--line)', background: kind === k ? 'rgba(124,58,237,.12)' : 'transparent' }}
            >
              <span className="text-sm font-black text-txt">{KIND_LABEL[k]}</span>
              <span className="text-xs font-normal text-mute">{sub}</span>
            </div>
          ))}
        </div>
      </div>
      <label className="flex flex-col gap-1.5 text-[13px] font-bold text-txt2">
        Description
        <input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="What does it do?" className={input} />
      </label>
      <label className="flex flex-col gap-1.5 text-[13px] font-bold text-txt2">
        Default channel
        <select value={channelId} onChange={(e) => setChannel(e.target.value)} className={`${input} cursor-pointer`}>
          {channels.map((c) => <option key={c.id} value={c.id}>{channelLabel(c)}</option>)}
        </select>
      </label>
      {error && <div className="text-[13px] text-danger-text">{error}</div>}
      <div className="flex justify-end gap-2">
        <DialogButton variant="secondary" onClick={close}>Cancel</DialogButton>
        <button
          onClick={create}
          className="h-9 cursor-pointer rounded-md border-0 px-4 text-[13px] font-bold text-white outline-none"
          style={{ background: name.trim() ? '#7c3aed' : 'var(--line3)' }}
        >
          Create app
        </button>
      </div>
    </Modal>
  );
}
