import { HTMLAttributes, ReactElement, ReactNode } from "react";

// Ported from the design's `Card` (shell.jsx): `<div class="card {card-pad} {className}">`.
// `pad` adds the standard internal padding; compose card-head/card-pad children as needed.
export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  pad?: boolean;
  children?: ReactNode;
}

export function Card({ pad, className = "", children, ...rest }: CardProps): ReactElement {
  const classes = ["card", pad ? "card-pad" : "", className].filter(Boolean).join(" ");
  return (
    <div className={classes} {...rest}>
      {children}
    </div>
  );
}
