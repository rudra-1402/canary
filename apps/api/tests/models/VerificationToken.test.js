import { describe, it, expect } from 'vitest';
import VerificationToken from '../../src/models/VerificationToken.js';

describe('VerificationToken schema', () => {
  it('validates a well-formed token and defaults usedAt to null', () => {
    const doc = new VerificationToken({
      identityId: '6a59288e7932da30f438a306',
      type: 'email-verification',
      tokenHash: 'a'.repeat(64),
      expiresAt: new Date(Date.now() + 1000),
    });
    expect(doc.validateSync()).toBeUndefined();
    expect(doc.usedAt).toBeNull();
  });

  it('rejects an unknown type', () => {
    const doc = new VerificationToken({
      identityId: '6a59288e7932da30f438a306',
      type: 'nope',
      tokenHash: 'a',
      expiresAt: new Date(),
    });
    expect(doc.validateSync().errors.type).toBeDefined();
  });
});
