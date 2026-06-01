import { ReactElement } from "react";
import { Icon } from "../layout/icons";

// Ported from the design's `SearchBox` (shell.jsx ~2624): a 240px search input with a
// leading magnifier, reusing the `.tb-search` chrome with inline overrides (margin 0,
// surface background) so it sits inside a toolbar. The Topbar keeps its own wider search
// variant; this is the reusable primitive for feature list/table toolbars.
export interface SearchBoxProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  ariaLabel?: string;
}

export function SearchBox({
  value,
  onChange,
  placeholder = "ค้นหา",
  ariaLabel,
}: SearchBoxProps): ReactElement {
  return (
    <div className="tb-search" style={{ margin: 0, width: 240, background: "var(--surface)" }}>
      <Icon name="search" size={15} style={{ color: "var(--ink-3)" }} />
      <input
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-label={ariaLabel ?? placeholder}
      />
    </div>
  );
}
