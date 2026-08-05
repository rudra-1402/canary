import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { SessionProvider } from './session/SessionContext.jsx';
import RequireAuth from './RequireAuth.jsx';
import AppShell from './AppShell.jsx';
import Login from './routes/Login.jsx';
import FindWork from './routes/FindWork.jsx';
import JobDetail from './routes/JobDetail.jsx';
import TrustScoreDetail from './routes/TrustScoreDetail.jsx';
import Engagements from './routes/Engagements.jsx';
import RecordOutcome from './routes/RecordOutcome.jsx';

export default function App() {
  return (
    <BrowserRouter>
      <SessionProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            path="/"
            element={
              <RequireAuth>
                <AppShell>
                  <FindWork />
                </AppShell>
              </RequireAuth>
            }
          />
          <Route
            path="/jobs/:id"
            element={
              <RequireAuth>
                <AppShell>
                  <JobDetail />
                </AppShell>
              </RequireAuth>
            }
          />
          <Route
            path="/trust/:profileId"
            element={
              <RequireAuth>
                <AppShell>
                  <TrustScoreDetail />
                </AppShell>
              </RequireAuth>
            }
          />
          <Route
            path="/engagements"
            element={
              <RequireAuth>
                <AppShell>
                  <Engagements />
                </AppShell>
              </RequireAuth>
            }
          />
          <Route
            path="/engagements/:id/review"
            element={
              <RequireAuth>
                <AppShell>
                  <RecordOutcome />
                </AppShell>
              </RequireAuth>
            }
          />
        </Routes>
      </SessionProvider>
    </BrowserRouter>
  );
}
