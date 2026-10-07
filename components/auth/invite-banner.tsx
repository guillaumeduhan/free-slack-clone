import type { Invitation } from '@/hooks/use-sign-in';
import { initials } from '@/lib/client/format';

export function InviteBanner({ invitation }: { invitation: Invitation }) {
  const by = invitation.invited_by ?? 'A workspace admin';
  return (
    <div className="flex items-center gap-3 rounded-[10px] border border-accent/45 bg-accent/10 px-3.5 py-3">
      <div className="flex size-9 flex-none items-center justify-center rounded-lg bg-[#d6409f] text-xs font-bold text-white">
        {initials(by)}
      </div>
      <div className="min-w-0 text-sm leading-[1.45] text-txt2">
        <strong>{by}</strong> invited you to join <strong>{invitation.workspace_name}</strong> as{' '}
        {invitation.role === 'admin' ? 'an admin' : 'a member'}.
      </div>
    </div>
  );
}
