/**
 * Stand-in for the `server-only` marker package under Vitest.
 *
 * `server-only` intentionally throws when imported outside a React Server
 * Component. Tests exercise server modules directly in Node, so the marker
 * is aliased to this empty module (see vitest.config.ts).
 */
export {};
