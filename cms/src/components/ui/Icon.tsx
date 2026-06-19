import type { SVGProps } from 'react';

// Minimal inline icon set (stroke-based, 1.75 width) to keep the UI dependency-free.
const paths: Record<string, string> = {
  pages: 'M9 13h6m-6 4h6M9 9h1M5 3h9l5 5v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z',
  media: 'M4 5h16v14H4zM4 15l4-4 4 4 3-3 5 5M9.5 9a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z',
  nav: 'M4 6h16M4 12h16M4 18h16',
  forms: 'M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2m-6 9h6m-6 4h4',
  settings: 'M10.3 4.3a2 2 0 0 1 3.4 0l.4.7 .8-.1a2 2 0 0 1 2.4 2.4l-.1.8.7.4a2 2 0 0 1 0 3.4l-.7.4.1.8a2 2 0 0 1-2.4 2.4l-.8-.1-.4.7a2 2 0 0 1-3.4 0l-.4-.7-.8.1a2 2 0 0 1-2.4-2.4l.1-.8-.7-.4a2 2 0 0 1 0-3.4l.7-.4-.1-.8a2 2 0 0 1 2.4-2.4l.8.1zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z',
  plus: 'M12 5v14M5 12h14',
  trash: 'M4 7h16M10 11v6M14 11v6M5 7l1 13a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-13M9 7V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3',
  edit: 'M4 20h4L18.5 9.5a2.1 2.1 0 0 0-3-3L5 17v3zM13.5 6.5l3 3',
  copy: 'M9 9h10v10H9zM5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1',
  eye: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Zm10 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z',
  share: 'M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7M16 6l-4-4-4 4M12 2v13',
  grid: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  history: 'M3 12a9 9 0 1 0 3-6.7L3 8m0-5v5h5M12 7v5l3 2',
  logout: 'M15 12H3m12 0-4-4m4 4-4 4M9 4h7a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H9',
  drag: 'M9 5h.01M9 12h.01M9 19h.01M15 5h.01M15 12h.01M15 19h.01',
  check: 'M5 13l4 4L19 7',
  x: 'M6 6l12 12M18 6 6 18',
  chevron: 'M9 6l6 6-6 6',
  upload: 'M12 16V4m0 0L8 8m4-4 4 4M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2',
  template: 'M4 5h16v4H4zM4 13h7v6H4zM14 13h6v6h-6z',
  external: 'M14 4h6v6M20 4l-9 9M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5',
};

export function Icon({ name, size = 18, ...rest }: { name: keyof typeof paths | string; size?: number } & SVGProps<SVGSVGElement>) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...rest}
    >
      <path d={paths[name] ?? ''} />
    </svg>
  );
}
