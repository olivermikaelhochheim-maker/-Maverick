import type { SVGProps } from "react";

const base = { fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round", strokeLinejoin: "round", viewBox: "0 0 24 24", "aria-hidden": true } as const;

export const Icon = {
  home: (p: SVGProps<SVGSVGElement>) => (<svg {...base} {...p}><path d="M3 11l9-7 9 7" /><path d="M5 10v10h14V10" /></svg>),
  chat: (p: SVGProps<SVGSVGElement>) => (<svg {...base} {...p}><path d="M4 5h16v11H8l-4 4z" /></svg>),
  chart: (p: SVGProps<SVGSVGElement>) => (<svg {...base} {...p}><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></svg>),
  shield: (p: SVGProps<SVGSVGElement>) => (<svg {...base} {...p}><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" /></svg>),
  gear: (p: SVGProps<SVGSVGElement>) => (<svg {...base} {...p}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z" /></svg>),
  check: (p: SVGProps<SVGSVGElement>) => (<svg {...base} {...p}><rect x="4" y="4" width="16" height="16" rx="3" /><path d="M8.5 12.5l2.5 2.5 4.5-5" /></svg>),
  brain: (p: SVGProps<SVGSVGElement>) => (<svg {...base} {...p}><path d="M12 5a3 3 0 00-5.6-1.5A3 3 0 004 7.5a3 3 0 00-.5 5A3.5 3.5 0 007 18h1a3 3 0 004 1.5M12 5a3 3 0 015.6-1.5A3 3 0 0120 7.5a3 3 0 01.5 5A3.5 3.5 0 0117 18h-1a3 3 0 01-4 1.5M12 5v14.5" /></svg>),
  clip: (p: SVGProps<SVGSVGElement>) => (<svg {...base} {...p}><path d="M21 11.5l-8.6 8.6a5.5 5.5 0 01-7.8-7.8l8.6-8.6a3.7 3.7 0 015.2 5.2l-8.6 8.6a1.8 1.8 0 01-2.6-2.6l7.9-7.9" /></svg>),
  files: (p: SVGProps<SVGSVGElement>) => (<svg {...base} {...p}><path d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8z" /><path d="M14 3v5h5M9 13h6M9 17h6" /></svg>),
  mic: (p: SVGProps<SVGSVGElement>) => (<svg {...base} {...p}><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0014 0M12 18v3" /></svg>),
  lock: (p: SVGProps<SVGSVGElement>) => (<svg {...base} {...p}><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 018 0v4" /></svg>),
  send: (p: SVGProps<SVGSVGElement>) => (<svg {...base} {...p}><path d="M5 12h14M13 6l6 6-6 6" /></svg>),
  stop: (p: SVGProps<SVGSVGElement>) => (<svg {...base} {...p}><rect x="6" y="6" width="12" height="12" rx="2" /></svg>),
  plus: (p: SVGProps<SVGSVGElement>) => (<svg {...base} {...p}><path d="M12 5v14M5 12h14" /></svg>),
  list: (p: SVGProps<SVGSVGElement>) => (<svg {...base} {...p}><path d="M4 6h16M4 12h16M4 18h10" /></svg>),
  x: (p: SVGProps<SVGSVGElement>) => (<svg {...base} {...p}><path d="M6 6l12 12M18 6L6 18" /></svg>),
  target: (p: SVGProps<SVGSVGElement>) => (<svg {...base} {...p}><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="4" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3" /></svg>),
  cpu: (p: SVGProps<SVGSVGElement>) => (<svg {...base} {...p}><rect x="6" y="6" width="12" height="12" rx="2" /><path d="M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4" /></svg>),
  calendar: (p: SVGProps<SVGSVGElement>) => (<svg {...base} {...p}><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></svg>),
  wallet: (p: SVGProps<SVGSVGElement>) => (<svg {...base} {...p}><path d="M3 7h16a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2z" /><path d="M3 7l12-3v3M16 13.5h2" /></svg>),
  pulse: (p: SVGProps<SVGSVGElement>) => (<svg {...base} {...p}><path d="M3 12h4l2-5 4 10 2-5h6" /></svg>),
  mail: (p: SVGProps<SVGSVGElement>) => (<svg {...base} {...p}><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 7l9 6 9-6" /></svg>),
  search: (p: SVGProps<SVGSVGElement>) => (<svg {...base} {...p}><circle cx="11" cy="11" r="7" /><path d="M20 20l-4-4" /></svg>),
  repeat: (p: SVGProps<SVGSVGElement>) => (<svg {...base} {...p}><path d="M4 12a8 8 0 0114-5.3L20 9M20 4v5h-5M20 12a8 8 0 01-14 5.3L4 15M4 20v-5h5" /></svg>),
  log: (p: SVGProps<SVGSVGElement>) => (<svg {...base} {...p}><path d="M5 4h14v16H5zM8 8h8M8 12h8M8 16h5" /></svg>),
  bell: (p: SVGProps<SVGSVGElement>) => (<svg {...base} {...p}><path d="M6 16V11a6 6 0 0112 0v5l2 2H4zM10 21h4" /></svg>),
  sliders: (p: SVGProps<SVGSVGElement>) => (<svg {...base} {...p}><path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0" /><circle cx="16" cy="6" r="2" /><circle cx="10" cy="12" r="2" /><circle cx="18" cy="18" r="2" /></svg>),
  grid: (p: SVGProps<SVGSVGElement>) => (<svg {...base} {...p}><rect x="4" y="4" width="7" height="7" rx="1" /><rect x="13" y="4" width="7" height="7" rx="1" /><rect x="4" y="13" width="7" height="7" rx="1" /><rect x="13" y="13" width="7" height="7" rx="1" /></svg>),
};
