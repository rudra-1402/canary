import nodemailer from 'nodemailer';

// Delivery seam. Transport comes from env (SMTP); mocked in tests. Lazy so importing has no
// side effects.
let transporter;
const transport = () =>
  (transporter ??= nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      : undefined,
  }));

const FROM = process.env.MAIL_FROM || 'Canary <no-reply@canary.local>';
const API = process.env.API_URL || 'http://localhost:4000';
const CLIENT = process.env.CLIENT_URL || 'http://localhost:5173';

export async function sendVerificationEmail(to, rawToken) {
  const link = `${API}/api/auth/verify-email?token=${rawToken}`;
  await transport().sendMail({
    from: FROM,
    to,
    subject: 'Verify your email',
    text: `Verify your email: ${link}`,
    html: `<p><a href="${link}">Verify your email</a></p>`,
  });
}

export async function sendPasswordResetEmail(to, rawToken) {
  const link = `${CLIENT}/reset-password?token=${rawToken}`;
  await transport().sendMail({
    from: FROM,
    to,
    subject: 'Reset your password',
    text: `Reset your password: ${link}`,
    html: `<p><a href="${link}">Reset your password</a></p>`,
  });
}
