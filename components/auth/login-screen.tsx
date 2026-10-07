'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useSignIn } from '@/hooks/use-sign-in';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/text-field';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { LockIcon, MailIcon, ShieldIcon } from '@/components/ui/icons';
import { CodeInput } from './code-input';
import { InviteBanner } from './invite-banner';

const EMPTY = ['', '', '', '', '', ''];

const ERRORS: Record<string, string> = {
  no_access: 'Your account no longer has access to a workspace. Ask an admin to invite you again.',
};

export function LoginScreen({ demoAccounts }: { demoAccounts: string[] }) {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get('next');
  const s = useSignIn(params.get('invite'), () => router.replace(next?.startsWith('/') ? next : '/'));
  const [digits, setDigits] = useState(EMPTY);
  const [name, setName] = useState('');
  const [title, setTitle] = useState('');
  const urlError = ERRORS[params.get('error') ?? ''];

  const verify = async (code: string) => {
    if (s.loading) return;
    if (!(await s.verify(code))) setDigits(EMPTY);
  };

  return (
    <div className="flex min-h-screen flex-col bg-rail">
      <header className="flex items-center justify-between gap-3 px-6 py-5">
        <div className="flex items-center gap-2.5">
          <div className="flex size-8 items-center justify-center rounded-lg bg-accent text-[15px] font-black text-white">N</div>
          <span className="text-[17px] font-black">Team Chat</span>
        </div>
        <ThemeToggle />
      </header>

      <main className="flex flex-1 items-start justify-center px-4 pt-[6vh] pb-10">
        <div className="flex w-full max-w-[420px] flex-col gap-4">
          {s.invitation && s.step !== 'done' && <InviteBanner invitation={s.invitation} />}

          <div key={s.shake} className={`rounded-[14px] border border-line bg-bg px-7 py-8 shadow-[0_20px_50px_rgba(0,0,0,.18)] ${s.shake ? 'animate-shake' : ''}`}>
            {s.step === 'email' && (
              <div className="flex flex-col gap-5">
                <div>
                  <h1 className="text-[26px] font-black tracking-[-0.01em]">
                    {s.invitation ? 'Accept your invitation' : 'Sign in to Northwind'}
                  </h1>
                  <p className="mt-1.5 text-[15px] text-pretty text-mute">
                    {s.invitation
                      ? 'Confirm the email address your invitation was sent to.'
                      : 'Use the email address your workspace invitation was sent to.'}
                  </p>
                </div>
                {urlError && <p className="text-sm text-danger-text">{urlError}</p>}
                <Button
                  variant="outline"
                  onClick={() => s.setFieldError('Google sign-in isn’t set up yet. Continue with your email.')}
                >
                  <span className="flex size-5 items-center justify-center rounded-full border border-line3 text-xs font-black">G</span>
                  Continue with Google
                </Button>
                <div className="flex items-center gap-3 text-xs font-bold text-mute">
                  <div className="h-px flex-1 bg-line" />OR<div className="h-px flex-1 bg-line" />
                </div>
                <TextField
                  label="Work email"
                  type="email"
                  autoFocus
                  value={s.email}
                  readOnly={!!s.invitation}
                  invalid={!!s.denied || !!s.fieldError}
                  placeholder="name@northwind.co"
                  onChange={(e) => { s.setEmail(e.target.value); s.setDenied(null); s.setFieldError(''); }}
                  onKeyDown={(e) => e.key === 'Enter' && !s.loading && s.sendCode(s.email)}
                />
                {s.denied && (
                  <div className="flex gap-2.5 rounded-lg border border-danger/50 bg-danger/10 px-3.5 py-3">
                    <LockIcon className="mt-px flex-none text-danger-text" />
                    <p className="text-sm leading-normal text-txt2">
                      <strong>No invitation for {s.denied}.</strong> Team Chat is invite-only. Ask a workspace admin to
                      invite this address, or sign in with the email your invitation was sent to.
                    </p>
                  </div>
                )}
                {s.fieldError && <p className="-mt-3 text-[13px] text-danger-text">{s.fieldError}</p>}
                <Button loading={s.loading} idle={!s.email.trim()} onClick={() => !s.loading && s.sendCode(s.email)}>
                  {s.loading ? 'Checking access…' : 'Continue with email'}
                </Button>
              </div>
            )}

            {s.step === 'code' && (
              <div className="flex flex-col gap-5">
                <div className="flex size-12 items-center justify-center rounded-xl bg-accent/15">
                  <MailIcon size={24} className="text-accent-icon" />
                </div>
                <div>
                  <h1 className="text-[26px] font-black tracking-[-0.01em]">Check your email</h1>
                  <p className="mt-1.5 text-[15px] text-pretty text-mute">
                    We sent a 6-digit code to <strong className="text-txt2">{s.email}</strong>. It expires in 10 minutes.
                  </p>
                </div>
                <CodeInput
                  digits={digits}
                  invalid={!!s.codeError}
                  onChange={(d) => { setDigits(d); s.setCodeError(''); }}
                  onComplete={verify}
                />
                {s.codeError && <p className="-mt-2.5 text-[13px] text-danger-text">{s.codeError}</p>}
                {s.devCode && (
                  <p className="-mt-2 rounded-md border border-dashed border-line3 px-3 py-2 text-[13px] text-mute">
                    Dev mode: no email is sent. Your code is{' '}
                    <button className="cursor-pointer font-mono font-medium text-accent-text outline-none"
                      onClick={() => { const d = s.devCode!.split(''); setDigits(d); verify(s.devCode!); }}>
                      {s.devCode}
                    </button>
                  </p>
                )}
                <Button loading={s.loading} idle={!digits.every(Boolean)} onClick={() => verify(digits.join(''))}>
                  Verify and sign in
                </Button>
                <div className="flex items-center justify-between gap-3 text-sm">
                  <button className="cursor-pointer text-mute outline-none hover:text-txt" onClick={() => { s.backToEmail(); setDigits(EMPTY); }}>
                    ← Use another email
                  </button>
                  <button
                    disabled={s.resendIn > 0}
                    onClick={() => { setDigits(EMPTY); s.resend(); }}
                    className="cursor-pointer font-bold whitespace-nowrap text-accent-text outline-none disabled:cursor-default disabled:text-mute2"
                  >
                    {s.resendIn > 0 ? `Resend in ${s.resendIn}s` : 'Resend code'}
                  </button>
                </div>
              </div>
            )}

            {s.step === 'join' && (
              <div className="flex flex-col gap-[18px]">
                <div>
                  <h1 className="text-[26px] font-black tracking-[-0.01em]">Join {s.welcome.workspace}</h1>
                  <p className="mt-1.5 text-[15px] text-mute">Set up your profile. Teammates will see this.</p>
                </div>
                <TextField label="Full name" autoFocus value={name} placeholder="Jordan Ellis"
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && s.saveProfile(name, title)} />
                <TextField label="What you do" hint="Optional" value={title} placeholder="Product designer"
                  onChange={(e) => setTitle(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && s.saveProfile(name, title)} />
                <Button loading={s.loading} idle={!name.trim()} onClick={() => s.saveProfile(name, title)}>
                  Join workspace
                </Button>
              </div>
            )}

            {s.step === 'done' && (
              <div className="flex flex-col items-center gap-3.5 py-5 text-center">
                <span className="size-7 animate-spin rounded-full border-[3px] border-line3 border-t-accent" />
                <div className="text-xl font-black">
                  {s.welcome.returning ? 'Welcome back' : 'Welcome'}, {s.welcome.name.split(' ')[0]}
                </div>
                <div className="text-sm text-mute">Opening {s.welcome.workspace}…</div>
              </div>
            )}
          </div>

          <div className="flex items-start gap-2.5 px-1 text-[13px] leading-normal text-mute">
            <ShieldIcon size={16} className="mt-0.5 flex-none" />
            <span>Access is limited to members and invited guests of this workspace. Accounts can&apos;t be created without an invitation.</span>
          </div>

          {demoAccounts.length > 0 && (
            <details className="px-1 text-[13px] text-mute">
              <summary className="cursor-pointer font-bold">Test accounts</summary>
              <div className="mt-2 flex flex-col gap-1 font-mono text-xs">
                {demoAccounts.map((a) => (
                  <button key={a} className="cursor-pointer text-left outline-none hover:text-txt"
                    onClick={() => { if (s.step === 'email' && !s.invitation) { s.setEmail(a); s.setDenied(null); } }}>
                    {a}
                  </button>
                ))}
                <span>The sign-in code is shown on the next screen (dev mode).</span>
              </div>
            </details>
          )}
        </div>
      </main>
    </div>
  );
}
