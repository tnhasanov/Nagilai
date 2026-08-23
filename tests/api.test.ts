import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { body, intParam, json, preflight } from '@/services/api/handler';
import { authenticate } from '@/services/api/auth';
import { serialiseChild } from '@/features/children/serialise';
import type { Child } from '@/types/domain';

/**
 * The mobile API boundary.
 *
 * A native client is code we do not control the release cycle of: an old
 * version stays installed for months. So the things tested here are the
 * ones that must hold no matter what a client sends — authentication is
 * never optional, bodies are validated, and responses are an allow list
 * rather than whatever happens to be on the row.
 */

function request(url: string, init?: RequestInit) {
  return new Request(url, init);
}

describe('authentication', () => {
  it('rejects a request with no Authorization header', async () => {
    await expect(authenticate(request('https://x.test/api/v1/me'))).rejects.toMatchObject({
      code: 'unauthenticated',
    });
  });

  it('rejects a non-bearer scheme', async () => {
    await expect(
      authenticate(request('https://x.test/api/v1/me', { headers: { authorization: 'Basic abc' } })),
    ).rejects.toMatchObject({ code: 'unauthenticated' });
  });

  it('rejects an empty bearer token', async () => {
    await expect(
      authenticate(request('https://x.test/api/v1/me', { headers: { authorization: 'Bearer   ' } })),
    ).rejects.toMatchObject({ code: 'unauthenticated' });
  });

  it('never leaks why a token was refused', async () => {
    const error = await authenticate(request('https://x.test/api/v1/me')).catch((e) => e);
    expect(error.userMessage).toBe('Please sign in to continue.');
    expect(error.userMessage).not.toContain('token');
  });
});

describe('body validation', () => {
  const schema = z.object({
    name: z.string().min(1),
    age: z.number().int().min(0).max(17),
  });

  it('returns the parsed value', async () => {
    const req = request('https://x.test/', {
      method: 'POST',
      body: JSON.stringify({ name: 'Miray', age: 6 }),
    });
    await expect(body(req, schema)).resolves.toEqual({ name: 'Miray', age: 6 });
  });

  it('rejects a body that is not JSON', async () => {
    const req = request('https://x.test/', { method: 'POST', body: 'not json' });
    await expect(body(req, schema)).rejects.toMatchObject({ code: 'validation_failed' });
  });

  it('reports which field failed, so the client can show it in place', async () => {
    const req = request('https://x.test/', {
      method: 'POST',
      body: JSON.stringify({ name: '', age: 99 }),
    });

    const error = await body(req, schema).catch((e) => e);
    expect(error.code).toBe('validation_failed');
    expect(Object.keys(error.details.fields).sort()).toEqual(['age', 'name']);
  });

  it('keeps only the first message per field', async () => {
    const req = request('https://x.test/', { method: 'POST', body: JSON.stringify({}) });
    const error = await body(req, schema).catch((e) => e);
    for (const message of Object.values(error.details.fields as Record<string, string>)) {
      expect(typeof message).toBe('string');
    }
  });
});

describe('query parameters', () => {
  it('falls back when absent or nonsense', () => {
    expect(intParam(request('https://x.test/'), 'limit', 20, 100)).toBe(20);
    expect(intParam(request('https://x.test/?limit=abc'), 'limit', 20, 100)).toBe(20);
    expect(intParam(request('https://x.test/?limit=0'), 'limit', 20, 100)).toBe(20);
    expect(intParam(request('https://x.test/?limit=-5'), 'limit', 20, 100)).toBe(20);
  });

  it('is bounded, so a client cannot ask for the whole table', () => {
    expect(intParam(request('https://x.test/?limit=50'), 'limit', 20, 100)).toBe(50);
    expect(intParam(request('https://x.test/?limit=100000'), 'limit', 20, 100)).toBe(100);
  });
});

describe('responses', () => {
  it('never caches an authenticated response', () => {
    expect(json({ ok: true }).headers.get('cache-control')).toBe('no-store');
  });

  it('answers a pre-flight with the methods the API actually supports', () => {
    const response = preflight();
    expect(response.status).toBe(204);
    expect(response.headers.get('access-control-allow-methods')).toContain('PATCH');
    expect(response.headers.get('access-control-allow-headers')).toContain('authorization');
  });
});

describe('child serialisation', () => {
  const row = {
    id: 'aaaaaaaa-0000-4000-8000-000000000001',
    owner_id: 'bbbbbbbb-0000-4000-8000-000000000002',
    name: 'Miray Hasanova',
    nickname: 'Miray',
    birth_date: '2019-04-12',
    age_years: 6,
    gender: 'girl',
    preferred_language: 'az-AZ',
    interests: ['stars'],
    favourite_animals: ['cats'],
    favourite_activities: [],
    favourite_characters: [],
    personality_traits: ['curious'],
    learning_interests: ['space'],
    parent_notes: 'Afraid of thunder',
    avatar_color: '#4A3A6B',
    photo_storage_path: 'owner/child/photo.png',
    photo_consent_at: '2026-01-01T00:00:00Z',
    photo_consent_by: 'bbbbbbbb-0000-4000-8000-000000000002',
    appearance_description: 'Dark curly hair',
    is_archived: false,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  } satisfies Child;

  const payload = serialiseChild(row);

  it('carries what a client needs', () => {
    expect(payload.id).toBe(row.id);
    expect(payload.nickname).toBe('Miray');
    expect(payload.interests).toEqual(['stars']);
    expect(payload.appearanceDescription).toBe('Dark curly hair');
  });

  it('is an allow list, not the row', () => {
    const serialised = JSON.stringify(payload);

    // A column added to `children` later must not reach a client by
    // simply existing.
    expect(serialised).not.toContain('photo.png');
    expect(serialised).not.toContain('2019-04-12');
    expect(serialised).not.toContain(row.owner_id);
    expect(Object.keys(payload)).not.toContain('photoStoragePath');
    expect(Object.keys(payload)).not.toContain('birthDate');
    expect(Object.keys(payload)).not.toContain('ownerId');
  });
});
