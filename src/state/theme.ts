import { useEffect, useState } from 'react';

export type ThemeChoice = 'system' | 'light' | 'dark';

// A per-device preference, so it lives outside the save file.
const KEY = 'nocturne-tracker:theme';

function read(): ThemeChoice {
  try {
    const v = window.localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' ? v : 'system';
  } catch {
    return 'system';
  }
}

function apply(choice: ThemeChoice) {
  const root = document.documentElement;
  if (choice === 'system') delete root.dataset.theme;
  else root.dataset.theme = choice;
}

export function initTheme() {
  apply(read());
}

export function useTheme(): [ThemeChoice, (choice: ThemeChoice) => void] {
  const [choice, setChoice] = useState(read);
  useEffect(() => {
    apply(choice);
    try {
      if (choice === 'system') window.localStorage.removeItem(KEY);
      else window.localStorage.setItem(KEY, choice);
    } catch {
      // The theme still applies for this visit.
    }
  }, [choice]);
  return [choice, setChoice];
}
