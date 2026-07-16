import passport from 'passport';
import { Strategy as LocalStrategy } from 'passport-local';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import Identity from '../models/Identity.js';
import { verifyLocalCredentials, findOrLinkGoogleIdentity } from '../auth/auth.service.js';

// Uniform session identity: store only the identityId, reload the Identity per request.
export function configurePassport() {
  passport.serializeUser((identity, done) => done(null, identity._id.toString()));
  passport.deserializeUser(async (id, done) => {
    try {
      done(null, await Identity.findById(id));
    } catch (err) {
      done(err);
    }
  });

  // Local: email + password. usernameField maps the form field to `email`.
  passport.use(
    new LocalStrategy({ usernameField: 'email' }, async (email, password, done) => {
      try {
        const identity = await verifyLocalCredentials(email, password);
        return identity
          ? done(null, identity)
          : done(null, false, { message: 'Invalid credentials' });
      } catch (err) {
        return done(err);
      }
    }),
  );

  // Google: only registered when credentials exist (keeps tests/CI from needing them).
  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    passport.use(
      new GoogleStrategy(
        {
          clientID: process.env.GOOGLE_CLIENT_ID,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET,
          callbackURL: process.env.GOOGLE_CALLBACK_URL,
        },
        async (accessToken, refreshToken, profile, done) => {
          try {
            const email = profile.emails?.[0]?.value;
            const identity = await findOrLinkGoogleIdentity({ sub: profile.id, email });
            return done(null, identity);
          } catch (err) {
            return done(err);
          }
        },
      ),
    );
  }
}
