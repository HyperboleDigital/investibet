import type { ReactElement } from 'react';

/* SVG sprite of SF Symbol shapes. One import everywhere: <Symbol name="football" />.
   Add new glyphs here, never inline SVGs or emoji in screens. */
const P = (d: string) => <path d={d} />;
const GLYPHS: Record<string, ReactElement> = {
  sportscourt: <><rect x="2.5" y="5" width="19" height="14" rx="2" /><path d="M12 5v14" /><circle cx="12" cy="12" r="2.8" /></>,
  football: <><ellipse cx="12" cy="12" rx="9.5" ry="5.5" transform="rotate(-45 12 12)" /><path d="M9.2 14.8l5.6-5.6M10.4 12.5l1.1 1.1M12 10.9l1.1 1.1M13.6 9.3l1.1 1.1" /></>,
  basketball: <><circle cx="12" cy="12" r="9" /><path d="M12 3v18M3 12h18M6.2 5.4c3.2 3.4 3.2 9.8 0 13.2M17.8 5.4c-3.2 3.4-3.2 9.8 0 13.2" /></>,
  baseball: <><circle cx="12" cy="12" r="9" /><path d="M6.3 5.6c1.9 1.7 3 4 3 6.4s-1.1 4.7-3 6.4M17.7 5.6c-1.9 1.7-3 4-3 6.4s1.1 4.7 3 6.4" /></>,
  puck: <><ellipse cx="12" cy="9.5" rx="8.5" ry="3.5" /><path d="M3.5 9.5V14c0 1.9 3.8 3.5 8.5 3.5s8.5-1.6 8.5-3.5V9.5" /></>,
  flame: P('M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z'),
  magnifyingglass: <><circle cx="11" cy="11" r="7" /><path d="M16 16l5 5" /></>,
  chart: <><path d="M3 4v16h18" /><path d="M6.5 15l4-4.5 3 2.5 5.5-6.5" /></>,
  star: <path d="M12 2.6l2.9 5.9 6.5 1-4.7 4.6 1.1 6.4-5.8-3-5.8 3 1.1-6.4L2.6 9.5l6.5-1z" fill="currentColor" stroke="none" />,
  trophy: P('M8 21h8M12 17v4M6 4h12v4a6 6 0 0 1-12 0zM6 6H3a3 3 0 0 0 3 3M18 6h3a3 3 0 0 1-3 3'),
  medal: <><circle cx="12" cy="15" r="5" /><path d="M8.5 10.8L6 3h4.5L12 7l1.5-4H18l-2.5 7.8" /></>,
  shield: P('M12 3l7 3v5.5c0 4.4-3 7.6-7 9.5-4-1.9-7-5.1-7-9.5V6z'),
  ticket: <><path d="M3 8a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-2a2 2 0 0 0 0-4z" /><path d="M14 6v12" strokeDasharray="2 3" /></>,
  lines: P('M3 4h18v16H3zM3 10h18M9 4v16'),
  calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 9.5h18M8 3v4M16 3v4" /></>,
  live: <><circle cx="12" cy="12" r="2.4" fill="currentColor" stroke="none" /><path d="M7.5 7.5a6.4 6.4 0 0 0 0 9M16.5 7.5a6.4 6.4 0 0 1 0 9" /></>,
  xmark: P('M6 6l12 12M18 6L6 18'),
  arrowleft: P('M19 12H5M12 19l-7-7 7-7'),
  uptri: <path d="M12 7l6 8H6z" fill="currentColor" stroke="none" />,
  eye: <><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" /><circle cx="12" cy="12" r="3" /></>,
  eyeslash: <><path d="M2.5 12S6 5.5 12 5.5a9.7 9.7 0 0 1 4.5 1.2M21.5 12S18 18.5 12 18.5a9.7 9.7 0 0 1-4.5-1.2M4 20L20 4" /></>,
  downtri: <path d="M12 17l-6-8h12z" fill="currentColor" stroke="none" />,
  chevron: P('M9 5l7 7-7 7'),
  share: <><path d="M12 14.5V3M8 6.8L12 2.8l4 4" /><path d="M5.5 11v8A1.5 1.5 0 0 0 7 20.5h10a1.5 1.5 0 0 0 1.5-1.5v-8" /></>,
  copy: <><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h8" /></>,
  picks: P('M4 6h16v12H4zM8 10h8M8 14h5'),
  home: P('M3 12l9-8 9 8M5 10v10h14V10'),
};

export default function Symbol({ name, size = 16 }: { name: string; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{GLYPHS[name] ?? null}</svg>;
}
