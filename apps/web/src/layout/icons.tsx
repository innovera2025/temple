import { ReactElement, SVGProps } from "react";

// Interim line-icon set for the shell/nav (strokeWidth 1.75, 24x24, like the
// design's icons.jsx). These are tasteful stand-ins — the pixel-accurate
// icons.jsx port is a follow-up slice (design-ui-map.md §3.6, Task 6 visual review).
export type IconName =
  | "dashboard"
  | "donation"
  | "donors"
  | "receipt"
  | "ledger"
  | "event"
  | "monks"
  | "reports"
  | "roles"
  | "audit"
  | "settings"
  | "lotus"
  | "menu"
  | "search"
  | "logout"
  | "chevR"
  | "building"
  | "box";

const PATHS: Record<IconName, ReactElement> = {
  dashboard: <path d="M4 13h7V4H4v9Zm0 7h7v-5H4v5Zm9 0h7v-9h-7v9Zm0-16v5h7V4h-7Z" />,
  donation: (
    <>
      <path d="M12 21s-7-4.35-9.5-8.5C1 9.5 2.5 5.5 6 5.5c2 0 3 1.2 3.8 2.3.8-1.1 1.8-2.3 3.8-2.3 3.5 0 5 4 3.5 7C19 16.65 12 21 12 21Z" />
    </>
  ),
  donors: (
    <>
      <circle cx="9" cy="8" r="3" />
      <path d="M3.5 20a5.5 5.5 0 0 1 11 0M16 11a3 3 0 1 0-1-5.8M20.5 20a5.5 5.5 0 0 0-4-5.3" />
    </>
  ),
  receipt: (
    <>
      <path d="M6 3h12v18l-2.5-1.6L13 21l-2.5-1.6L8 21l-2-1.6V3Z" />
      <path d="M9 8h6M9 12h6" />
    </>
  ),
  ledger: (
    <>
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <path d="M8 9h8M8 13h8M8 17h4" />
    </>
  ),
  event: (
    <>
      <rect x="4" y="5" width="16" height="15" rx="2" />
      <path d="M4 9h16M8 3v4M16 3v4" />
    </>
  ),
  monks: (
    <>
      <circle cx="12" cy="7" r="3.2" />
      <path d="M5.5 20c0-3.6 2.9-6.5 6.5-6.5s6.5 2.9 6.5 6.5" />
    </>
  ),
  reports: (
    <>
      <path d="M5 21V4a1 1 0 0 1 1-1h8l5 5v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1Z" />
      <path d="M14 3v5h5M8 13h8M8 17h5" />
    </>
  ),
  roles: (
    <>
      <circle cx="12" cy="8" r="3.2" />
      <path d="M6 20a6 6 0 0 1 12 0" />
      <path d="M18.5 3.5l1.2 2.4 2.3.4-1.7 1.6.4 2.4-2.2-1.2-2.2 1.2.4-2.4-1.7-1.6 2.3-.4 1.2-2.4Z" />
    </>
  ),
  audit: (
    <>
      <path d="M9 4h6M8 4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2" />
      <path d="m9 13 2 2 4-4" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5 5l2.1 2.1M16.9 16.9 19 19M19 5l-2.1 2.1M7.1 16.9 5 19" />
    </>
  ),
  lotus: (
    <>
      <path d="M12 21c-4.5 0-8-2.5-8-5.5 0 0 3 .5 4.5 2C8 14 9 9 12 5c3 4 4 9 3.5 12.5C17 16 20 15.5 20 15.5c0 3-3.5 5.5-8 5.5Z" />
    </>
  ),
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  search: (
    <>
      <circle cx="11" cy="11" r="6" />
      <path d="m20 20-3.2-3.2" />
    </>
  ),
  logout: (
    <>
      <path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4" />
      <path d="M10 8l-4 4 4 4M6 12h10" />
    </>
  ),
  chevR: <path d="m9 6 6 6-6 6" />,
  building: (
    <>
      <path d="M4 21V5a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v16" />
      <path d="M15 9h4a1 1 0 0 1 1 1v11M3 21h18M8 8h3M8 12h3M8 16h3" />
    </>
  ),
  box: (
    <>
      <path d="M21 8 12 3 3 8v8l9 5 9-5V8Z" />
      <path d="m3 8 9 5 9-5M12 13v8" />
    </>
  ),
};

export interface IconProps extends SVGProps<SVGSVGElement> {
  name: IconName;
  size?: number;
}

export function Icon({ name, size = 18, className, ...rest }: IconProps): ReactElement {
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
      className={className}
      aria-hidden="true"
      {...rest}
    >
      {PATHS[name]}
    </svg>
  );
}
