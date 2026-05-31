import { ReactElement, ReactNode } from "react";

// Ported from the design's `Badge` (shell.jsx): `<span class="badge {kind} {sq}">`.
// Kinds map to the status palette in docs/product/design-ui-map.md §4.2/§5.2.
export type BadgeKind =
  | "credit"
  | "debit"
  | "pending"
  | "reconciled"
  | "void"
  | "accent"
  | "neutral";

export interface BadgeProps {
  kind?: BadgeKind;
  /** Show a leading status dot. */
  dot?: boolean;
  /** Square (rounded-rect) instead of pill. */
  sq?: boolean;
  children?: ReactNode;
}

export function Badge({ kind = "neutral", dot, sq, children }: BadgeProps): ReactElement {
  const classes = ["badge", kind, sq ? "sq" : ""].filter(Boolean).join(" ");
  return (
    <span className={classes}>
      {dot ? <span className="dot" /> : null}
      {children}
    </span>
  );
}
