import { describe, it, expect } from 'vitest';
import Identity from '../../src/models/Identity.js';

describe('Identity schema', () => {
  it('validates a well-formed Identity', () => {
    const doc = new Identity({ email: 'a@example.com', authProviderId: 'oauth|123' });
    expect(doc.validateSync()).toBeUndefined();
  });

  it('rejects an Identity missing email', () => {
    const doc = new Identity({ authProviderId: 'oauth|123' });
    const err = doc.validateSync();
    expect(err.errors.email).toBeDefined();
  });

  it('allows a local identity with a passwordHash and no authProviderId', () => {
    const doc = new Identity({ email: 'a@b.com', passwordHash: 'x', emailVerified: false });
    expect(doc.validateSync()).toBeUndefined();
    expect(doc.emailVerified).toBe(false);
  });

  it('allows a social identity with authProviderId and no passwordHash', () => {
    const doc = new Identity({ email: 'a@b.com', authProviderId: 'google-sub-123' });
    expect(doc.validateSync()).toBeUndefined();
  });
});
