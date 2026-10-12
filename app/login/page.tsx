import { Suspense } from 'react';
import { LoginScreen } from '@/components/auth/login-screen';

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-rail" />}>
      <LoginScreen />
    </Suspense>
  );
}
