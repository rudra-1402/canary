import PropTypes from 'prop-types';
import { NavLink } from 'react-router-dom';
import { useSession } from './session/SessionContext.jsx';
import Button from '../components/ui/Button.jsx';

const navLinkClass = ({ isActive }) =>
  `text-sm font-medium ${isActive ? 'text-ink' : 'text-muted hover:text-ink'}`;

export default function AppShell({ children }) {
  const { identity, logout } = useSession();

  return (
    <div className="min-h-screen">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-8">
            <span className="text-lg font-semibold tracking-tight text-ink">Canary</span>
            <nav className="flex items-center gap-6">
              <NavLink to="/" className={navLinkClass} end>
                Find Work
              </NavLink>
            </nav>
          </div>
          <div className="flex items-center gap-4">
            {identity?.email && <span className="text-sm text-muted">{identity.email}</span>}
            <Button variant="ghost" onClick={logout}>
              Log out
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-6 py-8">{children}</main>
    </div>
  );
}

AppShell.propTypes = {
  children: PropTypes.node.isRequired,
};
