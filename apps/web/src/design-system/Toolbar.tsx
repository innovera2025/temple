import { ReactElement, ReactNode } from "react";

// Ported from the design's `Toolbar` (shell.jsx ~2612): a horizontal container that groups
// controls (search, filters, actions) above a table/list. Styling: styles.css (.t-toolbar).
export interface ToolbarProps {
  children?: ReactNode;
  className?: string;
}

export function Toolbar({ children, className = "" }: ToolbarProps): ReactElement {
  return <div className={`t-toolbar ${className}`.trim()}>{children}</div>;
}
