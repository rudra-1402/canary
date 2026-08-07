import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { SessionProvider } from './session/SessionContext.jsx';
import RequireAuth from './RequireAuth.jsx';
import AppShell from './AppShell.jsx';
import Login from './routes/Login.jsx';
import SignUp from './routes/SignUp.jsx';
import Onboarding from './routes/Onboarding.jsx';
import Settings from './routes/Settings.jsx';
import FindWork from './routes/FindWork.jsx';
import JobDetail from './routes/JobDetail.jsx';
import TrustScoreDetail from './routes/TrustScoreDetail.jsx';
import Engagements from './routes/Engagements.jsx';
import EngagementDetail from './routes/EngagementDetail.jsx';
import RecordOutcome from './routes/RecordOutcome.jsx';
import Talent from './routes/Talent.jsx';
import JobPostsOwner from './routes/JobPostsOwner.jsx';

export default function App() {
  return (
    <BrowserRouter>
      <SessionProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<SignUp />} />
          <Route
            path="/onboarding"
            element={
              <RequireAuth>
                <Onboarding />
              </RequireAuth>
            }
          />
          <Route
            path="/settings"
            element={
              <RequireAuth>
                <AppShell>
                  <Settings />
                </AppShell>
              </RequireAuth>
            }
          />
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
            path="/engagements/:id"
            element={
              <RequireAuth>
                <AppShell>
                  <EngagementDetail />
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
          <Route
            path="/talent"
            element={
              <RequireAuth>
                <AppShell>
                  <Talent />
                </AppShell>
              </RequireAuth>
            }
          />
          <Route
            path="/job-posts"
            element={
              <RequireAuth>
                <AppShell>
                  <JobPostsOwner />
                </AppShell>
              </RequireAuth>
            }
          />
        </Routes>
      </SessionProvider>
    </BrowserRouter>
  );
}
