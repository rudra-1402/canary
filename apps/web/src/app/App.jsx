import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { SessionProvider } from './session/SessionContext.jsx';
import RequireAuth from './RequireAuth.jsx';
import AppShell from './AppShell.jsx';
import Login from './routes/Login.jsx';
import FindWork from './routes/FindWork.jsx';

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
        </Routes>
      </SessionProvider>
    </BrowserRouter>
  );
}
