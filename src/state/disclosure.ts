import { useState } from 'react';

// Which sections and groups are open is a per-device convenience, so it lives outside the save file.
const KEY = 'nocturne-tracker:open';

function readAll(): Record<string, boolean> {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(KEY) ?? '{}');
    return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, boolean>) : {};
  } catch {
    return {};
  }
}

function writeOne(id: string, open: boolean) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify({ ...readAll(), [id]: open }));
  } catch {
    // Still toggles for this visit.
  }
}

/** Open/closed state remembered per device; `defaultOpen` applies until the player toggles it. */
export function useOpenState(id: string, defaultOpen: boolean): [boolean, (open: boolean) => void] {
  const [stored, setStored] = useState<boolean | undefined>(() =>
    typeof window === 'undefined' ? undefined : readAll()[id],
  );
  const open = stored ?? defaultOpen;
  return [
    open,
    (next) => {
      setStored(next);
      writeOne(id, next);
    },
  ];
}
