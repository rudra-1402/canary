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
});
