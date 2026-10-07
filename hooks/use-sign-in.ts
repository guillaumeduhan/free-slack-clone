'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/client/api';

export type Step = 'email' | 'code' | 'join' | 'done';

export type Invitation = { email: string; role: string; workspace_name: string; invited_by: string | null };

type VerifyResult = { needs_profile: boolean; workspaces: { workspace: { name: string } }[] };

const RESEND_SECONDS = 30;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Email → 6-digit code → (new people) profile → done. Talks to /api/auth/*. */
export function useSignIn(inviteToken: string | null, onSignedIn: () => void) {
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [invitation, setInvitation] = useState<Invitation | null>(null);
  const [loading, setLoading] = useState(false);
  const [fieldError, setFieldError] = useState('');
  const [denied, setDenied] = useState<string | null>(null);
  const [codeError, setCodeError] = useState('');
  const [devCode, setDevCode] = useState<string | null>(null);
  const [resendAt, setResendAt] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [shake, setShake] = useState(0);
  const [welcome, setWelcome] = useState({ name: '', returning: true, workspace: '' });

  // Invitation banner + locked email when arriving from /invite/:token.
  useEffect(() => {
    if (!inviteToken) return;
    api<Invitation>('GET', `/api/auth/invitation?token=${encodeURIComponent(inviteToken)}`)
      .then((inv) => {
        setInvitation(inv);
        setEmail(inv.email);
      })
      .catch(() => setFieldError('This invitation link is invalid or has expired.'));
  }, [inviteToken]);

  // Resend countdown.
  useEffect(() => {
    if (step !== 'code' || resendAt <= now) return;
    const t = setTimeout(() => setNow(Date.now()), 1000);
    return () => clearTimeout(t);
  }, [step, resendAt, now]);

  const fail = useCallback(() => setShake((n) => n + 1), []);

  const sendCode = useCallback(async (address: string) => {
    const value = address.trim().toLowerCase();
    setDenied(null);
    if (!EMAIL_RE.test(value)) {
      setFieldError('Enter a valid email address.');
      return fail();
    }
    setFieldError('');
    setEmail(value);
    setLoading(true);
    try {
      const res = await api<{ dev_code?: string }>('POST', '/api/auth/otp', { email: value });
      setDevCode(res.dev_code ?? null);
      setCodeError('');
      setResendAt(Date.now() + RESEND_SECONDS * 1000);
      setNow(Date.now());
      setStep('code');
    } catch (e) {
      if (e instanceof ApiError && e.code === 'not_invited') setDenied(value);
      else setFieldError(e instanceof Error ? e.message : 'Something went wrong');
      fail();
    } finally {
      setLoading(false);
    }
  }, [fail]);

  const finish = useCallback((name: string, returning: boolean, workspace: string) => {
    setWelcome({ name, returning, workspace });
    setStep('done');
    setTimeout(onSignedIn, 900);
  }, [onSignedIn]);

  const verify = useCallback(async (code: string) => {
    if (code.length < 6) {
      setCodeError('Enter all 6 digits.');
      return fail();
    }
    setLoading(true);
    setCodeError('');
    try {
      const res = await api<VerifyResult>('POST', '/api/auth/verify', { email, token: code });
      const workspace = res.workspaces[0]?.workspace.name ?? 'your workspace';
      setWelcome((w) => ({ ...w, workspace }));
      if (res.needs_profile) {
        setStep('join');
      } else {
        const me = await api<{ display_name: string }>('GET', '/api/me');
        finish(me.display_name, true, workspace);
      }
      return true;
    } catch (e) {
      setCodeError(e instanceof ApiError && e.code === 'no_access'
        ? 'Your account is not a member of any workspace.'
        : 'That code is incorrect or has expired.');
      fail();
      return false;
    } finally {
      setLoading(false);
    }
  }, [email, fail, finish]);

  const saveProfile = useCallback(async (displayName: string, title: string) => {
    if (!displayName.trim()) return fail();
    setLoading(true);
    try {
      await api('PATCH', '/api/me', { display_name: displayName.trim(), title: title.trim() || null });
      finish(displayName.trim(), false, welcome.workspace);
    } catch {
      fail();
    } finally {
      setLoading(false);
    }
  }, [fail, finish, welcome.workspace]);

  const resendIn = Math.max(0, Math.ceil((resendAt - now) / 1000));

  return {
    step, email, setEmail, invitation, loading, fieldError, setFieldError, denied, setDenied, codeError, setCodeError,
    devCode, resendIn, shake, welcome,
    sendCode, verify, saveProfile,
    resend: () => resendIn === 0 && sendCode(email),
    backToEmail: () => { setStep('email'); setCodeError(''); setDevCode(null); },
  };
}
