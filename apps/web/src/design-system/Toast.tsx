import { ReactElement, ReactNode } from "react";
import { Icon } from "../layout/icons";

// Ported from the design's `Toast` (shell.jsx ~2588): a transient confirmation with a
// checkCircle icon. Renders nothing when `msg` is empty. The design auto-clears the
// message after 2600ms — that timer belongs to the owner of the message state, not this
// presentational component, so callers clear `msg` on their own schedule.
export interface ToastProps {
  msg?: ReactNode;
}

export function Toast({ msg }: ToastProps): ReactElement | null {
  if (!msg) return null;
  return (
    <div className="toast" role="status" aria-live="polite">
      <Icon name="checkCircle" size={17} className="ico" />
      {msg}
    </div>
  );
}
