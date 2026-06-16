import { ReactElement, ReactNode } from "react";
import { Icon } from "../../layout/icons";

// Shared login shell ported from the design's auth.jsx: a split screen with the
// temple "art" brand panel on the left and a centred auth card on the right.
// All three auth planes (staff /auth, devotee /devotee/auth, platform
// /platform/auth) render the SAME shell so every login page looks identical;
// each plane only swaps the card contents (tabs/forms) and, optionally, the
// brand lead copy.

export interface BrandPanelProps {
  /** Brand name shown in the seal header + lead headline. */
  title?: string;
  /** Small uppercase line under the brand name. */
  subtitle?: string;
  /** Lead paragraph under the headline. */
  lead?: string;
}

const DEFAULT_TITLE = "ระบบจัดการวัด";
const DEFAULT_SUBTITLE = "WAT MANAGEMENT SYSTEM";
const DEFAULT_LEAD =
  "ระบบจัดการวัดออนไลน์ สำหรับเจ้าหน้าที่และญาติโยม จองศาลา จองกุฏิ แจ้งบวช ฌาปนกิจ และร่วมบุญออนไลน์";

export function BrandPanel({
  title = DEFAULT_TITLE,
  subtitle = DEFAULT_SUBTITLE,
  lead = DEFAULT_LEAD,
}: BrandPanelProps = {}): ReactElement {
  return (
    <div className="auth-art" data-design-source="user-zip-auth.jsx">
      <svg className="auth-temple" viewBox="0 0 200 200" fill="none" aria-hidden="true">
        <path
          d="M100 20l8 14 8-8-6 16 18-4-12 12 20 4-18 8 14 12-18-2 6 16-14-10-2 16-10-12-10 12-2-16-14 10 6-16-18 2 14-12-18-8 20-4-12-12 18 4-6-16 8 8z"
          fill="currentColor"
        />
        <path
          d="M30 180h140M50 180V130l50-40 50 40v50M75 180v-30h50v30M100 90V60M85 60h30"
          stroke="currentColor"
          strokeWidth="1.5"
        />
      </svg>

      <div className="a-brand">
        <div className="a-seal">
          <Icon name="lotus" size={30} />
        </div>
        <div>
          <div className="a-brand-name">{title}</div>
          <div className="a-brand-sub">{subtitle}</div>
        </div>
      </div>

      <div className="a-lead">
        <div className="a-line" />
        <h1>{title}</h1>
        <p className="a-sub">{lead}</p>
      </div>

      <div className="a-foot">© ๒๕๖๙ ระบบจัดการวัด · เพื่อความสะดวกของพุทธศาสนิกชน</div>
    </div>
  );
}

export interface AuthShellProps {
  /** Optional brand-panel copy override (platform/devotee tailor the lead). */
  brand?: BrandPanelProps;
  /** The card contents (tabs + forms) for this plane. */
  children: ReactNode;
}

/** The full-screen split login layout shared by every auth plane. */
export function AuthShell({ brand, children }: AuthShellProps): ReactElement {
  return (
    <main className="auth">
      <BrandPanel {...brand} />
      <div className="auth-panel">
        {/* Compact brand identity for phones, where the left art panel is hidden. */}
        <div className="auth-mobile-brand">
          <div className="a-seal">
            <Icon name="lotus" size={22} />
          </div>
          <span>{brand?.title ?? DEFAULT_TITLE}</span>
        </div>
        <div className="auth-card">{children}</div>
      </div>
    </main>
  );
}
