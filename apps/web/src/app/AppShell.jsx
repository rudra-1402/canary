import PropTypes from 'prop-types';
import { useEffect, useRef, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { ChevronDown } from 'lucide-react';
import { useSession } from './session/SessionContext.jsx';

const navLinkClass = ({ isActive }) =>
  `text-sm font-medium ${isActive ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'}`;

const menuLinkClass = ({ isActive }) =>
  `block px-4 py-2 text-sm ${isActive ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'}`;

// Same click-toggle + outside-click-close + Escape pattern as ProfileMenu below —
// kept local rather than extracted since each menu's trigger/content differ.
function useDismissableMenu() {
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

  return { open, setOpen, rootRef };
}

function NavGroupDropdown({ label, items, active }) {
  const { open, setOpen, rootRef } = useDismissableMenu();

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className={`flex items-center gap-1 text-sm font-medium ${
          active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
        }`}
      >
        {label}
        <ChevronDown className="size-3.5" aria-hidden="true" />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute left-0 z-10 mt-2 w-48 rounded-md border border-border bg-card py-1 shadow-md"
        >
          {items.map((item) => (
            <NavLink
              key={item.to}
              role="menuitem"
              to={item.to}
              end={item.end}
              className={menuLinkClass}
              onClick={() => setOpen(false)}
            >
              {item.label}
            </NavLink>
          ))}
        </div>
      )}
    </div>
  );
}

NavGroupDropdown.propTypes = {
  label: PropTypes.string.isRequired,
  items: PropTypes.arrayOf(
    PropTypes.shape({
      to: PropTypes.string.isRequired,
      label: PropTypes.string.isRequired,
      end: PropTypes.bool,
    }),
  ).isRequired,
  active: PropTypes.bool.isRequired,
};

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

const WORK_GROUP_ITEMS = [
  { to: '/', label: 'Find Work', end: true },
  { to: '/work', label: 'My Work' },
  { to: '/engagements', label: 'Engagements' },
];

const HIRING_GROUP_ITEMS = [
  { to: '/talent', label: 'Find Talent' },
  { to: '/job-posts', label: 'Manage Jobs' },
];

export default function AppShell({ children }) {
  const { identity, logout } = useSession();
  const location = useLocation();
  const isClient = identity?.activeProfile?.role === 'client';

  const workActive = WORK_GROUP_ITEMS.some((item) =>
    item.end ? location.pathname === item.to : location.pathname.startsWith(item.to),
  );
  const hiringActive = HIRING_GROUP_ITEMS.some((item) => location.pathname.startsWith(item.to));

  return (
    <div className="min-h-screen">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-8">
            <span className="text-lg font-semibold tracking-tight text-foreground">Canary</span>
            <nav className="flex items-center gap-6">
              <NavLink to="/dashboard" className={navLinkClass}>
                Dashboard
              </NavLink>
              <NavGroupDropdown label="Work" items={WORK_GROUP_ITEMS} active={workActive} />
              {isClient && (
                <NavGroupDropdown label="Hiring" items={HIRING_GROUP_ITEMS} active={hiringActive} />
              )}
            </nav>
          </div>
          <ProfileMenu identity={identity} logout={logout} />
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
    </div>
  );
}

AppShell.propTypes = {
  children: PropTypes.node.isRequired,
};
