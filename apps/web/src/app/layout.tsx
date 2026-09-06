import type { Metadata } from 'next';
import './globals.css';
import { Providers } from '@/providers/providers';
import { IBM_Plex_Mono, IBM_Plex_Sans } from 'next/font/google';
import { cn } from "@/lib/utils";

const plexSans = IBM_Plex_Sans({ subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--font-sans' });
const plexMono = IBM_Plex_Mono({ subsets: ['latin'], weight: ['400', '500'], variable: '--font-mono' });

export const metadata: Metadata = {
  title: 'ACS Staff Dashboard',
  description: 'AI Customer Support staff dashboard',
};

// Runs before paint to avoid a flash of the wrong theme.
const themeInitScript = `(function(){try{var t=localStorage.getItem('acs-theme');if(t==='dark'||(t===null&&window.matchMedia('(prefers-color-scheme: dark)').matches)){document.documentElement.classList.add('dark');}}catch(e){}})();`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning className={cn("font-sans", plexSans.variable, plexMono.variable)}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
