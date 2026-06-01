import { ReactElement, ReactNode } from "react";
import { Icon } from "../layout/icons";

// Ported from the design's `Drawer` (shell.jsx ~2477): a panel sliding in from the side
// over a scrim. Header shows an optional monospace `sub` (e.g. a document id), the title
// (h2), and an optional `badge`; then body + optional footer. Styling: styles.css (.drawer*).
export interface DrawerProps {
  title: ReactNode;
  /** Small uppercase monospace eyebrow (the design uses it for ids/codes). */
  sub?: ReactNode;
  badge?: ReactNode;
  onClose: () => void;
  footer?: ReactNode;
  children?: ReactNode;
}

export function Drawer({ title, sub, badge, onClose, footer, children }: DrawerProps): ReactElement {
  return (
    <>
      <div className="scrim" onClick={onClose} aria-hidden="true" />
      <div className="drawer" role="dialog" aria-modal="true">
        <div className="drawer-head">
          <div style={{ minWidth: 0 }}>
            {sub ? (
              <div
                className="muted"
                style={{ fontSize: 12, letterSpacing: ".04em", marginBottom: 3, fontFamily: "var(--font-mono)" }}
              >
                {sub}
              </div>
            ) : null}
            <h2 style={{ fontSize: 20 }}>{title}</h2>
            {badge ? <div style={{ marginTop: 10 }}>{badge}</div> : null}
          </div>
          <button className="iconbtn" type="button" onClick={onClose} aria-label="ปิด">
            <Icon name="x" size={18} />
          </button>
        </div>
        <div className="drawer-body">{children}</div>
        {footer ? <div className="drawer-foot">{footer}</div> : null}
      </div>
    </>
  );
}
