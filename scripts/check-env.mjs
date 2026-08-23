#!/usr/bin/env node
/**
 * Environment validation for a real deployment.
 *
 *   node scripts/check-env.mjs           # shape only, no network
 *   node scripts/check-env.mjs --probe   # also call each service once
 *
 * This never prints a secret. A value is reported as present, absent or
 * malformed, and `--probe` reports only whether the service answered --
 * which is the whole point: you can prove a key works without pasting it
 * into a terminal, a log, or a screenshot.
 *
 * The exit code is 1 if anything required is missing or a probe fails, so
 * it can gate a deploy.
 */
import { readFileSync, existsSync } from 'node:fs';

const PROBE = process.argv.slice(2).includes('--probe');

// Load .env.local when present so this works locally as well as in CI.
// Real hosting sets the variables directly and this file will not exist.
if (existsSync('.env.local')) {
  for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (!match) continue;
    const key = match[1];
    if (process.env[key] === undefined) {
      process.env[key] = match[2].replace(/^["']|["']$/g, '');
    }
  }
}

const C = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  dim: '\x1b[2m',
  reset: '\x1b[0m',
};

const MARKS = {
  ok: `${C.green}  ok${C.reset}`,
  missing: `${C.red} unset${C.reset}`,
  bad: `${C.red}   no${C.reset}`,
  warn: `${C.yellow} warn${C.reset}`,
  skip: `${C.dim} skip${C.reset}`,
};

let failures = 0;
let warnings = 0;

function report(status, name, note) {
  console.log(`  ${MARKS[status]}  ${name}${note ? `  ${C.dim}${note}${C.reset}` : ''}`);
}

function check(spec) {
  const value = process.env[spec.name];
  if (!value || value.trim() === '') {
    if (spec.required) {
      failures += 1;
      report('missing', spec.name, spec.where);
    } else {
      warnings += 1;
      report('skip', spec.name, spec.optionalNote ?? 'optional');
    }
    return null;
  }
  const problem = spec.validate?.(value);
  if (problem) {
    failures += 1;
    report('bad', spec.name, problem);
    return null;
  }
  report('ok', spec.name, spec.note);
  return value;
}

const isUrl = (value) => {
  try {
    new URL(value);
    return null;
  } catch {
    return 'not a URL';
  }
};

const looksLikePlaceholder = (value) =>
  /placeholder|your-|example\.com|^sk-\.\.\.$|xxx/i.test(value) ? 'looks like a placeholder' : null;

console.log('\nSite');
const siteUrl = check({
  name: 'NEXT_PUBLIC_SITE_URL',
  required: false,
  optionalNote: 'derived from VERCEL_URL when unset',
  validate: isUrl,
});
if (siteUrl && process.env.NODE_ENV === 'production' && siteUrl.startsWith('http://')) {
  warnings += 1;
  report('warn', 'NEXT_PUBLIC_SITE_URL', 'http:// in production - share links and OAuth need https');
}

console.log('\nSupabase');
const supabaseUrl = check({
  name: 'NEXT_PUBLIC_SUPABASE_URL',
  required: true,
  where: 'Project -> Settings -> API',
  validate: (v) => isUrl(v) ?? looksLikePlaceholder(v),
});
const anonKey = check({
  name: 'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  required: true,
  where: 'Project -> Settings -> API -> anon',
  validate: looksLikePlaceholder,
});
const serviceKey = check({
  name: 'SUPABASE_SERVICE_ROLE_KEY',
  required: true,
  where: 'Project -> Settings -> API -> service_role',
  validate: (v) =>
    looksLikePlaceholder(v) ??
    (v === anonKey ? 'identical to the anon key - one of them is wrong' : null),
});

console.log('\nOpenAI');
const openaiKey = check({
  name: 'OPENAI_API_KEY',
  required: true,
  where: 'platform.openai.com -> API keys',
  validate: looksLikePlaceholder,
});

console.log('\nWorker');
check({
  name: 'CRON_SECRET',
  required: true,
  where: 'openssl rand -hex 32',
  validate: (v) => (v.length < 16 ? 'shorter than 16 characters' : null),
  note: 'the worker refuses to run without it',
});

console.log('\nOptional integrations');
check({ name: 'STRIPE_SECRET_KEY', required: false, optionalNote: 'payments stay off' });
check({ name: 'STRIPE_WEBHOOK_SECRET', required: false, optionalNote: 'payments stay off' });
check({ name: 'RESEND_API_KEY', required: false, optionalNote: 'transactional email is a no-op' });
check({
  name: 'NEXT_PUBLIC_POSTHOG_KEY',
  required: false,
  optionalNote: 'events are still stored in-database',
});
check({
  name: 'ANDROID_PACKAGE_NAME',
  required: false,
  optionalNote: 'TWA only; must not be com.nagilai.app',
});

if (process.env.ANDROID_PACKAGE_NAME === 'com.nagilai.app') {
  failures += 1;
  report('bad', 'ANDROID_PACKAGE_NAME', 'collides with the native app - use a different package');
}

if (!PROBE) {
  console.log(`\n${C.dim}Run with --probe to confirm each service actually answers.${C.reset}`);
} else {
  console.log('\nProbes');

  const probe = async (name, fn) => {
    try {
      report('ok', name, await fn());
    } catch (error) {
      failures += 1;
      report('bad', name, error instanceof Error ? error.message : String(error));
    }
  };

  if (supabaseUrl && anonKey) {
    await probe('Supabase REST, anon key', async () => {
      const response = await fetch(`${supabaseUrl}/rest/v1/`, {
        headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` },
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return 'reachable';
    });

    await probe('Anonymous reads are blocked by RLS', async () => {
      const response = await fetch(`${supabaseUrl}/rest/v1/profiles?select=id&limit=1`, {
        headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` },
      });
      const rows = response.ok ? await response.json() : [];
      if (Array.isArray(rows) && rows.length > 0) {
        throw new Error('anonymous request returned profile rows - RLS is not protecting this table');
      }
      return 'anonymous reads return nothing, as they must';
    });
  }

  if (supabaseUrl && serviceKey) {
    await probe('Supabase service role reads app_settings', async () => {
      const response = await fetch(`${supabaseUrl}/rest/v1/app_settings?select=key&limit=1`, {
        headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
      });
      if (!response.ok) throw new Error(`HTTP ${response.status} - migrations may not be applied`);
      const rows = await response.json();
      if (!Array.isArray(rows) || rows.length === 0) {
        throw new Error('table is empty - seed migration 0009 has not run');
      }
      return 'schema present and seeded';
    });
  }

  if (openaiKey) {
    await probe('OpenAI', async () => {
      const base = process.env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1';
      const response = await fetch(`${base}/models`, {
        headers: { Authorization: `Bearer ${openaiKey}` },
      });
      if (response.status === 401) throw new Error('key rejected');
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return 'key accepted';
    });
  }
}

console.log('');
if (failures > 0) {
  console.log(
    `${C.red}${failures} problem${failures === 1 ? '' : 's'} to fix before deploying.${C.reset}\n`,
  );
  process.exit(1);
}
console.log(
  `${C.green}Environment looks deployable.${C.reset}` +
    (warnings ? ` ${C.dim}${warnings} optional value(s) unset.${C.reset}` : '') +
    '\n',
);
