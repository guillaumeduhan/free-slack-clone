'use client';

import { useUi } from '@/hooks/use-ui';
import { useMe, useWorkspaces } from '@/hooks/use-chat-data';
import { useDnd } from '@/hooks/use-dnd';
import { cn } from '@/lib/client/cn';
import { colorFor, initials } from '@/lib/client/format';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { DndIcon } from '@/components/ui/icons';

/** Workspace rail (desktop only): switcher, theme, do-not-disturb, my avatar. */
export function Rail() {
  const { data: workspaces } = useWorkspaces();
  const { data: me } = useMe();
  const workspaceId = useUi((s) => s.workspaceId);
  const set = useUi((s) => s.set);
  const { dnd } = useDnd();

  return (
    <div className="flex w-[60px] flex-none flex-col items-center gap-2 border-r border-line bg-rail py-3">
      {workspaces?.map((w) => {
        const active = w.id === workspaceId;
        const label = initials(w.name);
        return (
          <div
            key={w.id}
            title={w.name}
            onClick={() => !active && set({ workspaceId: w.id, conversationId: null, view: null, threadId: null })}
            className="flex size-9 cursor-pointer items-center justify-center rounded-lg border bg-cover bg-center font-bold"
            style={{
              borderColor: active ? 'var(--txt)' : 'var(--line)',
              background: w.logo_url ? `center / cover url(${w.logo_url})` : active ? 'var(--txt)' : 'var(--bg)',
              color: active ? 'var(--bg)' : 'var(--mute)',
              fontSize: label.length > 1 ? 13 : 15,
            }}
          >
            {w.logo_url ? '' : label}
          </div>
        );
      })}
      <div
        title="Add a workspace"
        onClick={() => set({ modal: 'workspace' })}
        className="flex size-9 cursor-pointer items-center justify-center rounded-lg border border-dashed border-line3 text-lg text-mute hover:border-mute hover:text-txt"
      >
        +
      </div>
      <div className="flex-1" />
      <ThemeToggle />
      <DndButton size={36} />
      {me && (
        <div className="relative">
          <div
            title="Your profile"
            onClick={() => useUi.getState().openProfile(me.id)}
            className="flex size-8 cursor-pointer items-center justify-center rounded-md text-xs font-medium text-white"
            style={{ background: colorFor(me.id) }}
          >
            {initials(me.display_name)}
          </div>
          {dnd ? (
            <div title="Notifications paused" className="absolute -right-[5px] -bottom-[5px] flex size-4 items-center justify-center rounded-full bg-rail text-warn">
              <DndIcon size={11} strokeWidth={3} />
            </div>
          ) : (
            <div className="absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full border-2 border-rail bg-online" />
          )}
        </div>
      )}
    </div>
  );
}

/** Pause/resume notifications (rail on desktop, sidebar header below 1100px). */
export function DndButton({ size }: { size: 32 | 36 }) {
  const { dnd, toggle } = useDnd();
  return (
    <button
      onClick={toggle}
      title={dnd ? 'Resume notifications' : 'Pause notifications (do not disturb)'}
      className={cn('flex flex-none cursor-pointer items-center justify-center border outline-none hover:bg-hover', size === 36 ? 'rounded-lg' : 'rounded-md')}
      style={{
        width: size,
        height: size,
        background: dnd ? 'rgba(217,119,6,.16)' : 'var(--bg)',
        borderColor: dnd ? 'rgba(251,191,36,.55)' : 'var(--line)',
        color: dnd ? '#fbbf24' : 'var(--txt2)',
      }}
    >
      <DndIcon size={size === 36 ? 18 : 16} />
    </button>
  );
}
