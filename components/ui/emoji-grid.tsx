import { EMOJIS } from '@/lib/client/format';

/** 8-column emoji grid used by reaction pickers and the composer. */
export function EmojiGrid({ onPick, keepFocus }: { onPick: (e: string) => void; keepFocus?: boolean }) {
  return (
    <div className="grid grid-cols-8 gap-0.5">
      {EMOJIS.map((e) => (
        <button
          key={e}
          onMouseDown={keepFocus ? (ev) => ev.preventDefault() : undefined}
          onClick={() => onPick(e)}
          className="h-8 cursor-pointer rounded-md border-0 bg-transparent text-[19px] leading-none outline-none hover:bg-line"
        >
          {e}
        </button>
      ))}
    </div>
  );
}

export const POPOVER = 'rounded-[10px] border border-line3 bg-hover shadow-[0_12px_32px_rgba(0,0,0,.5)]';
