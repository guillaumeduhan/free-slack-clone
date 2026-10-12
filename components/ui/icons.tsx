import type { SVGProps } from 'react';

/** Icons from the Team Chat design (24×24, stroke = currentColor). */
type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Icon({ size = 18, strokeWidth = 2, children, ...rest }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden {...rest}>
      {children}
    </svg>
  );
}

const make = (paths: React.ReactNode, defaults: Partial<IconProps> = {}) => {
  const C = (p: IconProps) => <Icon {...defaults} {...p}>{paths}</Icon>;
  return C;
};

export const SunIcon = make(<><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>);
export const MoonIcon = make(<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />);
export const LockIcon = make(<><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></>);
export const MailIcon = make(<><rect x="2" y="4" width="20" height="16" rx="2" /><path d="m22 7-10 6L2 7" /></>);
export const ShieldIcon = make(<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />);
export const DndIcon = make(<><path d="M20.5 13.5A8.5 8.5 0 1 1 10.5 3.5" /><path d="M14 3h6l-6 7h6" /></>, { strokeWidth: 2.2 });
export const ChevronDownIcon = make(<path d="m6 9 6 6 6-6" />);
export const ChevronUpIcon = make(<path d="m18 15-6-6-6 6" />);
export const ChevronLeftIcon = make(<path d="m15 18-6-6 6-6" />);
export const ChevronRightIcon = make(<path d="m9 18 6-6-6-6" />);
export const PenIcon = make(<><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></>);
export const SearchIcon = make(<><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>);
export const AtIcon = make(<><circle cx="12" cy="12" r="4" /><path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-4 8" /></>);
export const ThreadsIcon = make(<><path d="M14 9a2 2 0 0 1-2 2H6l-4 4V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2z" /><path d="M18 9h2a2 2 0 0 1 2 2v11l-4-4h-6a2 2 0 0 1-2-2v-1" /></>);
export const DraftIcon = make(<><path d="M14.5 4 20 9.5" /><path d="M3 21l1.5-5.5L16 4a2.1 2.1 0 0 1 3 0l1 1a2.1 2.1 0 0 1 0 3L8.5 19.5Z" /></>);
export const BellIcon = make(<><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0" /></>);
export const AppsIcon = make(<><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><path d="M17.5 14v7M14 17.5h7" /></>);
export const PlusIcon = make(<path d="M12 5v14M5 12h14" />, { strokeWidth: 2.4 });
export const HashIcon = make(<path d="M5 9h15M4 15h15M10 3 8 21M16 3l-2 18" />, { strokeWidth: 2.2 });
export const UsersIcon = make(<><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8" /></>);
export const CloseIcon = make(<path d="M18 6 6 18M6 6l12 12" />);
export const CopyIcon = make(<><rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></>);
export const DownloadIcon = make(<path d="M12 3v12M7 10l5 5 5-5M5 21h14" />);
export const SmileIcon = make(<><circle cx="12" cy="12" r="9" /><path d="M8.5 14.5s1.3 1.8 3.5 1.8 3.5-1.8 3.5-1.8M9 9.5h.01M15 9.5h.01" /></>);
export const ReplyIcon = make(<><path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" /><path d="M8 10h8M8 14h5" /></>);
export const ForwardIcon = make(<><path d="m15 14 5-5-5-5" /><path d="M20 9H9.5A5.5 5.5 0 0 0 4 14.5V20" /></>);
export const BookmarkIcon = make(<path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2Z" />);
export const TrashIcon = make(<path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6M14 11v6" />);
export const BoldIcon = make(<path d="M6 4h8a4 4 0 0 1 0 8H6zM6 12h9a4 4 0 0 1 0 8H6z" />);
export const ItalicIcon = make(<path d="M19 4h-9M14 20H5M15 4 9 20" />);
export const UnderlineIcon = make(<path d="M6 4v6a6 6 0 0 0 12 0V4M4 20h16" />);
export const StrikeIcon = make(<path d="M16 4H9a3 3 0 0 0-2.8 4M14 12a4 4 0 0 1 0 8H6M4 12h16" />);
export const LinkIcon = make(<><path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7" /><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" /></>);
export const OlIcon = make(<path d="M10 6h11M10 12h11M10 18h11M4 6h1v4M4 10h2M6 18H4c0-1 2-2 2-3s-1-1.5-2-1" />);
export const UlIcon = make(<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />);
export const QuoteIcon = make(<path d="M4 4v16M9 6h11M9 12h11M9 18h7" />);
export const CodeIcon = make(<path d="m16 18 6-6-6-6M8 6l-6 6 6 6" />);
export const CodeBlockIcon = make(<><path d="M10 9.5 8 12l2 2.5M14 9.5l2 2.5-2 2.5" /><path d="M14 3h5a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5" /></>);
export const VideoIcon = make(<><path d="m22 8-6 4 6 4V8Z" /><rect x="2" y="6" width="14" height="12" rx="2" /></>);
export const MicIcon = make(<><rect x="9" y="2" width="6" height="12" rx="3" /><path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v3" /></>);
export const SlashIcon = make(<><rect x="3" y="3" width="18" height="18" rx="3" /><path d="M15 7 9 17" /></>);
export const CheckSquareIcon = make(<><rect x="3" y="3" width="18" height="18" rx="3" /><path d="m8 12 3 3 5-6" /></>);
export const BrowseIcon = make(<><path d="M4 9h9M3 15h8M9 3 7 21M14 3l-1 7" /><circle cx="17.5" cy="16.5" r="3.5" /><path d="m20 19 2 2" /></>);
export const CollapseIcon = make(<path d="m7 15 5-5 5 5" />);
export const SettingsIcon = make(<><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" /></>);
export const InviteIcon = make(<><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M19 8v6M22 11h-6" /></>);
export const LogoutIcon = make(<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />);
export const SortIcon = make(<><path d="M3 6h11M3 12h8M3 18h5" /><path d="m17 8 3-3 3 3M20 5v14" /></>);
export const ClockIcon = make(<><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>);
export const MoreIcon = (p: IconProps) => (
  <svg width={p.size ?? 15} height={p.size ?? 15} viewBox="0 0 24 24" fill="currentColor" aria-hidden className={p.className}>
    <circle cx="5" cy="12" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="19" cy="12" r="1.6" />
  </svg>
);
export const SendIcon = (p: IconProps) => (
  <svg width={p.size ?? 16} height={p.size ?? 16} viewBox="0 0 24 24" fill="currentColor" aria-hidden className={p.className}>
    <path d="M3 20.5 21 12 3 3.5l2.5 8.5Z" />
  </svg>
);
export const PlayIcon = (p: IconProps) => (
  <svg width={p.size ?? 10} height={p.size ?? 10} viewBox="0 0 24 24" fill="currentColor" aria-hidden className={p.className} style={p.style}>
    <path d="M8 5v14l11-7z" />
  </svg>
);
