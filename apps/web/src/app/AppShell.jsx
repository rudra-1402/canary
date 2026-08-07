import PropTypes from 'prop-types';
import { useEffect, useRef, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Search, Briefcase, Handshake, Users, FolderKanban } from 'lucide-react';
import { useSession } from './session/SessionContext.jsx';

const railLinkClass = ({ isActive }) =>
  `flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
    isActive
      ? 'bg-background text-foreground'
      : 'text-muted-foreground hover:bg-background hover:text-foreground'
  }`;

const menuLinkClass = ({ isActive }) =>
  `block px-4 py-2 text-sm ${isActive ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'}`;

function ProfileMenu({ identity, logout }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    function handlePointerDown(event) {
      if (rootRef.current && !rootRef.current.contains(event.target)) setOpen(false);
    }
    function handleKeyDown(event) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-sm text-foreground hover:bg-background"
      >
        <span
          aria-hidden="true"
          className="flex size-6 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground"
        >
          {identity?.email?.[0]?.toUpperCase() ?? '?'}
        </span>
        {identity?.email}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-10 mt-2 w-56 rounded-md border border-border bg-card py-1 shadow-md"
        >
          {identity?.activeProfile && (
            <NavLink
              role="menuitem"
              to={`/trust/${identity.activeProfile.id}`}
              className={menuLinkClass}
              onClick={() => setOpen(false)}
            >
              My Trust Score
            </NavLink>
          )}
          <NavLink
            role="menuitem"
            to="/settings"
            className={menuLinkClass}
            onClick={() => setOpen(false)}
          >
            Profile &amp; settings
          </NavLink>
          <button
            type="button"
            role="menuitem"
            disabled
            title="Dark mode requires the token/theme system landing at the brand pass — not wired yet"
            className="block w-full px-4 py-2 text-left text-sm text-muted-foreground opacity-60"
          >
            Dark mode (coming with brand pass)
          </button>
          <div className="my-1 border-t border-border" />
          <button
            type="button"
            role="menuitem"
            onClick={logout}
            className="block w-full px-4 py-2 text-left text-sm text-foreground hover:bg-background"
          >
            Log out
          </button>
        </div>
      )}
    </div>
  );
}

ProfileMenu.propTypes = {
  identity: PropTypes.shape({
    email: PropTypes.string,
    activeProfile: PropTypes.shape({ id: PropTypes.string }),
  }),
  logout: PropTypes.func.isRequired,
};

ProfileMenu.defaultProps = {
  identity: null,
};

export default function AppShell({ children }) {
  const { identity, logout } = useSession();
  const isClient = identity?.activeProfile?.role === 'client';

  return (
    <div className="flex min-h-screen">
      <aside className="flex w-56 shrink-0 flex-col border-r border-border bg-card">
        <div className="p-4">
          <span className="text-lg font-semibold tracking-tight text-foreground">Canary</span>
        </div>
        <nav className="flex-1 space-y-1 px-2">
          <NavLink to="/dashboard" className={railLinkClass}>
            <LayoutDashboard className="size-4" aria-hidden="true" />
            Dashboard
          </NavLink>
          <NavLink to="/" className={railLinkClass} end>
            <Search className="size-4" aria-hidden="true" />
            Find Work
          </NavLink>
          <NavLink to="/work" className={railLinkClass}>
            <Briefcase className="size-4" aria-hidden="true" />
            My Work
          </NavLink>
          <NavLink to="/engagements" className={railLinkClass}>
            <Handshake className="size-4" aria-hidden="true" />
            Engagements
          </NavLink>
          {isClient && (
            <>
              <NavLink to="/talent" className={railLinkClass}>
                <Users className="size-4" aria-hidden="true" />
                Find Talent
              </NavLink>
              <NavLink to="/job-posts" className={railLinkClass}>
                <FolderKanban className="size-4" aria-hidden="true" />
                Manage Jobs
              </NavLink>
            </>
          )}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="border-b border-border bg-card">
          <div className="flex items-center justify-end px-6 py-4">
            <ProfileMenu identity={identity} logout={logout} />
          </div>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-8">{children}</main>
      </div>
    </div>
  );
}

AppShell.propTypes = {
  children: PropTypes.node.isRequired,
};
