import { redirect } from 'next/navigation';

/** Invite links (/invite/:token) open the sign-in screen with the invitation banner. */
export default async function InvitePage({ params }: PageProps<'/invite/[token]'>) {
  const { token } = await params;
  redirect(`/login?invite=${encodeURIComponent(token)}`);
}
