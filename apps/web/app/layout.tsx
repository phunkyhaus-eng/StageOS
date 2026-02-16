import type { Metadata, Viewport } from 'next';
import { Space_Grotesk, IBM_Plex_Mono } from 'next/font/google';
import { StageOsQueryProvider } from '@/components/providers/query-provider';
import { PwaRegister } from '@/components/providers/pwa-register';
import './globals.css';

const sans = Space_Grotesk({
  subsets: ['latin'],
  variable: '--font-stageos-sans'
});

const mono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '600'],
  variable: '--font-stageos-mono'
});

export const metadata: Metadata = {
  title: 'StageOS',
  description: 'Offline-first operating system for professional bands and touring teams',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'StageOS'
  },
  icons: {
    icon: '/icons/icon.svg',
    apple: '/icons/icon.svg'
  }
};

export const viewport: Viewport = {
  themeColor: '#0a1220'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className={`${sans.variable} ${mono.variable} stageos-body`}>
        <StageOsQueryProvider>
          <PwaRegister />
          {children}
        </StageOsQueryProvider>
      </body>
    </html>
  );
}
