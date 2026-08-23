import { defineConfig } from 'vitest/config';

/**
 * Tests for the parts of the native app that are plain logic.
 *
 * Not a React Native test setup, deliberately. Rendering a screen needs a
 * simulator or a heavy mock layer, and neither pays for itself here. What
 * is worth testing is the logic that would otherwise be discovered wrong
 * on a device: locale negotiation, placeholder substitution, and whether
 * every translation is actually present and actually translated.
 *
 * These used to live in the web suite, which meant the web test job could
 * not run without the mobile package's dependencies installed. Tests
 * belong where their dependencies do.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    globals: false,
  },
});
