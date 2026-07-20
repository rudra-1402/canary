import { describe, it, expect, vi, beforeEach } from 'vitest';

const sendMail = vi.fn().mockResolvedValue({ messageId: 'x' });
vi.mock('nodemailer', () => ({ default: { createTransport: () => ({ sendMail }) } }));

const { sendVerificationEmail, sendPasswordResetEmail } = await import('../../src/lib/email.js');

describe('email seam', () => {
  beforeEach(() => sendMail.mockClear());

  it('sends a verification email whose link carries the raw token', async () => {
    await sendVerificationEmail('a@b.com', 'tok123');
    const arg = sendMail.mock.calls[0][0];
    expect(arg.to).toBe('a@b.com');
    expect(arg.html).toContain('tok123');
  });

  it('sends a password-reset email whose link carries the raw token', async () => {
    await sendPasswordResetEmail('a@b.com', 'tok456');
    expect(sendMail.mock.calls[0][0].html).toContain('tok456');
  });
});
