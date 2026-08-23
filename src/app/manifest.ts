import type { MetadataRoute } from 'next';

/**
 * Web app manifest.
 *
 * This is what makes Nagilai installable, and it is also the file Google's
 * Bubblewrap reads when it generates the Play Store package — so several
 * fields here are Play Store requirements rather than cosmetic:
 *
 *  - `id` must be stable forever. Changing it makes Android treat the app
 *    as a different application and orphans every existing install.
 *  - A 512px **maskable** icon is mandatory. Without one the launcher
 *    renders the square icon inside a white box.
 *  - `display: standalone` plus `display_override` is what removes the
 *    browser chrome; a TWA falls back through the override list.
 *
 * See docs/MOBILE.md for the full packaging walkthrough.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'Nagilai — personalised storybooks',
    short_name: 'Nagilai',
    description:
      'Beautiful personalised storybooks where your child is the hero. Illustrated, narrated and ready to read tonight.',
    start_url: '/library?source=pwa',
    scope: '/',
    display: 'standalone',
    display_override: ['standalone', 'minimal-ui', 'browser'],
    orientation: 'portrait-primary',
    background_color: '#fdfaf4',
    theme_color: '#fdfaf4',
    lang: 'en-US',
    dir: 'ltr',
    categories: ['books', 'education', 'entertainment', 'kids'],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    // Deep links from the launcher's long-press menu.
    shortcuts: [
      {
        name: 'New story',
        short_name: 'New story',
        description: 'Create a personalised story',
        url: '/create?source=shortcut',
        icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }],
      },
      {
        name: 'My library',
        short_name: 'Library',
        description: 'Open your saved stories',
        url: '/library?source=shortcut',
        icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }],
      },
    ],
  };
}
