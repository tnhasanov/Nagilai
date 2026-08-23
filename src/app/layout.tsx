import type { Metadata, Viewport } from 'next';
import { Literata, Nunito } from 'next/font/google';
import { Toaster } from 'sonner';
import { resolveLocale } from '@/i18n/server';
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
  },
  twitter: { card: 'summary_large_image' },
  icons: { icon: '/icon.svg' },
  robots: { index: true, follow: true },
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

  return (
    <html lang={locale} className={`${literata.variable} ${nunito.variable}`} suppressHydrationWarning>
      <body className="grain relative antialiased">
        {children}
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
