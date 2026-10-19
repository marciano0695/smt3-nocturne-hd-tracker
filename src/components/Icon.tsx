const PATHS = {
  next: 'M5 12h12M13 6l6 6-6 6',
  chevron: 'M9 6l6 6-6 6',
  fiend: 'M12 3a5 5 0 0 1 5 5c0 3-2 4-2 6H9c0-2-2-3-2-6a5 5 0 0 1 5-5ZM9 18h6M10 21h4',
  build: 'M4 6h16M4 12h10M4 18h7M17 15l3 3-3 3',
  story: 'M6 3h9l3 3v15H6zM9 9h6M9 13h6M9 17h3',
  demons: 'M5 3l2.5 6M19 3l-2.5 6M6.5 9h11v4a5.5 5.5 0 0 1-11 0zM10 13h.01M14 13h.01M10.5 17h3',
  settings:
    'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6ZM19 12a7 7 0 0 0-.1-1.2l2-1.5-2-3.4-2.3.9a7 7 0 0 0-2-1.2L14.2 3h-4l-.4 2.6a7 7 0 0 0-2 1.2l-2.3-.9-2 3.4 2 1.5a7 7 0 0 0 0 2.4l-2 1.5 2 3.4 2.3-.9a7 7 0 0 0 2 1.2l.4 2.6h4l.4-2.6a7 7 0 0 0 2-1.2l2.3.9 2-3.4-2-1.5c.1-.4.1-.8.1-1.2Z',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  lock: 'M7 11V8a5 5 0 0 1 10 0v3M5 11h14v10H5z',
  warning: 'M12 4 2.5 20h19L12 4ZM12 10v4M12 17v.5',
  plus: 'M12 5v14M5 12h14',
  close: 'M6 6l12 12M18 6 6 18',
  up: 'M12 19V5M6 11l6-6 6 6',
  down: 'M12 5v14M6 13l6 6 6-6',
  grip: 'M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01',
  undo: 'M9 14 4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3',
  save: 'M5 4h11l3 3v13H5zM8 4v5h7V4M8 20v-6h8v6',
  edit: 'M4 20h4L19 9l-4-4L4 16zM13 7l4 4',
  trash: 'M5 7h14M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
  download: 'M12 4v12M7 11l5 5 5-5M5 20h14',
  upload: 'M12 20V8M7 13l5-5 5 5M5 4h14',
  orb: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18ZM12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10Z',
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
