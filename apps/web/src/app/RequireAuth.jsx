import PropTypes from 'prop-types';
import { Navigate, useLocation } from 'react-router-dom';
import { useSession } from './session/SessionContext.jsx';
import Spinner from '../components/ui/Spinner.jsx';

export default function RequireAuth({ children }) {
  const { status } = useSession();
  const location = useLocation();

  if (status === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner label="Checking session" />
      </div>
    );
  }

  if (status === 'anonymous') {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return children;
}

RequireAuth.propTypes = {
  children: PropTypes.node.isRequired,
};
