import PropTypes from 'prop-types';
import { Link } from 'react-router-dom';
import RegistrationPlates from './RegistrationPlates.jsx';

// Auth register (build contract §9): desktop split composition, opaque form
// panel one side, expressive field the other, ~20-30% of the composition —
// far quieter than the public hero's full-bleed plates. Mobile drops the
// live field entirely rather than shrinking it, per the same section.
export default function AuthSplit({ children }) {
  return (
    <div className="theme-chromatic-public grid min-h-screen grid-cols-1 lg:grid-cols-5">
      <div className="flex items-center justify-center bg-background px-6 py-12 lg:col-span-3">
        <div className="w-full max-w-sm">
          <Link to="/" className="font-display-brand text-lg font-bold text-foreground">
            Canary
          </Link>
          {children}
        </div>
      </div>
      <div className="relative hidden overflow-hidden bg-ink lg:col-span-2 lg:flex lg:items-center lg:justify-center">
        <span
          aria-hidden="true"
          className="pointer-events-none absolute top-6 left-6 size-4 border-t border-l border-mineral/30"
        />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute right-6 bottom-6 size-4 border-r border-b border-mineral/30"
        />
        <RegistrationPlates className="aspect-square w-3/4 max-w-xs" />
      </div>
    </div>
  );
}

AuthSplit.propTypes = {
  children: PropTypes.node.isRequired,
};
