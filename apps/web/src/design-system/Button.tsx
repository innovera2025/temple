import { ButtonHTMLAttributes, ReactElement, ReactNode } from "react";

// Ported from the design's `Btn` (shell.jsx / ds-screen.jsx): a thin wrapper that
// composes the class names `btn btn-{variant} btn-{size}`. Styling lives in
// styles.css against the design tokens. See docs/product/design-ui-map.md §3.6/§4.
export type ButtonVariant = "primary" | "secondary" | "tertiary" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Optional leading icon node. The design keyed icons by name (`icon="plus"`);
   * that string-keyed registry arrives with the icon-set slice — for now pass a node. */
  icon?: ReactNode;
}

export function Button({
  variant = "secondary",
  size,
  icon,
  className = "",
  children,
  // Default to "button" so a Button inside a form does not submit by accident;
  // callers that want submit/reset pass `type` explicitly.
  type = "button",
  ...rest
}: ButtonProps): ReactElement {
  const classes = ["btn", `btn-${variant}`, size ? `btn-${size}` : "", className]
    .filter(Boolean)
    .join(" ");
  return (
    <button type={type} className={classes} {...rest}>
      {icon ? <span className="ico">{icon}</span> : null}
      {children}
    </button>
  );
}
