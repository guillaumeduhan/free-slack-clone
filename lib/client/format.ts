/** Formatting helpers shared by the chat UI (values follow the Team Chat design). */

/** "Sarah Chen" → "SC". */
export const initials = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join('') || '?';

// Avatar / name colors from the design.
const PALETTE = ['#0090ff', '#d6409f', '#30a46c', '#f76b15', '#8e4ec6', '#12a594', '#e5484d', '#f5a524', '#3e63dd', '#0d9488', '#7c3aed', '#d97706', '#e93d82', '#46a758', '#ab4aba'];

/** Stable color per user id. */
export function colorFor(id: string | null | undefined) {
  if (!id) return '#63646c';
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

/** 9:05 AM */
export const fmtTime = (iso: string | Date) => {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  let h = d.getHours();
  const ap = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${String(d.getMinutes()).padStart(2, '0')} ${ap}`;
};

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

/** "Today", "Yesterday", "Tuesday, September 29" */
export function dayLabel(iso: string) {
  const d = new Date(iso);
  const diff = Math.round((startOfDay(new Date()) - startOfDay(d)) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', ...(d.getFullYear() !== new Date().getFullYear() && { year: 'numeric' }) });
}

export const sameDay = (a: string, b: string) => startOfDay(new Date(a)) === startOfDay(new Date(b));

/** "Today at 9:05 AM" */
export const dayTime = (iso: string) => `${dayLabel(iso)} at ${fmtTime(iso)}`;

/** Local time of a timezone, e.g. "4:12 PM". */
export function localTime(timezone: string | null | undefined) {
  try {
    return new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: timezone || undefined });
  } catch {
    return fmtTime(new Date());
  }
}

/** Considered online when seen in the last 5 minutes. */
export const isOnline = (u: { last_seen_at: string | null; is_bot?: boolean } | null | undefined) =>
  !!u && (u.is_bot || (!!u.last_seen_at && Date.now() - new Date(u.last_seen_at).getTime() < 5 * 60_000));

export const EXT_COLOR: Record<string, string> = {
  PDF: '#e5484d', ZIP: '#d97706', CSV: '#30a46c', XLSX: '#30a46c', DOC: '#0090ff', DOCX: '#0090ff', FIG: '#8e4ec6',
  TXT: '#63646c', PNG: '#12a594', JPG: '#12a594', JPEG: '#12a594', GIF: '#12a594', WEBP: '#12a594', SVG: '#12a594',
  MP4: '#3e63dd', WEBM: '#3e63dd', M4A: '#ab4aba', OGG: '#ab4aba',
};
export const extOf = (n: string) => (n.includes('.') ? n.split('.').pop()! : 'FILE').toUpperCase().slice(0, 4);
export const extColor = (n: string) => EXT_COLOR[extOf(n)] ?? '#63646c';
export const isImage = (mime: string) => /^image\/(png|jpe?g|gif|webp|avif)$/.test(mime);
export const fmtSize = (b: number) => (b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

export const KIND_COLORS: Record<string, [string, string]> = {
  app: ['#a78bfa', 'rgba(124,58,237,.16)'],
  agent: ['#2dd4bf', 'rgba(20,184,166,.16)'],
  bot: ['#fbbf24', 'rgba(217,119,6,.18)'],
};
export const APP_COLORS = ['#7c3aed', '#0d9488', '#e5484d', '#0090ff', '#d97706', '#e93d82', '#46a758'];

export const QUICK_REACTIONS = ['✅', '👀', '🙌'];
export const EMOJIS = ['👍', '❤️', '😂', '🎉', '🙏', '🔥', '👀', '✅', '🙌', '💯', '🚀', '😍', '🤔', '😅', '👏', '😮', '😢', '💡', '📌', '⭐', '👋', '🤝', '🥳', '❌'];

/** "# general", "◦ hiring" (private) */
export const channelTitle = (c: { kind: string; name: string | null }) =>
  `${c.kind === 'private_channel' ? '◦' : '#'} ${c.name ?? ''}`;
export const channelLabel = (c: { kind: string; name: string | null }) =>
  `${c.kind === 'private_channel' ? '🔒' : '#'} ${c.name ?? ''}`;
