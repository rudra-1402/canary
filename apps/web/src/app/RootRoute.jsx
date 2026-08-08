import { useSession } from './session/SessionContext.jsx';
import AppShell from './AppShell.jsx';
import Landing from './routes/Landing.jsx';
import FindWork from './routes/FindWork.jsx';
import Spinner from '../components/ui/Spinner.jsx';

// "/" branches by session status rather than redirecting: an anonymous
// visitor sees the public Landing page, an authenticated one sees the
// existing FindWork home — no route rename, no broken links elsewhere.
export default function RootRoute() {
  const { status } = useSession();

  if (status === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner label="Loading" />
      </div>
    );
  }

  if (status === 'anonymous') {
    return <Landing />;
  }

  return (
    <AppShell>
      <FindWork />
    </AppShell>
  );
}
