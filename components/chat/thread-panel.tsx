'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useUi } from '@/hooks/use-ui';
import { useConversation, useMe, useMembers, useSidebar, useThread } from '@/hooks/use-chat-data';
import { useViewport } from '@/hooks/use-viewport';
import { sendReply, toggleReaction } from '@/lib/client/chat-actions';
import { channelTitle, colorFor, dayTime } from '@/lib/client/format';
import { RichText, splitCode } from '@/lib/client/rich-text';
import type { Message } from '@/lib/client/types';
import { IconButton } from '@/components/ui/modal';
import {
  AtIcon, BoldIcon, CloseIcon, CodeIcon, ItalicIcon, LinkIcon, OlIcon, PlusIcon, QuoteIcon,
  SendIcon, SmileIcon, StrikeIcon, UlIcon, UnderlineIcon,
} from '@/components/ui/icons';
import { hoverCardTimers } from './overlays';
import { CodeBlock, Files, openPicker } from './message-item';

export function ThreadPanel() {
  const threadId = useUi((s) => s.threadId);
  const { desktop, mobile } = useViewport();
  if (threadId == null) return null;
  return (
    <aside
      className="top-0 right-0 bottom-0 z-40 flex min-h-0 flex-col border-l border-line bg-bg"
      style={
        desktop
          ? { flex: '0 1 440px', minWidth: 300, position: 'relative', width: 'auto' }
          : { flex: 'none', minWidth: 0, position: 'absolute', width: mobile ? '100%' : 'min(440px, 100%)', boxShadow: '-20px 0 40px rgba(0,0,0,.5)' }
      }
    >
      <Thread key={threadId} rootId={threadId} />
    </aside>
  );
}

/** "# general" for channels, the other people's names for DMs. */
function useConversationTitle(id: string | null) {
  const { data: conv } = useConversation(id);
  const { data: sidebar } = useSidebar();
  const { byId } = useMembers();
  if (!conv) return '';
  if (conv.kind === 'dm' || conv.kind === 'group_dm') {
    const item = sidebar?.direct_messages.find((d) => d.id === conv.id);
    return (item?.other_user_ids ?? []).map((u) => byId.get(u)?.user.display_name).filter(Boolean).join(', ') || conv.name || '';
  }
  return channelTitle(conv);
}

function Thread({ rootId }: { rootId: number }) {
  const { data } = useThread(rootId);
  const fallbackConv = useUi((s) => s.conversationId);
  const title = useConversationTitle(data?.root.conversation_id ?? fallbackConv);
  const [text, setText] = useState('');
  const [alsoSend, setAlsoSend] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const replies = data?.replies ?? [];

  useEffect(() => { inputRef.current?.focus(); }, []);
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [replies.length]);

  const close = () => useUi.getState().set({ threadId: null, picker: null });

  const wrap = (mk: string) => {
    const el = inputRef.current;
    const a = el ? el.selectionStart : text.length, b = el ? el.selectionEnd : text.length;
    setText(text.slice(0, a) + mk + text.slice(a, b) + mk + text.slice(b));
    requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(a + mk.length, b + mk.length); });
  };

  const send = async () => {
    const body = text.trim();
    if (!body) return;
    setText('');
    try {
      await sendReply(rootId, body, alsoSend);
    } catch {
      setText(body);
    }
  };

  return (
    <>
      <div className="flex h-14 flex-none items-center justify-between border-b border-line pr-3 pl-5">
        <div className="flex min-w-0 items-baseline gap-2.5">
          <span className="text-lg font-black">Thread</span>
          <span className="truncate text-[13px] whitespace-nowrap text-mute">{title}</span>
        </div>
        <IconButton onClick={close} title="Close"><CloseIcon className="text-txt2" /></IconButton>
      </div>
      <div ref={scrollRef} className="flex-1 overflow-y-auto pt-5 pb-6">
        {data && (
          <>
            <div className="px-5 pb-4">
              <ThreadMessage msg={data.root} pickerKey={`t-${data.root.id}`} head="mb-1" />
            </div>
            <div className="flex items-center gap-3 px-5 pt-1 pb-2">
              <span className="text-[13px] text-mute">{replies.length === 1 ? '1 reply' : `${replies.length} replies`}</span>
              <div className="h-px flex-1 bg-line" />
            </div>
            {replies.map((r) => (
              <div key={r.id} className="px-5 py-2 hover:bg-hover">
                <ThreadMessage msg={r} pickerKey={`r-${data.root.id}-${r.id}`} head="mb-0.5" />
              </div>
            ))}
          </>
        )}
        <div className="px-5 pt-4">
          <div className="rounded-[10px] border border-line3 bg-hover">
            <div className="flex items-center gap-0.5 px-2 py-1.5">
              <Tool onFormat={() => wrap('*')}><BoldIcon size={17} /></Tool>
              <Tool onFormat={() => wrap('_')}><ItalicIcon size={17} /></Tool>
              <Tool><UnderlineIcon size={17} /></Tool>
              <Tool onFormat={() => wrap('~')}><StrikeIcon size={17} /></Tool>
              <Sep />
              <Tool><LinkIcon size={17} /></Tool>
              <Tool><OlIcon size={17} /></Tool>
              <Tool><UlIcon size={17} /></Tool>
              <Sep />
              <Tool><QuoteIcon size={17} /></Tool>
              <Tool onFormat={() => wrap('`')}><CodeIcon size={17} /></Tool>
              <Tool>
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M10 9.5 8 12l2 2.5M14 9.5l2 2.5-2 2.5" /><rect x="3" y="3" width="18" height="18" rx="2" />
                </svg>
              </Tool>
            </div>
            <textarea
              ref={inputRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
              }}
              rows={2}
              placeholder="Reply…"
              className="block w-full resize-none border-0 bg-transparent px-3.5 py-2 text-base leading-normal text-txt outline-none"
            />
            <label className="flex cursor-pointer items-center gap-2.5 px-3.5 pt-1 pb-2 text-[13px] text-mute">
              <input
                type="checkbox"
                checked={alsoSend}
                onChange={() => setAlsoSend(!alsoSend)}
                className="m-0 size-4 accent-[#7c3aed] outline-none"
              />
              <span>Also send to <strong className="text-txt2">{title}</strong></span>
            </label>
            <div className="flex items-center gap-1 px-2 pt-1 pb-2">
              <span className="flex size-[30px] cursor-pointer items-center justify-center rounded-full bg-line text-txt3 hover:bg-line3">
                <PlusIcon size={16} strokeWidth={2.2} />
              </span>
              <span className="flex size-[30px] cursor-pointer items-center justify-center rounded-md text-sm text-mute underline hover:bg-line hover:text-txt">Aa</span>
              <Tool><SmileIcon size={17} /></Tool>
              <Tool><AtIcon size={17} /></Tool>
              <Tool>
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" />
                </svg>
              </Tool>
              <div className="flex-1" />
              <button
                onClick={send}
                title="Send"
                className="flex h-[30px] w-[34px] cursor-pointer items-center justify-center rounded-md border-0 text-white outline-none"
                style={{ background: text.trim() ? '#7c3aed' : 'var(--line3)' }}
              >
                <SendIcon />
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function Tool({ onFormat, children }: { onFormat?: () => void; children: ReactNode }) {
  return (
    <span
      onMouseDown={onFormat && ((e) => e.preventDefault())}
      onClick={onFormat}
      className="flex size-[30px] cursor-pointer items-center justify-center rounded-md text-mute hover:bg-line hover:text-txt"
    >
      {children}
    </span>
  );
}

const Sep = () => <span className="mx-1 h-[18px] w-px bg-line3" />;

function ThreadMessage({ msg, pickerKey, head }: { msg: Message; pickerKey: string; head: string }) {
  const { data: members } = useMembers();
  const { data: me } = useMe();
  const people = useMemo(() => members?.members.map((m) => m.user) ?? [], [members]);
  const { text, code, lang } = splitCode(msg.body);
  const openProfile = (id: string) => useUi.getState().openProfile(id);
  const deleted = !!msg.deleted_at;

  return (
    <>
      <div className={`flex items-baseline gap-2 ${head}`}>
        <span
          onClick={() => openProfile(msg.user_id)}
          onMouseEnter={(e) => hoverCardTimers.show(msg.user_id, e.currentTarget.getBoundingClientRect())}
          onMouseLeave={hoverCardTimers.hide}
          className="cursor-pointer text-base font-black hover:underline"
          style={{ color: colorFor(msg.user_id) }}
        >
          {msg.author.display_name}
        </span>
        {msg.author.is_bot && (
          <span className="rounded border border-line bg-hover px-[5px] py-px align-[2px] text-[11px] font-bold tracking-[.04em] text-mute">BOT</span>
        )}
        <span className="text-xs text-mute">{dayTime(msg.created_at)}</span>
      </div>
      {deleted ? (
        <div className="text-base leading-[1.6] text-mute italic">This message was deleted.</div>
      ) : (
        <>
          {text && (
            <div className="text-base leading-[1.6] text-pretty whitespace-pre-wrap text-txt2">
              <RichText text={text} people={people} meId={me?.id ?? null} onProfile={openProfile} />
            </div>
          )}
          {code != null && <CodeBlock code={code} lang={lang} />}
          {msg.files.length > 0 && <Files files={msg.files} authorId={msg.user_id} createdAt={msg.created_at} />}
          <div className="mt-2 flex flex-wrap gap-1.5">
            {msg.reactions.map((r) => (
              <button
                key={r.emoji}
                onClick={() => toggleReaction(msg, r.emoji)}
                className="flex h-7 cursor-pointer items-center gap-1.5 rounded-full border px-2.5 text-[13px] text-white outline-none"
                style={{ background: r.mine ? 'rgba(124,58,237,.85)' : 'var(--line)', borderColor: r.mine ? '#7c3aed' : 'var(--line)' }}
              >
                <span className="text-[15px] leading-none">{r.emoji}</span><span>{r.count}</span>
              </button>
            ))}
            <button
              onClick={(e) => openPicker(e, pickerKey, (em) => toggleReaction(msg, em))}
              title="Add reaction"
              className="flex h-7 w-[38px] cursor-pointer items-center justify-center rounded-full border border-line bg-hover text-txt3 outline-none hover:border-mute2"
            >
              <SmileIcon size={15} />
            </button>
          </div>
        </>
      )}
    </>
  );
}
