import { Suspense } from 'react';
import { LoginScreen } from '@/components/auth/login-screen';

const DEMO_ACCOUNTS =
  process.env.NODE_ENV === 'production'
    ? []
    : [process.env.OWNER_EMAIL, 'sarah@northwind.test', 'marc@northwind.test', 'aisha@northwind.test', 'leo@northwind.test']
        .filter((e): e is string => !!e);

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-rail" />}>
      <LoginScreen demoAccounts={DEMO_ACCOUNTS} />
    </Suspense>
  );
}
