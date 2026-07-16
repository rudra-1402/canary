import session from 'express-session';
import MongoStore from 'connect-mongo';

// Sessions stored server-side in Mongo (connect-mongo) on the existing mongoose
// connection. Cookies are httpOnly + sameSite; secure in production.
export function buildSessionMiddleware(mongooseConnection) {
  return session({
    secret: process.env.SESSION_SECRET || 'dev-only-insecure-secret',
    resave: false,
    saveUninitialized: false,
    // autoRemove: 'disabled' avoids connect-mongo's default behaviour of firing an
    // unawaited collection.createIndex() call from the constructor (autoRemove:
    // 'native'). That async call races connection teardown in short-lived contexts
    // (e.g. this module's own smoke test) and throws an unhandled
    // MongoExpiredSessionError once the connection closes first. Expired sessions are
    // still correctly rejected on read: MongoStore#get() filters
    // `expires: { $gt: now }` regardless of this setting, so disabling native TTL
    // indexing only defers physical row cleanup in Mongo, not session-expiry
    // correctness.
    store: MongoStore.create({
      client: mongooseConnection.getClient(),
      autoRemove: 'disabled',
    }),
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 1000 * 60 * 60 * 24 * 7,
    },
  });
}
