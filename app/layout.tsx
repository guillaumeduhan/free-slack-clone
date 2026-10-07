import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Team Chat',
  description: 'Team chat on Next.js + PostgreSQL',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
