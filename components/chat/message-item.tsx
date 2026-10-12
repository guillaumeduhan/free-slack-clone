'use client';

import { memo, useState } from 'react';
import { useUi } from '@/hooks/use-ui';
import { colorFor, extColor, extOf, fmtSize, fmtTime, initials, isImage, QUICK_REACTIONS } from '@/lib/client/format';
import { RichText, splitCode, tokenize, type MentionTarget } from '@/lib/client/rich-text';
import { toggleReaction, toggleSaved } from '@/lib/client/chat-actions';
import type { FileInfo, Message } from '@/lib/client/types';

import {
  BookmarkIcon, ChevronDownIcon, CopyIcon, DownloadIcon, ForwardIcon, PlayIcon, ReplyIcon, SmileIcon, TrashIcon,
} from '@/components/ui/icons';
import { hoverCardTimers } from './overlays';

type Props = {
  msg: Message;
  showHead: boolean;
  dayLabel: string | null;
  isNew: boolean;
  newDivider: boolean;
  people: MentionTarget[];
  meId: string;
  authorName: string;
};

const PICKER_H = 170;

/** Opens the shared reaction picker below (or above) the clicked button. */
export function openPicker(e: React.MouseEvent, key: string, onPick: (emoji: string) => void, alignRight = false) {
  e.stopPropagation();
  const r = e.currentTarget.getBoundingClientRect();
  const top = r.bottom + 6 + PICKER_H > window.innerHeight ? r.top - PICKER_H - 6 : r.bottom + 6;
  const left = Math.max(8, Math.min(window.innerWidth - 304, alignRight ? r.right - 296 : r.left));
  const s = useUi.getState();
  s.set({ picker: s.picker?.key === key ? null : { key, top, left, onPick } });
}

export const MessageItem = memo(function MessageItem({ msg, showHead, dayLabel, isNew, newDivider, people, meId, authorName }: Props) {
  const [hovered, setHovered] = useState(false);
  const pickerOpen = useUi((s) => s.picker?.key === `m-${msg.id}`);
  const set = useUi((s) => s.set);
  const { text, code, lang } = splitCode(msg.body);
  const mine = msg.user_id === meId;
  const time = fmtTime(msg.created_at);
  const openProfile = (id: string) => useUi.getState().openProfile(id);
  const react = (emoji: string) => toggleReaction(msg, emoji);
  const openThread = () => set({ threadId: msg.parent_id ?? msg.id, picker: null });

  return (
    <div>
      {newDivider && (
        <div className="flex items-center gap-2.5 px-5 pt-1.5 pb-0.5">
          <div className="h-px flex-1 bg-danger" />
          <span className="text-xs font-black tracking-[.02em] text-danger-text">New</span>
        </div>
      )}
      {dayLabel && (
        <div className="flex items-center gap-3 px-5 py-2">
          <div className="h-px flex-1 bg-line" />
          <span className="flex items-center gap-1.5 rounded-full border border-line3 bg-bg px-3.5 py-[5px] text-sm font-bold text-txt2">
            {dayLabel}
            <ChevronDownIcon size={12} strokeWidth={2.6} />
          </span>
          <div className="h-px flex-1 bg-line" />
        </div>
      )}
      <div
        onContextMenu={(e) => {
          e.preventDefault();
          set({
            ctx: { section: 'msg', messageId: msg.id, conversationId: msg.conversation_id, x: Math.min(e.clientX, window.innerWidth - 270), y: Math.min(e.clientY, window.innerHeight - 220) },
          });
          setHovered(false);
        }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        className="relative flex items-baseline gap-3.5 transition-[background,box-shadow] duration-[1200ms] hover:bg-hover"
        style={{
          padding: showHead ? '4px 20px 2px 4px' : '0 20px 2px 4px',
          background: isNew ? 'rgba(124,58,237,.10)' : undefined,
          boxShadow: isNew ? 'inset 3px 0 0 #7c3aed' : 'none',
        }}
      >
        <div className="w-16 flex-none text-right text-[13px] leading-[1.6] whitespace-nowrap text-mute">
          {(showHead || hovered) && <span title={new Date(msg.created_at).toLocaleString()}>{time}</span>}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-base leading-[1.6] text-pretty whitespace-pre-wrap text-txt1">
            {showHead && (
              <>
                <span
                  onClick={() => openProfile(msg.user_id)}
                  onMouseEnter={(e) => hoverCardTimers.show(msg.user_id, e.currentTarget.getBoundingClientRect())}
                  onMouseLeave={() => hoverCardTimers.hide()}
                  className="mr-2 cursor-pointer font-black hover:underline"
                  style={{ color: colorFor(msg.user_id) }}
                >
                  {authorName}
                </span>
                {msg.author.is_bot && (
                  <span className="mr-2 rounded border border-line bg-hover px-[5px] py-px align-[2px] text-[11px] font-bold tracking-[.04em] text-mute">BOT</span>
                )}
              </>
            )}
            {msg.deleted_at ? (
              <span className="text-mute italic">This message was deleted.</span>
            ) : (
              <RichText text={text} people={people} meId={meId} onProfile={openProfile} />
            )}
            {msg.edited_at && !msg.deleted_at && <span className="ml-1 text-xs text-mute">(edited)</span>}
            {msg.saved && <span className="ml-2 text-xs font-bold text-[#f5a524]">Saved</span>}
          </div>

          {code != null && <CodeBlock code={code} lang={lang} />}
          {msg.files.length > 0 && <Files files={msg.files} authorId={msg.user_id} createdAt={msg.created_at} />}

          {msg.reactions.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {msg.reactions.map((r) => (
                <button
                  key={r.emoji}
                  onClick={() => react(r.emoji)}
                  className="flex h-[26px] cursor-pointer items-center gap-1.5 rounded-full border px-[9px] text-xs outline-none"
                  style={{
                    background: r.mine ? 'rgba(124,58,237,.18)' : 'var(--hover)',
                    color: r.mine ? 'var(--accent-text)' : 'var(--txt2)',
                    borderColor: r.mine ? '#7c3aed' : 'var(--line)',
                  }}
                >
                  <span className="text-[15px] leading-none">{r.emoji}</span>
                  <span className="font-mono text-[11px]">{r.count}</span>
                </button>
              ))}
              <button
                onClick={(e) => openPicker(e, `m-${msg.id}`, react)}
                title="Add reaction"
                className="flex h-[26px] w-[34px] cursor-pointer items-center justify-center rounded-full border border-line bg-hover outline-none hover:border-mute2"
              >
                <SmileIcon size={15} className="text-txt3" />
              </button>
            </div>
          )}

          {msg.reply_count > 0 && !msg.parent_id && (
            <div
              onClick={openThread}
              className="mt-1.5 inline-flex max-w-full cursor-pointer flex-wrap items-center gap-2 rounded-lg border border-transparent py-1 pr-2.5 pl-1 hover:border-line hover:bg-bg"
            >
              <div className="flex gap-1">
                {msg.reply_users.slice(0, 3).map((id) => {
                  const p = people.find((x) => x.id === id);
                  return (
                    <div key={id} className="flex size-[26px] items-center justify-center rounded-md text-[10px] font-bold text-white" style={{ background: colorFor(id) }}>
                      {initials(p?.display_name ?? '?')}
                    </div>
                  );
                })}
              </div>
              <span className="ml-1 text-[15px] font-bold whitespace-nowrap text-[#a78bfa]">
                {msg.reply_count} {msg.reply_count > 1 ? 'replies' : 'reply'}
              </span>
              {msg.last_reply_at && <span className="text-[13px] whitespace-nowrap text-mute">Last reply at {fmtTime(msg.last_reply_at)}</span>}
            </div>
          )}
        </div>

        {(hovered || pickerOpen) && !msg.deleted_at && (
          <div className="absolute -top-3.5 right-5 flex gap-0.5 rounded-lg border border-line3 bg-hover p-0.5 shadow-[0_4px_12px_rgba(0,0,0,.4)]">
            {QUICK_REACTIONS.map((e) => (
              <button key={e} onClick={() => react(e)} title={e} className="size-[30px] cursor-pointer rounded border-0 bg-transparent text-base leading-none outline-none hover:bg-line">
                {e}
              </button>
            ))}
            <ToolbarButton size={30} title="Add reaction" onClick={(e) => openPicker(e, `m-${msg.id}`, react, true)}>
              <SmileIcon size={15} className="text-txt3" />
            </ToolbarButton>
            <ToolbarButton title="Reply to thread" onClick={openThread}><ReplyIcon size={17} className="text-txt3" /></ToolbarButton>
            <ToolbarButton title="Forward message" onClick={() => set({ modal: 'forward', forwardText: forwardBody(authorName, msg.body) })}>
              <ForwardIcon size={17} className="text-txt3" />
            </ToolbarButton>
            <ToolbarButton title={msg.saved ? 'Remove from saved' : 'Save for later'} onClick={() => toggleSaved(msg)}>
              <BookmarkIcon size={17} style={{ fill: msg.saved ? '#f5a524' : 'none', color: msg.saved ? '#f5a524' : 'var(--txt3)' }} />
            </ToolbarButton>
            {mine && (
              <ToolbarButton title="Delete message" danger onClick={() => { set({ deleteTarget: msg.id }); setHovered(false); }}>
                <TrashIcon size={17} />
              </ToolbarButton>
            )}
          </div>
        )}
      </div>
    </div>
  );
});

const forwardBody = (author: string, body: string) =>
  `> ${author}: ${body.split('\n').join('\n> ')}`;

function ToolbarButton({ size = 32, danger, title, onClick, children }: {
  size?: number; danger?: boolean; title: string; onClick: (e: React.MouseEvent) => void; children: React.ReactNode;
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      className={`flex cursor-pointer items-center justify-center border-0 bg-transparent outline-none ${size === 30 ? 'rounded' : 'rounded-md'} ${danger ? 'text-txt3 hover:bg-danger/15 hover:text-danger-text' : 'hover:bg-line'}`}
      style={{ width: size, height: size }}
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Code block with line numbers, highlighting and Copy
// ---------------------------------------------------------------------------
export function CodeBlock({ code, lang }: { code: string; lang: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="mt-2 max-w-[720px] overflow-hidden rounded-lg border border-line bg-rail">
      <div className="flex h-[34px] items-center justify-between border-b border-line2 bg-sub pr-2 pl-3.5">
        <span className="font-mono text-xs text-mute">{lang || 'text'}</span>
        <button
          onClick={() => {
            navigator.clipboard?.writeText(code).catch(() => {});
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
          className="flex h-[26px] cursor-pointer items-center gap-1.5 rounded border-0 bg-transparent px-2 text-xs font-bold text-mute outline-none hover:bg-line hover:text-txt"
        >
          <CopyIcon size={13} />
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <div className="overflow-x-auto py-3 font-mono text-[13px] leading-[1.7]">
        {code.split('\n').map((line, i) => (
          <div key={i} className="flex whitespace-pre">
            <span className="w-11 flex-none pr-3.5 text-right text-line3 select-none">{i + 1}</span>
            <span className="pr-4">
              {tokenize(line).map((t, j) => <span key={j} style={{ color: t.c }}>{t.t}</span>)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Attachments: image grid (lightbox) + document tiles, collapsible when > 1
// ---------------------------------------------------------------------------
export function Files({ files, authorId, createdAt }: { files: FileInfo[]; authorId: string; createdAt: string }) {
  const [open, setOpen] = useState(true);
  const images = files.filter((f) => isImage(f.mime_type));
  const docs = files.filter((f) => !isImage(f.mime_type));
  const media = (f: FileInfo) => /^(video|audio)\//.test(f.mime_type);

  return (
    <div className="mt-2 flex flex-col gap-2">
      {files.length > 1 && (
        <div className="flex items-center gap-2.5 text-sm text-mute">
          <span onClick={() => setOpen(!open)} className="flex cursor-pointer items-center gap-1.5 hover:text-txt">
            {files.length} files
            <PlayIcon size={10} className="transition-transform duration-150" style={{ transform: `rotate(${open ? 90 : 0}deg)` }} />
          </span>
          <span className="h-3.5 w-px bg-line3" />
          <span
            onClick={() => files.forEach((f) => { const a = document.createElement('a'); a.href = `${f.url}?download`; a.download = f.name; a.click(); })}
            className="flex cursor-pointer items-center gap-1.5 hover:text-txt"
          >
            <DownloadIcon size={14} />Download all
          </span>
        </div>
      )}
      {open && (
        <>
          {images.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {images.map((f, i) => (
                <div
                  key={f.id}
                  title={f.name}
                  onClick={() => useUi.getState().set({ lightbox: { files: images, index: i, authorId, createdAt } })}
                  className="relative max-w-full cursor-zoom-in overflow-hidden rounded-lg border border-line bg-hover hover:border-line3"
                  style={{ width: images.length > 1 ? 220 : 360, height: images.length > 1 ? 150 : 230 }}
                >
                  <div role="img" aria-label={f.name} className="size-full bg-cover bg-top" style={{ backgroundImage: `url(${f.url})` }} />
                </div>
              ))}
            </div>
          )}
          {docs.map((f) =>
            media(f) ? (
              <div key={f.id} className="w-[min(360px,100%)] overflow-hidden rounded-lg border border-line bg-bg">
                {f.mime_type.startsWith('video/') ? (
                  <video src={f.url} controls className="block max-h-[240px] w-full bg-black" />
                ) : (
                  <audio src={f.url} controls className="block w-full" />
                )}
                <div className="truncate px-3 py-1.5 text-xs text-mute">{f.name} · {fmtSize(f.size_bytes)}</div>
              </div>
            ) : (
              <div key={f.id} className="flex w-[min(340px,100%)] items-center gap-3 rounded-lg border border-line bg-bg px-3 py-2.5">
                <div className="flex size-[38px] flex-none items-center justify-center rounded-md text-[10px] font-black tracking-[.04em] text-white" style={{ background: extColor(f.name) }}>
                  {extOf(f.name)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-bold">{f.name}</div>
                  <div className="text-xs text-mute">{fmtSize(f.size_bytes)} · {extOf(f.name)}</div>
                </div>
                <a href={`${f.url}?download`} download={f.name} title="Download"
                  className="flex size-[30px] flex-none items-center justify-center rounded-md text-mute outline-none hover:bg-hover hover:text-txt">
                  <DownloadIcon size={16} />
                </a>
              </div>
            ),
          )}
        </>
      )}
    </div>
  );
}

