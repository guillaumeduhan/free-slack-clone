import type { Metadata } from 'next';
import { Lato, Geist_Mono } from 'next/font/google';
import './globals.css';

const lato = Lato({ variable: '--font-lato', subsets: ['latin'], weight: ['400', '700', '900'] });
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Team Chat',
  description: 'Team chat on Next.js + PostgreSQL',
};

// Applies the saved theme before paint (no flash of the wrong theme).
const THEME_SCRIPT = `try{var t=localStorage.getItem('teamchat-theme');if(t==='light'||t==='dark')document.documentElement.dataset.theme=t}catch(e){}`;

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning className={`${lato.variable} ${geistMono.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="font-sans">{children}</body>
    </html>
  );
}
