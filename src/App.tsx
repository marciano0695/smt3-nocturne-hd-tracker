import { useEffect } from 'react';
import { LevelUpActions } from './components/demifiend';
import { Icon, type IconName } from './components/Icon';
import { ToastHost } from './components/ui';
import { BuildPage } from './pages/BuildPage';
import { DashboardPage } from './pages/DashboardPage';
import { DemiFiendPage } from './pages/DemiFiendPage';
import { DemonsPage } from './pages/DemonsPage';
import { SettingsPage } from './pages/SettingsPage';
import { StoryPage } from './pages/StoryPage';
import { ROUTES, useRoute, type Route } from './state/router';
import { upcomingTargets } from './game/scheduler';
import { StoreProvider, useStore } from './state/store';

const ICONS: Record<Route, IconName> = {
  dashboard: 'next',
  demifiend: 'fiend',
  build: 'build',
  story: 'story',
  demons: 'demons',
  settings: 'settings',
};

const PAGES: Record<Route, () => React.JSX.Element> = {
  dashboard: DashboardPage,
  demifiend: DemiFiendPage,
  build: BuildPage,
  story: StoryPage,
  demons: DemonsPage,
  settings: SettingsPage,
};

function NavLink({ route, href, label }: (typeof ROUTES)[number]) {
  const current = useRoute();
  return (
    <a href={href} aria-current={current === route ? 'page' : undefined}>
      <Icon name={ICONS[route]} size={20} />
      <span>{label}</span>
    </a>
  );
}

// On phones Level up and Settings live in the top bar, leaving the tab bar to the pages.
function Nav() {
  return (
    <nav className="nav" aria-label="Main">
      <ul>
        {ROUTES.map((r) => (
          <li key={r.route} className={r.route === 'settings' ? 'nav-settings' : undefined}>
            <NavLink {...r} />
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** Level, equipped Magatama and the next target skill, on every page. */
function StatusStrip() {
  const { state, plan } = useStore();
  const next = upcomingTargets(plan, state.build.target)[0];
  return (
    <p className="status">
      <span className="status-level num">Lv {state.level}</span>
      <span className="status-item">{state.equipped ?? 'No Magatama equipped'}</span>
      <span className="status-item status-target">
        {next ? (
          <>
            Next target: <strong>{next.skill}</strong> at <span className="num">{next.level}</span>
          </>
        ) : (
          'No target skill scheduled'
        )}
      </span>
    </p>
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
        <div className="topbar-levelup">
          <LevelUpActions layout="tab" />
        </div>
        <a
          className="topbar-settings icon-btn"
          href="#/settings"
          aria-label="Settings"
          aria-current={route === 'settings' ? 'page' : undefined}
        >
          <Icon name="settings" size={20} />
        </a>
        <StatusStrip />
        <div className="rail-levelup">
          <LevelUpActions layout="rail" />
        </div>
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
