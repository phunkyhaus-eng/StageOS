import type { Metadata, Viewport } from 'next';
import { StageOSQueryProvider } from '@/components/providers/query-provider';
import { PwaRegister } from '@/components/providers/pwa-register';
import './globals.css';

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
      <body className="stageos-body">
        <StageOSQueryProvider>
          <PwaRegister />
          {children}
        </StageOSQueryProvider>
      </body>
    </html>
  );
}
