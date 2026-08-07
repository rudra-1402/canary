import PropTypes from 'prop-types';
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import {
  getMe,
  login as loginRequest,
  logout as logoutRequest,
  register as registerRequest,
} from '../../lib/api/auth.js';

const SessionContext = createContext(null);

// Session bootstrap: GET /api/auth/me on mount decides whether the app opens
// on the authenticated shell or the login screen. 'loading' prevents a flash
// of the login screen for an already-authenticated visitor.
export function SessionProvider({ children }) {
  const [status, setStatus] = useState('loading'); // loading | authenticated | anonymous
  const [identity, setIdentity] = useState(null);

  const refresh = useCallback(async () => {
    try {
      const me = await getMe();
      setIdentity(me);
      setStatus('authenticated');
      return true;
    } catch {
      setIdentity(null);
      setStatus('anonymous');
      return false;
    }
  }, []);

  useEffect(() => {
    // Session bootstrap on mount: no data-fetching library is in scope for this
    // slice (PLAN-UI Part D), so this is the deliberate plain fetch-on-mount
    // pattern rather than an oversight of the rule below.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
  }, [refresh]);

  const login = useCallback(
    async (email, password) => {
      await loginRequest(email, password);
      await refresh();
    },
    [refresh],
  );

  // Anti-enumeration: the server always answers 201, whether the email was new or already
  // registered — it only starts a session (and this resolves true) for a genuinely new one.
  const register = useCallback(
    async (email, password, nameFields) => {
      await registerRequest(email, password, nameFields);
      return refresh();
    },
    [refresh],
  );

  const logout = useCallback(async () => {
    await logoutRequest();
    setIdentity(null);
    setStatus('anonymous');
  }, []);

  return (
    <SessionContext.Provider value={{ status, identity, login, register, logout, refresh }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used within a SessionProvider');
  return ctx;
}

SessionProvider.propTypes = {
  children: PropTypes.node.isRequired,
};
