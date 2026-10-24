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
  lock: (p: SVGProps<SVGSVGElement>) => (<svg {...base} {...p}><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 018 0v4" /></svg>),
  send: (p: SVGProps<SVGSVGElement>) => (<svg {...base} {...p}><path d="M5 12h14M13 6l6 6-6 6" /></svg>),
  stop: (p: SVGProps<SVGSVGElement>) => (<svg {...base} {...p}><rect x="6" y="6" width="12" height="12" rx="2" /></svg>),
  plus: (p: SVGProps<SVGSVGElement>) => (<svg {...base} {...p}><path d="M12 5v14M5 12h14" /></svg>),
  list: (p: SVGProps<SVGSVGElement>) => (<svg {...base} {...p}><path d="M4 6h16M4 12h16M4 18h10" /></svg>),
  x: (p: SVGProps<SVGSVGElement>) => (<svg {...base} {...p}><path d="M6 6l12 12M18 6L6 18" /></svg>),
};
