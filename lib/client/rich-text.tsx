import type { CSSProperties, ReactNode } from 'react';

/**
 * Message text rendering from the Team Chat design:
 * @mentions, links, [label](url), *bold*, _italic_, ~strike~, `code`, ++underline++, > quotes,
 * plus ``` fenced code blocks (split out and highlighted).
 */

const LOUD = '#f2c744';
const MENTION = '#5bb8f5';

type Seg = { t: string; style?: CSSProperties; onClick?: (e: React.MouseEvent) => void; className?: string };

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function markdown(t: string): Seg[] {
  const out: Seg[] = [];
  const re = /\*\*?([^*\n]+)\*\*?|_([^_\n]+)_|~([^~\n]+)~|`([^`\n]+)`|\+\+([^+\n]+)\+\+|(?:^|\n)> ?([^\n]*)/g;
  let x: RegExpExecArray | null;
  let l = 0;
  while ((x = re.exec(t))) {
    if (x.index > l) out.push({ t: t.slice(l, x.index) });
    if (x[1]) out.push({ t: x[1], style: { fontWeight: 900 } });
    else if (x[2]) out.push({ t: x[2], style: { fontStyle: 'italic' } });
    else if (x[3]) out.push({ t: x[3], style: { textDecoration: 'line-through' } });
    else if (x[5]) out.push({ t: x[5], style: { textDecoration: 'underline' } });
    else if (x[6] != null) {
      if (x[0][0] === '\n') out.push({ t: '\n' });
      out.push({ t: x[6] || ' ', style: { color: 'var(--txt3)', padding: '0 0 0 12px', boxShadow: 'inset 3px 0 0 var(--line3)', display: 'inline-block' } });
    } else {
      out.push({
        t: x[4],
        style: { fontFamily: 'var(--font-geist-mono), monospace', fontSize: '0.88em', color: '#ff9a8a', background: 'var(--hover)', padding: '1px 5px', border: '1px solid var(--line)', borderRadius: 4 },
      });
    }
    l = re.lastIndex;
  }
  if (l < t.length) out.push({ t: t.slice(l) });
  return out;
}

export type MentionTarget = { id: string; display_name: string };

type Options = {
  people: MentionTarget[];
  meId: string | null;
  onProfile?: (userId: string, e: React.MouseEvent) => void;
};

function segments(text: string, { people, meId, onProfile }: Options): Seg[] {
  const names = people.map((p) => p.display_name).filter(Boolean).sort((a, b) => b.length - a.length);
  const byName = new Map(people.map((p) => [p.display_name, p.id]));
  const re = new RegExp(
    `(@(?:channel|here${names.length ? '|' + names.map(esc).join('|') : ''}))|(\\[([^\\]]+)\\]\\(((?:https?:\\/\\/)?[^)\\s]+)\\))|((?:https?:\\/\\/)?(?:[\\w-]+\\.)+(?:com|co|io|dev|chat|org|net|app|fr|test)(?:\\/[^\\s]*)?)`,
    'g',
  );
  const open = (url: string) => (e: React.MouseEvent) => {
    e.stopPropagation();
    window.open(/^https?:\/\//.test(url) ? url : `https://${url}`, '_blank', 'noopener,noreferrer');
  };
  const out: Seg[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(...markdown(text.slice(last, m.index)));
    if (m[1]) {
      const name = m[1].slice(1);
      const id = byName.get(name);
      const loud = name === 'channel' || name === 'here' || (!!id && id === meId);
      out.push({
        t: m[1],
        style: { color: loud ? LOUD : MENTION, background: loud ? 'rgba(242,199,68,.16)' : 'rgba(29,155,209,.18)', padding: '1px 3px', borderRadius: 4, cursor: id ? 'pointer' : 'default' },
        onClick: id && onProfile ? (e) => onProfile(id, e) : undefined,
      });
    } else if (m[2]) {
      out.push({ t: m[3], style: { color: MENTION, textDecoration: 'underline', cursor: 'pointer' }, onClick: open(m[4]) });
    } else {
      out.push({ t: `🔗 ${m[5]}`, style: { color: MENTION, background: 'rgba(29,155,209,.12)', padding: '1px 4px', borderRadius: 4, cursor: 'pointer' }, onClick: open(m[5]) });
    }
    last = re.lastIndex;
  }
  if (last < text.length) out.push(...markdown(text.slice(last)));
  return out;
}

export function RichText({ text, ...opts }: { text: string } & Options): ReactNode {
  return segments(text, opts).map((s, i) => (
    <span key={i} style={s.style} onClick={s.onClick}>{s.t}</span>
  ));
}

/** Splits the first ``` fenced block out of a message body. */
export function splitCode(body: string): { text: string; code: string | null; lang: string } {
  const m = body.match(/```([\w+-]*)\n?([\s\S]*?)\n?```/);
  if (!m) return { text: body, code: null, lang: '' };
  return { text: body.replace(m[0], '').trim(), code: m[2], lang: m[1] || 'text' };
}

// ---------------------------------------------------------------------
// Code highlighting (same palette as the design)
// ---------------------------------------------------------------------
const KW = new Set(['export', 'const', 'let', 'var', 'async', 'await', 'function', 'return', 'import', 'from', 'if', 'else', 'new', 'type', 'interface', 'default', 'true', 'false', 'null', 'undefined', 'select', 'from', 'where', 'insert', 'update', 'delete', 'def', 'class']);
const TC = { kw: '#c586f5', str: '#7ee0a1', num: '#ffb86b', com: '#6b7280', fn: '#6cb6ff', type: '#ffd36b', punc: 'var(--mute)', plain: 'var(--txt2)' };

export function tokenize(line: string) {
  const out: { t: string; c: string }[] = [];
  const re = /(\/\/.*$|#.*$|--.*$)|('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|`[^`]*`)|(\b\d+(?:\.\d+)?\b)|([A-Za-z_$][\w$]*)|(\s+)|([^\sA-Za-z_$\d'"`]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line))) {
    let c = TC.plain;
    if (m[1]) c = TC.com;
    else if (m[2]) c = TC.str;
    else if (m[3]) c = TC.num;
    else if (m[4]) {
      const rest = line.slice(re.lastIndex);
      c = KW.has(m[4]) ? TC.kw : /^[A-Z]/.test(m[4]) ? TC.type : /^\s*\(/.test(rest) ? TC.fn : TC.plain;
    } else if (m[6]) c = TC.punc;
    out.push({ t: m[0], c });
  }
  return out.length ? out : [{ t: ' ', c: TC.plain }];
}

// ---------------------------------------------------------------------
// Composer overlay: shows markers dimmed and mentions highlighted while typing
// ---------------------------------------------------------------------
export function draftTokens(text: string, names: string[], meName: string | null) {
  const out: { t: string; style?: CSSProperties }[] = [];
  const dim: CSSProperties = { color: 'var(--mute2)' };
  const sorted = [...names].sort((a, b) => b.length - a.length).map(esc);
  const re = new RegExp(
    `(\\*\\*?)([^*\\n]+)\\1|_([^_\\n]+)_|~([^~\\n]+)~|\`([^\`\\n]+)\`|\\+\\+([^+\\n]+)\\+\\+|(@(?:channel|here${sorted.length ? '|' + sorted.join('|') : ''}))|(^|\\n)(> ?)([^\\n]*)`,
    'g',
  );
  let m: RegExpExecArray | null;
  let l = 0;
  const P = (t: string, style?: CSSProperties) => out.push({ t, style });
  while ((m = re.exec(text))) {
    if (m.index > l) P(text.slice(l, m.index));
    if (m[2] != null) { P(m[1], dim); P(m[2], { textShadow: '0.55px 0 0 currentColor' }); P(m[1], dim); }
    else if (m[3] != null) { P('_', dim); P(m[3], { fontStyle: 'italic' }); P('_', dim); }
    else if (m[4] != null) { P('~', dim); P(m[4], { textDecoration: 'line-through' }); P('~', dim); }
    else if (m[5] != null) { P('`', dim); P(m[5], { color: '#ff9a8a', background: 'var(--hover)' }); P('`', dim); }
    else if (m[6] != null) { P('++', dim); P(m[6], { textDecoration: 'underline' }); P('++', dim); }
    else if (m[7] != null) {
      const loud = m[7] === `@${meName}` || m[7] === '@channel' || m[7] === '@here';
      P(m[7], { color: loud ? LOUD : MENTION, background: loud ? 'rgba(242,199,68,.16)' : 'rgba(29,155,209,.18)', borderRadius: 3 });
    } else if (m[9] != null) { if (m[8]) P(m[8]); P(m[9], dim); P(m[10], { color: 'var(--txt3)' }); }
    l = re.lastIndex;
  }
  if (l < text.length) P(text.slice(l));
  P('​');
  return out;
}
