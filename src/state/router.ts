import { useSyncExternalStore } from 'react';

export type Route = 'dashboard' | 'demifiend' | 'build' | 'story' | 'demons' | 'settings';

export const ROUTES: { route: Route; label: string; href: string }[] = [
  { route: 'dashboard', label: 'Next', href: '#/' },
  { route: 'demifiend', label: 'Demi-fiend', href: '#/demifiend' },
  { route: 'build', label: 'Build', href: '#/build' },
  { route: 'story', label: 'Story', href: '#/story' },
  { route: 'demons', label: 'Demons', href: '#/demons' },
  { route: 'settings', label: 'Settings', href: '#/settings' },
];

function current(): Route {
  const path = window.location.hash.replace(/^#\/?/, '').split(/[/?]/)[0];
  return ROUTES.find((r) => r.route === path)?.route ?? 'dashboard';
}

function subscribe(onChange: () => void) {
  window.addEventListener('hashchange', onChange);
  return () => window.removeEventListener('hashchange', onChange);
}

export function useRoute(): Route {
  return useSyncExternalStore(subscribe, current, () => 'dashboard' as Route);
}
