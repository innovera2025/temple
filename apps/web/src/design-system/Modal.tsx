import { ReactElement, ReactNode } from "react";
import { Icon } from "../layout/icons";

// Ported from the design's `Modal` (shell.jsx ~2381): a centered dialog over a scrim,
// header with title + optional sub + close (x), body, and optional footer. `wide` caps
// the width at 720px. Styling lives in styles.css (.scrim/.modal*). Icons are the shared
// leaf primitive in layout/icons (no design-system <-> layout cycle: icons import nothing).
export interface ModalProps {
  title: ReactNode;
  sub?: ReactNode;
  onClose: () => void;
  footer?: ReactNode;
  /** Cap the width at min(720px, viewport - 32px). */
  wide?: boolean;
  children?: ReactNode;
}

export function Modal({ title, sub, onClose, footer, wide, children }: ModalProps): ReactElement {
  return (
    <>
      <div className="scrim" onClick={onClose} aria-hidden="true" />
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        style={wide ? { width: "min(720px, calc(100vw - 32px))" } : undefined}
      >
        <div className="modal-head">
          <div>
            <h3>{title}</h3>
            {sub ? (
              <div className="sub muted" style={{ fontSize: 12.5, marginTop: 2 }}>
                {sub}
              </div>
            ) : null}
          </div>
          <button className="iconbtn" type="button" onClick={onClose} aria-label="ปิด">
            <Icon name="x" size={17} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer ? <div className="modal-foot">{footer}</div> : null}
      </div>
    </>
  );
}
