import session from 'express-session';
import MongoStore from 'connect-mongo';

// Sessions stored server-side in Mongo (connect-mongo) on the existing mongoose
// connection. Cookies are httpOnly + sameSite; secure in production.
export function buildSessionMiddleware(mongooseConnection) {
  const secret = process.env.SESSION_SECRET;
  // Never sign prod session cookies with a public constant — that makes sessions forgeable.
  if (process.env.NODE_ENV === 'production' && !secret) {
    throw new Error('SESSION_SECRET must be set in production');
  }
  return session({
    secret: secret || 'dev-only-insecure-secret',
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
      client: mongooseConnection.getClient(),
      // 'interval' purges expired rows in the long-lived server; 'disabled' in tests avoids a
      // lingering purge timer and connect-mongo's TTL-index race on the short-lived connection.
      autoRemove: process.env.NODE_ENV === 'test' ? 'disabled' : 'interval',
    }),
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 1000 * 60 * 60 * 24 * 7,
    },
  });
}
