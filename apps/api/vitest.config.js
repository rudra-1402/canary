import { defineConfig } from 'vitest/config';

// bcrypt (rounds=12) makes the auth integration tests slower than the 5s default; give
// tests and DB-spinup hooks generous timeouts so CI doesn't flake on hashing latency.
export default defineConfig({
  test: {
    testTimeout: 20000,
    hookTimeout: 60000,
  },
});
