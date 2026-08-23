import { NextResponse } from 'next/server';

/**
 * Digital Asset Links (Android app-site association).
 *
 * This is the file Chrome fetches to verify that a Play Store app and this
 * website are the same publisher. Without a matching entry a Trusted Web
 * Activity still runs, but it shows a browser address bar at the top —
 * which is an instant "this is just a website" for a reviewer and for a
 * customer.
 *
 * This route serves the *optional TWA wrapper* of the website. The Play
 * Store product is the native app in `mobile/`, which owns
 * `com.nagilai.app`; a TWA must be published under a different package
 * name, because Play binds one permanently on first upload.
 *
 * The fingerprint is served from configuration rather than committed,
 * because it comes from the Play Console **after** the first upload
 * (Google re-signs the app), and because a developer may need to list two
 * at once — their local upload key and Google's Play signing key.
 *
 *   ANDROID_PACKAGE_NAME=com.nagilai.twa
 *   ANDROID_CERT_FINGERPRINTS=AA:BB:...,CC:DD:...
 *
 * Setting them is a redeploy, not a code change. See docs/MOBILE.md.
 */
export const dynamic = 'force-dynamic';

export interface AssetLinkStatement {
  relation: string[];
  target: {
    namespace: 'android_app';
    package_name: string;
    sha256_cert_fingerprints: string[];
  };
}

/**
 * Builds the statement list.
 *
 * A SHA-256 fingerprint is 32 colon-separated hex pairs. Anything that
 * does not match is dropped rather than passed through: Chrome fails the
 * whole verification on one malformed entry, and a silent address bar is
 * far harder to debug than a visibly empty array.
 *
 * With nothing configured this returns `[]` - a valid, well-formed answer
 * - so the URL is never a 404 while the app is being set up.
 */
export function buildAssetLinks(
  packageName: string | undefined,
  rawFingerprints: string | undefined,
): AssetLinkStatement[] {
  const fingerprints = (rawFingerprints ?? '')
    .split(',')
    .map((value) => value.trim().toUpperCase())
    .filter((value) => /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/.test(value));

  const name = packageName?.trim();
  if (!name || fingerprints.length === 0) return [];

  return [
    {
      relation: ['delegate_permission/common.handle_all_urls'],
      target: {
        namespace: 'android_app',
        package_name: name,
        // De-duplicated: the upload key and the Play signing key are
        // often pasted together, sometimes twice.
        sha256_cert_fingerprints: [...new Set(fingerprints)],
      },
    },
  ];
}

export function GET() {
  const statements = buildAssetLinks(
    process.env.ANDROID_PACKAGE_NAME,
    process.env.ANDROID_CERT_FINGERPRINTS,
  );

  return NextResponse.json(statements, {
    headers: {
      'Content-Type': 'application/json',
      // Chrome caches this aggressively; keep it short so adding the Play
      // signing fingerprint takes effect the same day.
      'Cache-Control': 'public, max-age=300, s-maxage=300',
    },
  });
}
