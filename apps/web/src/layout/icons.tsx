import { ReactElement, SVGProps } from "react";

// Line-icon set ported VERBATIM from the captured design's icons.jsx (the `I`
// registry inlined in artifacts/claude-design/.../_bootstrap.html). Each icon uses
// the design's shared svg attrs (viewBox 0 0 24 24, stroke 1.75, round caps/joins),
// applied by the <Icon> wrapper below. See docs/product/design-ui-map.md §3.6 and
// docs/reviews/design-ui-visual-review.md (Task 6).

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
  | "search"
  | "filter"
  | "plus"
  | "check"
  | "checkCircle"
  | "x"
  | "alert"
  | "info"
  | "chevL"
  | "chevR"
  | "chevD"
  | "arrowR"
  | "arrowUp"
  | "download"
  | "upload"
  | "print"
  | "edit"
  | "trash"
  | "phone"
  | "mail"
  | "pin"
  | "clock"
  | "calendar2"
  | "user"
  | "logout"
  | "menu"
  | "dots"
  | "sort"
  | "building"
  | "box"
  | "bell"
  | "external"
  | "lock"
  | "file"
  | "eye"
  | "lotus";

const PATHS: Record<IconName, ReactElement> = {
  dashboard: (
    <>
      <rect x="3" y="3" width="7" height="9" rx="1.5" />
      <rect x="14" y="3" width="7" height="5" rx="1.5" />
      <rect x="14" y="12" width="7" height="9" rx="1.5" />
      <rect x="3" y="16" width="7" height="5" rx="1.5" />
    </>
  ),
  donation: <path d="M12 21s-7-4.4-9.2-9A4.6 4.6 0 0 1 12 7a4.6 4.6 0 0 1 9.2 5c-2.2 4.6-9.2 9-9.2 9z" />,
  donors: (
    <>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3 20a6 6 0 0 1 12 0" />
      <path d="M16 8.5a2.6 2.6 0 0 1 0 5" />
      <path d="M16.5 20a5.5 5.5 0 0 0-2-4.2" />
    </>
  ),
  receipt: (
    <>
      <path d="M6 2.5h12v19l-2.2-1.6L13.6 21 12 19.4 10.4 21l-2.2-1.1L6 21.5z" />
      <path d="M9 8h6M9 12h6" />
    </>
  ),
  ledger: (
    <>
      <path d="M5 3.5h14v17H7a2 2 0 0 1-2-2z" />
      <path d="M9 3.5v17" />
      <path d="M12.5 8.5h3.5M12.5 12h3.5" />
    </>
  ),
  event: (
    <>
      <rect x="3.5" y="5" width="17" height="15.5" rx="2" />
      <path d="M3.5 9.5h17" />
      <path d="M8 3v3.4M16 3v3.4" />
      <path d="M7.5 13.5h3v3h-3z" />
    </>
  ),
  monks: (
    <>
      <circle cx="12" cy="7" r="3.2" />
      <path d="M5.5 20a6.5 6.5 0 0 1 13 0" />
    </>
  ),
  reports: (
    <>
      <path d="M4 20V4" />
      <path d="M4 20h16" />
      <rect x="7" y="11" width="3" height="6" />
      <rect x="12.5" y="7" width="3" height="10" />
      <rect x="18" y="13" width="0.5" height="4" />
    </>
  ),
  roles: (
    <>
      <path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z" />
      <path d="M9.5 12l1.8 1.8L15 10" />
    </>
  ),
  audit: (
    <>
      <path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1L3.5 8" />
      <path d="M3.5 4v4h4" />
      <path d="M12 8v4.3l3 1.7" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.2a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.2a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.2a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.2a1.6 1.6 0 0 0-1.5 1z" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4-4" />
    </>
  ),
  filter: <path d="M3 5h18M6 12h12M10 19h4" />,
  plus: <path d="M12 5v14M5 12h14" />,
  check: <path d="M5 12l4.5 4.5L19 7" />,
  checkCircle: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M8 12l2.6 2.6L16 9" />
    </>
  ),
  x: <path d="M6 6l12 12M18 6L6 18" />,
  alert: (
    <>
      <path d="M12 3.5 1.8 20.5h20.4z" />
      <path d="M12 9.5v4.5M12 17.2v.2" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5M12 7.8v.2" />
    </>
  ),
  chevL: <path d="M15 6l-6 6 6 6" />,
  chevR: <path d="M9 6l6 6-6 6" />,
  chevD: <path d="M6 9l6 6 6-6" />,
  arrowR: <path d="M5 12h14M13 5l7 7-7 7" />,
  arrowUp: <path d="M12 19V5M5 12l7-7 7 7" />,
  download: <path d="M12 3v12M7 11l5 5 5-5M5 21h14" />,
  upload: <path d="M12 21V9M7 13l5-5 5 5M5 4h14" />,
  print: (
    <>
      <path d="M6 9V3h12v6" />
      <rect x="3.5" y="9" width="17" height="8" rx="1.5" />
      <rect x="6" y="14" width="12" height="6.5" />
    </>
  ),
  edit: (
    <>
      <path d="M4 20h4L19 9l-4-4L4 16z" />
      <path d="M14 6l4 4" />
    </>
  ),
  trash: <path d="M4 6.5h16M9 6.5V4h6v2.5M6 6.5 7 20a1.6 1.6 0 0 0 1.6 1.5h6.8A1.6 1.6 0 0 0 17 20l1-13.5" />,
  phone: <path d="M21 16.9v2.6a2 2 0 0 1-2.2 2 19.5 19.5 0 0 1-8.5-3 19.2 19.2 0 0 1-6-6 19.5 19.5 0 0 1-3-8.6A2 2 0 0 1 3.3 2h2.6a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L7 9.6a16 16 0 0 0 6 6l1-1.1a2 2 0 0 1 2.1-.5c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z" />,
  mail: (
    <>
      <rect x="2.5" y="4.5" width="19" height="15" rx="2" />
      <path d="M3 6l9 7 9-7" />
    </>
  ),
  pin: (
    <>
      <path d="M12 21s-6.5-5.5-6.5-11A6.5 6.5 0 0 1 18.5 10c0 5.5-6.5 11-6.5 11z" />
      <circle cx="12" cy="9.5" r="2.3" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  calendar2: (
    <>
      <rect x="3.5" y="5" width="17" height="15.5" rx="2" />
      <path d="M3.5 9.5h17M8 3v3.4M16 3v3.4" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20a7 7 0 0 1 14 0" />
    </>
  ),
  logout: (
    <>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="M16 17l5-5-5-5M21 12H9" />
    </>
  ),
  menu: <path d="M3 6h18M3 12h18M3 18h18" />,
  dots: (
    <>
      <circle cx="5" cy="12" r="0.6" />
      <circle cx="12" cy="12" r="0.6" />
      <circle cx="19" cy="12" r="0.6" />
    </>
  ),
  sort: <path d="M8 4v16M8 20l-3-3M8 4l3 3M16 20V4M16 4l3 3M16 20l-3-3" />,
  building: (
    <>
      <rect x="4" y="3.5" width="16" height="17" rx="1.5" />
      <path d="M9 7.5h.01M9 11h.01M9 14.5h.01M15 7.5h.01M15 11h.01M15 14.5h.01M9.5 20.5v-3h5v3" />
    </>
  ),
  box: (
    <>
      <path d="M21 8 12 3 3 8l9 5 9-5z" />
      <path d="M3 8v8l9 5 9-5V8" />
      <path d="M12 13v8" />
    </>
  ),
  bell: (
    <>
      <path d="M6 8a6 6 0 0 1 12 0c0 6 2 8 2 8H4s2-2 2-8z" />
      <path d="M10 20a2 2 0 0 0 4 0" />
    </>
  ),
  external: <path d="M14 4h6v6M20 4l-9 9M19 14v5a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 19V6.5A1.5 1.5 0 0 1 5 5h5" />,
  lock: (
    <>
      <rect x="4.5" y="10.5" width="15" height="10" rx="2" />
      <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" />
    </>
  ),
  file: (
    <>
      <path d="M14 3v5h5" />
      <path d="M14 3H6.5A1.5 1.5 0 0 0 5 4.5v15A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5V8z" />
    </>
  ),
  eye: (
    <>
      <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  lotus: <path d="M12 20c-4.4 0-8-2.6-8-6 0 0 1.8.9 3.5.9C5.7 13.2 6 10.6 7 9c.9 1.7 2.6 2.7 3.5 3.6C9.6 9.7 10.3 7 12 5c1.7 2 2.4 4.7 1.5 7.6.9-.9 2.6-1.9 3.5-3.6 1 1.6 1.3 4.2-.5 5.9C18.2 14.9 20 14 20 14c0 3.4-3.6 6-8 6z" />,
};

/** All icon names, in design (icons.jsx) order — handy for showcases/iteration. */
export const ICON_NAMES = Object.keys(PATHS) as IconName[];

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
