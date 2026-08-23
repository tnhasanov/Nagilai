import type { NextConfig } from 'next';

/**
 * Content Security Policy.
 *
 * `'unsafe-inline'` is required for Next.js style injection and the inline
 * bootstrap script. Everything else is locked down; in particular `connect-src`
 * only allows Supabase + the configured analytics host, and `frame-ancestors`
 * blocks clickjacking of the reader/share pages.
 */
const supabaseOrigin = (() => {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!raw) return '';
  try {
    return new URL(raw).origin;
  } catch {
    return '';
  }
})();

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-DNS-Prefetch-Control', value: 'on' },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
  },
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  },
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      "base-uri 'self'",
      "object-src 'none'",
      "frame-ancestors 'none'",
      "form-action 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.stripe.com",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com data:",
      `img-src 'self' blob: data: ${supabaseOrigin}`.trim(),
      `media-src 'self' blob: ${supabaseOrigin}`.trim(),
      `connect-src 'self' ${supabaseOrigin} https://api.stripe.com`.trim(),
      "frame-src 'self' https://js.stripe.com",
    ].join('; '),
  },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  typedRoutes: false,
  images: {
    remotePatterns: supabaseOrigin
      ? [
          {
            protocol: 'https',
            hostname: new URL(supabaseOrigin).hostname,
            pathname: '/storage/v1/object/**',
          },
        ]
      : [],
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
