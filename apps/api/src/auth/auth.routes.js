import { Router } from 'express';
import passport from 'passport';
import { csrfSynchronisedProtection, generateToken } from '../config/csrf.js';
import { authRateLimiter } from '../config/rateLimit.js';
import * as authController from './auth.controller.js';

const router = Router();

router.get('/csrf-token', (req, res) => res.json({ csrfToken: generateToken(req) }));

router.post('/register', authRateLimiter, csrfSynchronisedProtection, authController.register);
router.post('/login', authRateLimiter, csrfSynchronisedProtection, authController.login);
router.post('/logout', csrfSynchronisedProtection, authController.logout);
router.get('/me', authController.me);
router.get('/verify-email', authController.verifyEmail);

router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'] }));
router.get(
  '/google/callback',
  passport.authenticate('google', {
    failureRedirect: `${process.env.CLIENT_URL || ''}/login?error=google`,
  }),
  (req, res) => res.redirect(process.env.CLIENT_URL || '/'),
);

export default router;
