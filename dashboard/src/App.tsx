// ZenPanel - Router chính + cổng đăng nhập
import { lazy, Suspense, useEffect, useState } from 'react';
import { Navigate, Route, Routes } from 'react-router';
import { getToken, onAuthChange } from './lib/api';
import { PanelProvider } from './lib/panel';
import { FeedbackProvider } from './components/feedback';
import { JobsProvider } from './components/jobs';
import { TooltipLayer } from './components/TooltipLayer';
import { WhatsNewProvider } from './components/WhatsNew';
import { Shell } from './components/layout/Shell';
import { Spinner } from './components/ui';
import { Login } from './views/Login';

const Overview = lazy(() => import('./views/Overview'));
const Processes = lazy(() => import('./views/Processes'));
const Services = lazy(() => import('./views/Services'));
const Firewall = lazy(() => import('./views/Firewall'));
const Docker = lazy(() => import('./views/Docker'));
const AppStore = lazy(() => import('./views/AppStore'));
const TerminalView = lazy(() => import('./views/Terminal'));
const Websites = lazy(() => import('./views/Websites'));
const FileManager = lazy(() => import('./views/FileManager'));
const Databases = lazy(() => import('./views/Databases'));
const Security = lazy(() => import('./views/Security'));
const Settings = lazy(() => import('./views/Settings'));
const Tasks = lazy(() => import('./views/Tasks'));
const Speedtest = lazy(() => import('./views/Speedtest'));
const ProcManager = lazy(() => import('./views/ProcManager'));

export function App() {
  const [authed, setAuthed] = useState(Boolean(getToken()));
  useEffect(() => onAuthChange(setAuthed), []);

  return (
    <FeedbackProvider>
      <TooltipLayer />
      {!authed ? (
        <Login />
      ) : (
        <PanelProvider>
          <JobsProvider>
          <WhatsNewProvider>
          <Shell>
            <Suspense fallback={<Spinner />}>
              <Routes>
                <Route path="/" element={<Overview />} />
                <Route path="/processes" element={<Processes />} />
                <Route path="/services" element={<Services />} />
                <Route path="/firewall" element={<Firewall />} />
                <Route path="/docker" element={<Docker />} />
                <Route path="/apps" element={<AppStore />} />
                <Route path="/terminal" element={<TerminalView />} />
                <Route path="/websites" element={<Websites />} />
                <Route path="/files" element={<FileManager />} />
                <Route path="/databases" element={<Databases />} />
                <Route path="/security" element={<Security />} />
                <Route path="/settings" element={<Settings />} />
                <Route path="/tasks" element={<Tasks />} />
                <Route path="/speedtest" element={<Speedtest />} />
                <Route path="/procs" element={<ProcManager />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </Suspense>
          </Shell>
          </WhatsNewProvider>
          </JobsProvider>
        </PanelProvider>
      )}
    </FeedbackProvider>
  );
}
