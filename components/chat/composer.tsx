'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useUi } from '@/hooks/use-ui';
import { useDrafts, useMe, useMembers } from '@/hooks/use-chat-data';
import { useDnd } from '@/hooks/use-dnd';
import { useViewport } from '@/hooks/use-viewport';
import { draftTokens } from '@/lib/client/rich-text';
import { colorFor, extColor, extOf, fmtSize, initials } from '@/lib/client/format';
import { refresh, saveDraft, sendMessage, uploadFile } from '@/lib/client/chat-actions';
import { cn } from '@/lib/client/cn';
import { EmojiGrid, POPOVER } from '@/components/ui/emoji-grid';
import {
  AtIcon, BoldIcon, CodeBlockIcon, CodeIcon, ItalicIcon, LinkIcon, MicIcon, OlIcon, PlusIcon, QuoteIcon, SendIcon, SlashIcon,
  SmileIcon, StrikeIcon, UlIcon, UnderlineIcon, VideoIcon,
} from '@/components/ui/icons';

const SLASH: [string, string][] = [
  ['/shrug', 'Append ¯\\_(ツ)_/¯ to your message'],
  ['/me', 'Display text as an action'],
  ['/dnd', 'Toggle do not disturb'],
  ['/invite', 'Invite people to this channel'],
  ['/remind', 'Set a reminder, e.g. /remind me to review PR'],
];

type Pending = { key: string; name: string; size: number; preview: string | null; fileId: string | null; error?: boolean };
type Recording = { kind: 'video' | 'audio'; start: number };
type Recorder = { recorder: MediaRecorder; stream: MediaStream; chunks: Blob[] };

// Unsent text per conversation for this tab (the server keeps the draft too).
const localDrafts = new Map<string, string>();

export function Composer({ conversationId, placeholder, isChannel }: { conversationId: string; placeholder: string; isChannel: boolean }) {
  const workspaceId = useUi((s) => s.workspaceId)!;
  const set = useUi((s) => s.set);
  const { data: me } = useMe();
  const { data: members } = useMembers();
  const { data: drafts, mutate: mutateDrafts } = useDrafts();
  const { toggle: toggleDnd } = useDnd();
  const { mobile } = useViewport();

  const serverDraft = drafts?.find((d) => d.conversation.id === conversationId && d.parent_id == null)?.body;
  const [draft, setDraft] = useState(() => localDrafts.get(conversationId) ?? '');
  const [focused, setFocused] = useState(false);
  const [fmtHidden, setFmtHidden] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [mentionQ, setMentionQ] = useState<string | null>(null);
  const [popIdx, setPopIdx] = useState(0);
  const [slashDismissed, setSlashDismissed] = useState(false);
  const [pending, setPending] = useState<Pending[]>([]);
  const [rec, setRec] = useState<Recording | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [error, setError] = useState('');
  const ta = useRef<HTMLTextAreaElement>(null);
  const overlay = useRef<HTMLDivElement>(null);
  const recorder = useRef<Recorder | null>(null);
  const [restored, setRestored] = useState(false);

  // Restore the server draft once it loads (e.g. after a reload).
  if (!restored && serverDraft != null) {
    setRestored(true);
    if (!localDrafts.get(conversationId)) setDraft(serverDraft);
  }

  // Persist the draft (debounced) so it shows in Drafts and survives reloads.
  useEffect(() => {
    localDrafts.set(conversationId, draft);
    if (draft === (serverDraft ?? '')) return;
    const t = setTimeout(() => saveDraft(conversationId, draft).then(() => mutateDrafts()).catch(() => {}), 700);
    return () => clearTimeout(t);
  }, [draft, conversationId, serverDraft, mutateDrafts]);

  useEffect(() => {
    if (!rec) return;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [rec]);

  useEffect(() => { if (!mobile) ta.current?.focus(); }, [conversationId, mobile]);

  const people = useMemo(
    () => (members?.members ?? []).map((m) => m.user).filter((u) => u.id !== me?.id),
    [members, me],
  );
  const names = useMemo(() => (members?.members ?? []).map((m) => m.user.display_name), [members]);

  const mentionList = mentionQ == null ? [] : people
    .filter((u) => u.display_name.toLowerCase().replace(/\s+/g, '').includes(mentionQ.toLowerCase()))
    .slice(0, 8);
  const slashOpen = /^\/\w*$/.test(draft) && !slashDismissed;
  const slashList = slashOpen ? SLASH.filter(([c]) => c.startsWith(draft)) : [];

  // ----- editing helpers (keep the caret where the design puts it) -----
  const edit = (fn: (v: string, a: number, b: number) => { v: string; a: number; b: number }) => {
    const el = ta.current;
    const a = el?.selectionStart ?? draft.length;
    const b = el?.selectionEnd ?? draft.length;
    const r = fn(draft, a, b);
    setDraft(r.v);
    setMentionQ(null);
    setEmojiOpen(false);
    requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(r.a, r.b); });
  };
  const wrap = (mk: string) => edit((v, a, b) => ({ v: v.slice(0, a) + mk + v.slice(a, b) + mk + v.slice(b), a: a + mk.length, b: b + mk.length }));
  const insert = (t: string) => edit((v, a, b) => ({ v: v.slice(0, a) + t + v.slice(b), a: a + t.length, b: a + t.length }));
  const linePrefix = (kind: 'ol' | 'ul' | 'quote') => edit((v, a, b) => {
    const ls = v.lastIndexOf('\n', a - 1) + 1;
    let le = v.indexOf('\n', b);
    if (le < 0) le = v.length;
    let n = 0;
    const out = v.slice(ls, le).split('\n').map((l) => (kind === 'ol' ? `${++n}. ${l}` : kind === 'ul' ? `• ${l}` : `> ${l}`)).join('\n');
    return { v: v.slice(0, ls) + out + v.slice(le), a: ls + out.length, b: ls + out.length };
  });
  const pickMention = (name: string) => edit((v, a) => {
    const s0 = v.slice(0, a).replace(/@[\w]*$/, `@${name} `);
    return { v: s0 + v.slice(a), a: s0.length, b: s0.length };
  });
  const pickSlash = (cmd: string) => {
    setDraft(`${cmd} `);
    setPopIdx(0);
    requestAnimationFrame(() => { ta.current?.focus(); ta.current?.setSelectionRange(cmd.length + 1, cmd.length + 1); });
  };

  const fx = {
    bold: () => wrap('*'), italic: () => wrap('_'), underline: () => wrap('++'), strike: () => wrap('~'), code: () => wrap('`'),
    codeblock: () => edit((v, a, b) => {
      const sel = v.slice(a, b);
      const pre = `${a > 0 && v[a - 1] !== '\n' ? '\n' : ''}\`\`\`\n`;
      return { v: `${v.slice(0, a)}${pre}${sel}\n\`\`\`${v.slice(b)}`, a: a + pre.length, b: a + pre.length + sel.length };
    }),
    link: () => {
      const el = ta.current;
      const a = el?.selectionStart ?? draft.length;
      const b = el?.selectionEnd ?? draft.length;
      const url = window.prompt('Link URL', 'https://');
      if (!url || url === 'https://') return;
      const label = draft.slice(a, b) || url.replace(/^https?:\/\//, '');
      edit((v) => { const ins = `[${label}](${url})`; return { v: v.slice(0, a) + ins + v.slice(b), a: a + ins.length, b: a + ins.length }; });
    },
    at: () => {
      edit((v, a, b) => { const pre = a > 0 && !/\s/.test(v[a - 1]) ? ' @' : '@'; return { v: v.slice(0, a) + pre + v.slice(b), a: a + pre.length, b: a + pre.length }; });
      setTimeout(() => { setMentionQ(''); setPopIdx(0); }, 0);
    },
    slash: () => { setDraft('/'); setSlashDismissed(false); setPopIdx(0); setEmojiOpen(false); requestAnimationFrame(() => { ta.current?.focus(); ta.current?.setSelectionRange(1, 1); }); },
  };

  // ----- files -----
  const addFiles = (files: File[]) => {
    for (const f of files) {
      const key = `${Date.now()}-${Math.random()}`;
      const preview = /^image\//.test(f.type) ? URL.createObjectURL(f) : null;
      setPending((p) => [...p, { key, name: f.name, size: f.size, preview, fileId: null }]);
      uploadFile(workspaceId, f)
        .then((row) => setPending((p) => p.map((x) => (x.key === key ? { ...x, fileId: row.id } : x))))
        .catch(() => setPending((p) => p.map((x) => (x.key === key ? { ...x, error: true } : x))));
    }
  };

  // ----- recording (real MediaRecorder) -----
  const startRec = async (kind: 'video' | 'audio') => {
    setEmojiOpen(false);
    setError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia(kind === 'video' ? { video: true, audio: true } : { audio: true });
      const mr = new MediaRecorder(stream);
      const r: Recorder = { recorder: mr, stream, chunks: [] };
      mr.ondataavailable = (e) => e.data.size && r.chunks.push(e.data);
      mr.start(250);
      recorder.current = r;
      setRec({ kind, start: Date.now() });
    } catch {
      setError(kind === 'video' ? 'Camera access was denied.' : 'Microphone access was denied.');
    }
  };
  const stopRec = (keep: boolean) => {
    const r = recorder.current;
    if (!rec || !r) return;
    const { kind, start } = rec;
    recorder.current = null;
    setRec(null);
    r.recorder.onstop = () => {
      r.stream.getTracks().forEach((t) => t.stop());
      if (!keep) return;
      const secs = Math.max(1, Math.round((Date.now() - start) / 1000));
      const type = r.recorder.mimeType || (kind === 'video' ? 'video/webm' : 'audio/webm');
      const ext = type.includes('mp4') ? (kind === 'video' ? 'mp4' : 'm4a') : 'webm';
      const name = `${kind}-clip-${Math.floor(secs / 60)}m${secs % 60}s.${ext}`;
      addFiles([new File(r.chunks, name, { type })]);
    };
    r.recorder.stop();
  };

  // ----- send -----
  const ready = pending.filter((p) => p.fileId).map((p) => p.fileId!);
  const uploading = pending.some((p) => !p.fileId && !p.error);
  const canSend = (!!draft.trim() || ready.length > 0) && !uploading;

  const send = async () => {
    let text = draft.trim();
    if (!canSend) return;
    const cmd = text.match(/^\/(\w+)\s*([\s\S]*)$/);
    if (cmd) {
      const [, c, rest] = cmd;
      if (c === 'shrug') text = `${rest ? `${rest} ` : ''}¯\\_(ツ)_/¯`;
      else if (c === 'me') text = `_${me?.display_name} ${rest}_`;
      else if (c === 'dnd') { setDraft(''); toggleDnd(); return; }
      else if (c === 'invite') { setDraft(''); if (isChannel) set({ membersOf: conversationId }); else set({ settings: 'members' }); return; }
      else if (c === 'remind') {
        const what = rest.replace(/^me\s+/, '') || 'check this';
        setDraft('');
        setTimeout(() => window.alert(`⏰ Reminder: ${what}`), 20 * 60_000);
        text = `⏰ Reminder set: I'll remind myself to *${what}* in 20 minutes.`;
      }
    }
    const files = ready;
    setDraft('');
    setPending([]);
    setMentionQ(null);
    localDrafts.set(conversationId, '');
    try {
      await sendMessage(conversationId, text, files);
      refresh(`/api/workspaces/${workspaceId}/conversations`, '/api/me/feed');
    } catch (e) {
      setDraft(draft);
      setError(e instanceof Error ? e.message : 'Message not sent');
    }
  };

  const onKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const list = mentionQ != null && mentionList.length ? mentionList : slashOpen && slashList.length ? slashList : null;
    if (list) {
      const n = list.length;
      if (e.key === 'ArrowDown') { e.preventDefault(); setPopIdx((popIdx + 1) % n); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setPopIdx((popIdx - 1 + n) % n); return; }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        const i = Math.min(popIdx, n - 1);
        if (mentionQ != null) pickMention(mentionList[i].display_name);
        else pickSlash(slashList[i][0]);
        return;
      }
      if (e.key === 'Escape') { setMentionQ(null); setSlashDismissed(true); return; }
    }
    if (e.key === 'Escape' && emojiOpen) { setEmojiOpen(false); return; }
    if ((e.metaKey || e.ctrlKey) && ['b', 'i', 'u'].includes(e.key.toLowerCase())) {
      e.preventDefault();
      wrap({ b: '*', i: '_', u: '++' }[e.key.toLowerCase()]!);
      return;
    }
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  };

  const keep = (e: React.MouseEvent) => e.preventDefault();
  const rows = Math.min(8, Math.max(1, draft.split('\n').length));
  const secs = rec ? Math.floor((now - rec.start) / 1000) : 0;
  const textStyle = 'block w-full border-0 px-3.5 pt-2.5 pb-1.5 text-base leading-normal whitespace-pre-wrap break-words outline-none max-h-60 box-border';

  return (
    <div
      className="flex-none pt-2 pb-5"
      style={{ paddingLeft: mobile ? 12 : 20, paddingRight: mobile ? 12 : 20 }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => { e.preventDefault(); addFiles(Array.from(e.dataTransfer.files)); }}
    >
      <div className="relative rounded-[10px] border bg-bg" style={{ borderColor: focused ? 'var(--mute2)' : 'var(--line3)' }}>
        {mentionQ != null && (
          <div className={`absolute bottom-[calc(100%+6px)] left-2 z-30 max-h-[280px] w-[min(340px,calc(100%-16px))] overflow-y-auto py-1.5 ${POPOVER}`}>
            <div className="px-3.5 pt-1 pb-1.5 text-xs font-bold text-mute">People</div>
            {mentionList.map((u, i) => (
              <div key={u.id} onMouseDown={keep} onClick={() => pickMention(u.display_name)}
                className={cn('flex cursor-pointer items-center gap-2.5 px-3.5 py-1.5 hover:bg-line', i === popIdx && 'bg-line')}>
                <span className="flex size-6 flex-none items-center justify-center rounded-[5px] text-[10px] font-bold text-white" style={{ background: colorFor(u.id) }}>
                  {initials(u.display_name)}
                </span>
                <span className="truncate font-bold">{u.display_name}</span>
                <span className="truncate text-xs text-mute">{u.is_bot ? 'App' : u.title ?? ''}</span>
              </div>
            ))}
            {!mentionList.length && <div className="px-3.5 py-1.5 text-[13px] text-mute">No matches</div>}
          </div>
        )}
        {slashOpen && slashList.length > 0 && (
          <div className={`absolute bottom-[calc(100%+6px)] left-2 z-30 w-[min(380px,calc(100%-16px))] py-1.5 ${POPOVER}`}>
            <div className="px-3.5 pt-1 pb-1.5 text-xs font-bold text-mute">Shortcuts</div>
            {slashList.map(([cmd, desc], i) => (
              <div key={cmd} onMouseDown={keep} onClick={() => pickSlash(cmd)}
                className={cn('flex cursor-pointer items-baseline gap-2.5 px-3.5 py-[7px] hover:bg-line', i === popIdx && 'bg-line')}>
                <span className="flex-none font-mono text-[13px] font-medium text-txt">{cmd}</span>
                <span className="truncate text-[13px] text-mute">{desc}</span>
              </div>
            ))}
          </div>
        )}
        {emojiOpen && (
          <div className={`absolute bottom-[calc(100%+6px)] left-[60px] z-30 w-[296px] p-2.5 ${POPOVER}`}>
            <EmojiGrid keepFocus onPick={insert} />
          </div>
        )}

        {!fmtHidden && (
          <div className="flex items-center gap-0.5 overflow-x-auto px-2 pt-1.5">
            <Tool title="Bold" onClick={fx.bold}><BoldIcon /></Tool>
            <Tool title="Italic" onClick={fx.italic}><ItalicIcon /></Tool>
            <Tool title="Underline" onClick={fx.underline}><UnderlineIcon /></Tool>
            <Tool title="Strikethrough" onClick={fx.strike}><StrikeIcon /></Tool>
            <Sep />
            <Tool title="Link" onClick={fx.link}><LinkIcon /></Tool>
            <Tool title="Ordered list" onClick={() => linePrefix('ol')}><OlIcon /></Tool>
            <Tool title="Bulleted list" onClick={() => linePrefix('ul')}><UlIcon /></Tool>
            <Sep />
            <Tool title="Quote" onClick={() => linePrefix('quote')}><QuoteIcon /></Tool>
            <Tool title="Code" onClick={fx.code}><CodeIcon /></Tool>
            <Tool title="Code block" onClick={fx.codeblock}><CodeBlockIcon /></Tool>
          </div>
        )}

        <div className="relative">
          <div ref={overlay} aria-hidden className={`${textStyle} pointer-events-none absolute inset-0 overflow-hidden text-txt`}>
            {draftTokens(draft, names, me?.display_name ?? null).map((t, i) => <span key={i} style={t.style}>{t.t}</span>)}
          </div>
          <textarea
            ref={ta}
            value={draft}
            rows={rows}
            placeholder={placeholder}
            onChange={(e) => {
              const v = e.target.value;
              const mm = v.slice(0, e.target.selectionStart).match(/(^|\s)@([\w]*)$/);
              setDraft(v);
              setMentionQ(mm ? mm[2] : null);
              setPopIdx(0);
              setSlashDismissed(false);
              setError('');
            }}
            onKeyDown={onKey}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            onScroll={(e) => { if (overlay.current) overlay.current.scrollTop = e.currentTarget.scrollTop; }}
            onPaste={(e) => { const fs = Array.from(e.clipboardData.files); if (fs.length) { e.preventDefault(); addFiles(fs); } }}
            className={`${textStyle} relative resize-none overflow-y-auto bg-transparent text-transparent caret-txt placeholder:text-mute`}
          />
        </div>

        {pending.length > 0 && (
          <div className="flex flex-wrap gap-2 px-3 pt-1 pb-1.5">
            {pending.map((p) => (
              <div key={p.key} className="relative flex h-[52px] max-w-[240px] items-center gap-2 rounded-lg border border-line bg-hover pr-2.5 pl-1.5">
                {p.preview ? (
                  <div className="size-10 flex-none rounded-[5px] bg-cover bg-center" style={{ backgroundImage: `url(${p.preview})` }} />
                ) : (
                  <div className="flex size-10 flex-none items-center justify-center rounded-[5px] text-[10px] font-black text-white" style={{ background: extColor(p.name) }}>
                    {extOf(p.name)}
                  </div>
                )}
                <div className="min-w-0">
                  <div className="truncate text-[13px] font-bold">{p.name}</div>
                  <div className={cn('text-[11px]', p.error ? 'text-danger-text' : 'text-mute')}>
                    {p.error ? 'Upload failed' : p.fileId ? fmtSize(p.size) : 'Uploading…'}
                  </div>
                </div>
                <button
                  onClick={() => setPending((x) => x.filter((y) => y.key !== p.key))}
                  title="Remove"
                  className="absolute -top-[7px] -right-[7px] flex size-5 cursor-pointer items-center justify-center rounded-full border border-line3 bg-bg text-xs leading-none text-txt2 outline-none"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}

        {rec ? (
          <div className="flex items-center gap-3 pt-2 pr-2.5 pb-2.5 pl-3.5">
            <span className="size-2.5 flex-none rounded-full bg-danger shadow-[0_0_0_4px_rgba(229,72,77,.25)]" />
            <span className="font-bold">{rec.kind === 'video' ? 'Recording video clip' : 'Recording audio clip'}</span>
            <span className="font-mono text-mute">{Math.floor(secs / 60)}:{String(secs % 60).padStart(2, '0')}</span>
            <span className="flex-1" />
            <button onClick={() => stopRec(false)} className="h-8 cursor-pointer rounded-md border border-line3 bg-transparent px-3 text-[13px] font-bold text-txt outline-none hover:bg-hover">Cancel</button>
            <button onClick={() => stopRec(true)} className="h-8 cursor-pointer rounded-md border-0 bg-accent px-3.5 text-[13px] font-bold whitespace-nowrap text-white outline-none">Stop &amp; attach</button>
          </div>
        ) : (
          <div className="flex items-center gap-0.5 px-2 pt-1 pb-2">
            <label title="Attach files" className="mr-1 flex size-8 flex-none cursor-pointer items-center justify-center rounded-full bg-hover text-txt3 hover:bg-line hover:text-txt">
              <input type="file" multiple className="hidden" onChange={(e) => { addFiles(Array.from(e.target.files ?? [])); e.target.value = ''; }} />
              <PlusIcon size={18} strokeWidth={2} />
            </label>
            <span
              onMouseDown={keep}
              onClick={() => setFmtHidden(!fmtHidden)}
              title={fmtHidden ? 'Show formatting' : 'Hide formatting'}
              className="flex size-8 flex-none cursor-pointer items-center justify-center rounded-md text-[15px] font-bold underline underline-offset-[3px] hover:bg-line hover:text-txt"
              style={{ color: fmtHidden ? 'var(--mute)' : 'var(--txt)' }}
            >
              Aa
            </span>
            <Tool title="Emoji" onClick={() => { setEmojiOpen(!emojiOpen); setMentionQ(null); }}><SmileIcon /></Tool>
            <Tool title="Mention someone" onClick={fx.at}><AtIcon /></Tool>
            <Sep />
            <Tool title="Record video clip" onClick={() => startRec('video')}><VideoIcon /></Tool>
            <Tool title="Record audio clip" onClick={() => startRec('audio')}><MicIcon /></Tool>
            <Sep />
            <Tool title="Run shortcut" onClick={fx.slash}><SlashIcon /></Tool>
            {error && <span className="ml-2 truncate text-xs text-danger-text">{error}</span>}
            <span className="flex-1" />
            <button
              onClick={send}
              title="Send"
              className="flex h-8 w-9 flex-none cursor-pointer items-center justify-center rounded-md border-0 text-white outline-none"
              style={{ background: canSend ? '#7c3aed' : 'var(--line3)' }}
            >
              <SendIcon />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function Tool({ title, onClick, children }: { title: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <span
      title={title}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className="flex size-8 flex-none cursor-pointer items-center justify-center rounded-md text-mute hover:bg-line hover:text-txt"
    >
      {children}
    </span>
  );
}

const Sep = () => <span className="mx-1 h-5 w-px flex-none bg-line3" />;
