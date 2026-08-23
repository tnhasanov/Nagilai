import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { buildAssetLinks } from '@/app/.well-known/assetlinks.json/route';
import manifest from '@/app/manifest';

/**
 * Installability and Android packaging.
 *
 * These assert the things that fail *silently* in production: a manifest
 * missing a maskable icon renders as a white box in the launcher, and a
 * malformed Digital Asset Links file shows an address bar across the top
 * of the app with no error anywhere.
 */

const FINGERPRINT_A = Array.from({ length: 32 }, (_, i) => i.toString(16).padStart(2, '0'))
  .join(':')
  .toUpperCase();
const FINGERPRINT_B = Array.from({ length: 32 }, () => 'ab').join(':').toUpperCase();

describe('web app manifest', () => {
  const m = manifest();

  it('is installable: name, start_url, standalone display', () => {
    expect(m.name).toBeTruthy();
    expect(m.short_name).toBeTruthy();
    expect(m.start_url).toBeTruthy();
    expect(m.display).toBe('standalone');
    expect(m.scope).toBe('/');
  });

  it('has a stable id, which Android uses as the app identity forever', () => {
    expect(m.id).toBe('/');
  });

  it('ships a 512px icon in both any and maskable purposes', () => {
    const icons = m.icons ?? [];
    expect(icons.some((i) => i.sizes === '512x512' && i.purpose === 'any')).toBe(true);
    expect(icons.some((i) => i.sizes === '512x512' && i.purpose === 'maskable')).toBe(true);
    expect(icons.some((i) => i.sizes === '192x192' && i.purpose === 'maskable')).toBe(true);
  });

  it('points every icon at a file that actually exists', () => {
    for (const icon of m.icons ?? []) {
      const bytes = readFileSync(`public${icon.src}`);
      expect(bytes.byteLength).toBeGreaterThan(0);
      // PNG magic number - a broken export would still be a real file.
      expect([...bytes.subarray(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]);
    }
  });

  it('declares colours the splash screen can use', () => {
    expect(m.background_color).toMatch(/^#[0-9a-f]{6}$/i);
    expect(m.theme_color).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it('offers launcher shortcuts into the two things parents do', () => {
    const urls = (m.shortcuts ?? []).map((s) => s.url);
    expect(urls.some((u) => u.startsWith('/create'))).toBe(true);
    expect(urls.some((u) => u.startsWith('/library'))).toBe(true);
  });
});

describe('digital asset links', () => {
  it('returns an empty list until the app is registered', () => {
    expect(buildAssetLinks(undefined, undefined)).toEqual([]);
    expect(buildAssetLinks('com.nagilai.app', undefined)).toEqual([]);
    expect(buildAssetLinks(undefined, FINGERPRINT_A)).toEqual([]);
    expect(buildAssetLinks('   ', FINGERPRINT_A)).toEqual([]);
  });

  it('emits a statement Chrome will accept', () => {
    const [statement] = buildAssetLinks('com.nagilai.app', FINGERPRINT_A);

    expect(statement).toEqual({
      relation: ['delegate_permission/common.handle_all_urls'],
      target: {
        namespace: 'android_app',
        package_name: 'com.nagilai.app',
        sha256_cert_fingerprints: [FINGERPRINT_A],
      },
    });
  });

  it('accepts both the upload key and the Play signing key', () => {
    const [statement] = buildAssetLinks('com.nagilai.app', `${FINGERPRINT_A}, ${FINGERPRINT_B}`);
    expect(statement!.target.sha256_cert_fingerprints).toEqual([FINGERPRINT_A, FINGERPRINT_B]);
  });

  it('normalises case and whitespace', () => {
    const [statement] = buildAssetLinks(' com.nagilai.app ', `  ${FINGERPRINT_A.toLowerCase()}  `);
    expect(statement!.target.package_name).toBe('com.nagilai.app');
    expect(statement!.target.sha256_cert_fingerprints).toEqual([FINGERPRINT_A]);
  });

  it('de-duplicates a fingerprint pasted twice', () => {
    const [statement] = buildAssetLinks('com.nagilai.app', `${FINGERPRINT_A},${FINGERPRINT_A}`);
    expect(statement!.target.sha256_cert_fingerprints).toEqual([FINGERPRINT_A]);
  });

  it('drops a malformed fingerprint rather than breaking verification', () => {
    expect(buildAssetLinks('com.nagilai.app', 'not-a-fingerprint')).toEqual([]);
    expect(buildAssetLinks('com.nagilai.app', 'AA:BB:CC')).toEqual([]);

    // One good, one truncated: keep the good one, drop the bad one.
    const [statement] = buildAssetLinks('com.nagilai.app', `${FINGERPRINT_A},AA:BB`);
    expect(statement!.target.sha256_cert_fingerprints).toEqual([FINGERPRINT_A]);
  });
});

describe('service worker', () => {
  const source = readFileSync('public/sw.js', 'utf8');

  it('never intercepts a mutation', () => {
    expect(source).toContain("request.method !== 'GET'");
  });

  it('refuses to cache the HTML of a private or auth page', () => {
    for (const route of ['/library', '/create', '/children', '/settings', '/admin', '/share', '/login']) {
      expect(source).toContain(`'${route}'`);
    }
  });

  it('bypasses the API, auth and admin routes entirely', () => {
    expect(source).toContain("BYPASS_PREFIXES = ['/api/', '/auth/', '/admin']");
  });

  it('can wipe the private media cache when a session ends', () => {
    expect(source).toContain('CLEAR_PRIVATE_CACHES');
    expect(source).toContain('PRIVATE_CACHES');
  });

  it('bounds the media cache so a heavy reader cannot fill the device', () => {
    expect(source).toContain('MEDIA_CACHE_LIMIT');
    expect(source).toContain('trimCache');
  });
});
