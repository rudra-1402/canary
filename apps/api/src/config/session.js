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
      // 'interval' purges expired session rows in the long-lived server. In tests we use
      // 'disabled' to avoid a lingering purge timer (open handle) and connect-mongo's
      // native-TTL createIndex race on the short-lived test connection. Expiry itself is
      // always enforced on read (MongoStore#get filters `expires: { $gt: now }`).
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
