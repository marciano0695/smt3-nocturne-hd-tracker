import { useEffect } from 'react';
import { Icon, type IconName } from './components/Icon';
import { ToastHost } from './components/ui';
import { BuildPage } from './pages/BuildPage';
import { DashboardPage } from './pages/DashboardPage';
import { DemiFiendPage } from './pages/DemiFiendPage';
import { SettingsPage } from './pages/SettingsPage';
import { StoryPage } from './pages/StoryPage';
import { ROUTES, useRoute, type Route } from './state/router';
import { StoreProvider, useStore } from './state/store';

const ICONS: Record<Route, IconName> = {
  dashboard: 'next',
  demifiend: 'fiend',
  build: 'build',
  story: 'story',
  settings: 'settings',
};

const PAGES: Record<Route, () => React.JSX.Element> = {
  dashboard: DashboardPage,
  demifiend: DemiFiendPage,
  build: BuildPage,
  story: StoryPage,
  settings: SettingsPage,
};

function Nav() {
  const route = useRoute();
  return (
    <nav className="nav" aria-label="Main">
      <ul>
        {ROUTES.map((r) => (
          <li key={r.route}>
            <a href={r.href} aria-current={route === r.route ? 'page' : undefined}>
              <Icon name={ICONS[r.route]} size={20} />
              <span>{r.label}</span>
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function Notices() {
  const { notices, dismissNotices } = useStore();
  if (notices.length === 0) return null;
  return (
    <div className="notices" role="alert">
      <Icon name="warning" />
      <ul>
        {notices.map((n) => (
          <li key={n}>{n}</li>
        ))}
      </ul>
      <button type="button" className="notices-dismiss" onClick={dismissNotices}>
        Dismiss
      </button>
    </div>
  );
}

function Shell() {
  const route = useRoute();
  const { state } = useStore();
  const Page = PAGES[route];
  useEffect(() => {
    window.scrollTo(0, 0);
    const label = ROUTES.find((r) => r.route === route)?.label;
    document.title = route === 'dashboard' ? 'Nocturne Tracker' : `${label} · Nocturne Tracker`;
  }, [route]);
  return (
    <div className="app">
      <header className="topbar">
        <a className="wordmark" href="#/">
          <Icon name="orb" size={22} />
          <span>Nocturne Tracker</span>
        </a>
        <span className="topbar-level num">Lv {state.level}</span>
        <Nav />
      </header>
      <main className="main" id="main">
        <Notices />
        <Page key={route} />
      </main>
      <ToastHost />
    </div>
  );
}

export function App() {
  return (
    <StoreProvider>
      <Shell />
    </StoreProvider>
  );
}
