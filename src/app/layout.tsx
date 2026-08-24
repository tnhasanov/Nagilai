import type { Metadata, Viewport } from 'next';
import { Literata, Nunito } from 'next/font/google';
import { Toaster } from 'sonner';
import { ProgressiveWebApp } from '@/components/site/pwa';
import { resolveLocale } from '@/i18n/server';
import { getDictionary } from '@/i18n';
import { siteUrl } from '@/config/env';
import './globals.css';

/**
 * Root layout.
 *
 * `next/font` self-hosts both faces, so there is no render-blocking
 * request to a font CDN and no layout shift when the text swaps in — on a
 * phone at bedtime that difference is visible.
 */
const literata = Literata({
  subsets: ['latin', 'latin-ext', 'cyrillic'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-literata',
  display: 'swap',
});

const nunito = Nunito({
  subsets: ['latin', 'latin-ext', 'cyrillic'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-nunito',
  display: 'swap',
});

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: {
    default: 'Nagilai — personalised storybooks for your child',
    template: '%s · Nagilai',
  },
  description:
    'Beautiful personalised storybooks where your child is the hero. Illustrated, narrated in Azerbaijani, English, Russian or Turkish, and ready to read tonight.',
  applicationName: 'Nagilai',
  keywords: [
    'personalised children books',
    'AI storybook',
    'bedtime stories',
    'Azerbaijani children stories',
    'custom kids book',
  ],
  openGraph: {
    type: 'website',
    siteName: 'Nagilai',
    title: 'Nagilai — personalised storybooks for your child',
    description: 'Your child. Their imagination. Their own story.',
    url: siteUrl(),
    images: [{ url: '/icons/og.png', width: 1200, height: 630, alt: 'Nagilai' }],
  },
  twitter: { card: 'summary_large_image', images: ['/icons/og.png'] },
  icons: {
    icon: [
      { url: '/icon.svg', type: 'image/svg+xml' },
      { url: '/icons/favicon-32.png', sizes: '32x32', type: 'image/png' },
    ],
    apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180' }],
  },
  // iOS ignores the web app manifest and reads these instead, so an
  // install from Safari still opens full screen with the right name.
  appleWebApp: {
    capable: true,
    title: 'Nagilai',
    statusBarStyle: 'default',
  },
  robots: { index: true, follow: true },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#fdfaf4' },
    { media: '(prefers-color-scheme: dark)', color: '#171310' },
  ],
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await resolveLocale();
  const t = getDictionary(locale);

  return (
    <html lang={locale} className={`${literata.variable} ${nunito.variable}`} suppressHydrationWarning>
      <head>
        {/*
          Next emits the standardised `mobile-web-app-capable`, which iOS
          16.4+ honours. Older iPhones still read the vendor-prefixed name,
          and without it an install from Safari opens with browser chrome.
        */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
      </head>
      <body className="grain relative antialiased">
        {children}
        <ProgressiveWebApp
          strings={{
            installTitle: t.common.installTitle,
            installBody: t.common.installBody,
            install: t.common.install,
            notNow: t.common.notNow,
          }}
        />
        <Toaster
          position="bottom-center"
          toastOptions={{
            style: {
              background: 'var(--color-paper-raised)',
              color: 'var(--color-ink)',
              border: '1px solid var(--color-line)',
              borderRadius: '1rem',
              fontFamily: 'var(--font-sans)',
              boxShadow: 'var(--shadow-lift)',
            },
          }}
        />
      </body>
    </html>
  );
}
