import type { MetadataRoute } from 'next';
import { siteUrl } from '@/config/env';

/**
 * Crawler policy (§31).
 *
 * Marketing pages are open. Everything that could carry a child's
 * information — the library, the reader, child profiles, settings, the
 * admin area — is disallowed outright, and `/share/` is excluded too
 * because indexing there is a per-link decision expressed in each page's
 * own metadata rather than something a crawler should discover.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/', '/pricing', '/faq', '/about', '/contact', '/privacy', '/terms'],
        disallow: [
          '/offline',
          '/library',
          '/library/',
          '/create',
          '/children',
          '/settings',
          '/admin',
          '/api/',
          '/auth/',
          '/share/',
        ],
      },
    ],
    sitemap: `${siteUrl()}/sitemap.xml`,
  };
}
