import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { PublicTempleProfile, PublicTempleSummary } from "@wat/shared";
import { DevoteeLoginView } from "./login-view";
import { MyRecords } from "./my-records";
import { TemplePage } from "./temple-page";
import { TemplePicker } from "./temple-picker";
import {
  DevoteeApi,
  DevoteeCeremonyRecord,
  DevoteeDonationRecord,
  DevoteeReceiptRecord,
  bahtStringToSatang,
  deriveDevoteeSession,
  hasLoginErrors,
  validateDevoteeLoginForm,
  validateDevoteeRegisterForm,
} from "./devotee-auth";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const templeId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

const templeSummary: PublicTempleSummary = {
  id: templeId,
  nameTh: "วัดอรุณเดโม",
  nameEn: "Wat Arun Demo",
  province: "กรุงเทพมหานคร",
  district: "บางกอกใหญ่",
  logoUrl: null,
};

const templeProfile: PublicTempleProfile = {
  ...templeSummary,
  addressTh: "เลขที่ 1",
  subdistrict: "วัดอรุณ",
  postalCode: "10600",
  phone: "021111111",
  email: "wat@example.com",
  lineId: null,
  websiteUrl: null,
  abbotName: "พระเดโม",
  denomination: "มหานิกาย",
};

const donationRecord: DevoteeDonationRecord = {
  id: "11111111-1111-4111-8111-111111111111",
  templeId,
  templeNameTh: "วัดอรุณเดโม",
  amountSatang: "50000",
  currency: "THB",
  method: "cash",
  donationDate: "2026-06-01",
  status: "confirmed",
  note: null,
  createdAt: "2026-06-01T00:00:00.000Z",
};

const receiptRecord: DevoteeReceiptRecord = {
  id: "22222222-2222-4222-8222-222222222222",
  receiptNo: "RC-2026-0001",
  status: "issued",
  issuedAt: "2026-06-01T00:00:00.000Z",
  templeId,
  templeNameTh: "วัดอรุณเดโม",
  donationId: donationRecord.id,
  amountSatang: "50000",
  donationDate: "2026-06-01",
};

const ceremonyRecord: DevoteeCeremonyRecord = {
  id: "33333333-3333-4333-8333-333333333333",
  templeId,
  templeNameTh: "วัดอรุณเดโม",
  ceremonyType: "merit",
  title: "ทำบุญขึ้นบ้านใหม่",
  ceremonyDate: "2026-07-01",
  status: "requested",
  timeNote: null,
  location: null,
  createdAt: "2026-06-05T00:00:00.000Z",
};

function makeApi(overrides: Partial<DevoteeApi> = {}): DevoteeApi {
  return {
    register: async () => ({ accessToken: "a", refreshToken: "r" }),
    login: async () => ({ accessToken: "a", refreshToken: "r" }),
    listTemples: async () => [templeSummary],
    getTemple: async () => templeProfile,
    donate: async () => ({
      donation: { id: "d1", amountSatang: "50000", method: "cash", donationDate: "2026-06-01", status: "confirmed" },
      ledgerEntry: { id: "l1", entryNo: "LG-2026-0001" },
    }),
    bookCeremony: async () => ({
      booking: { id: "c1", status: "requested", title: "ทำบุญขึ้นบ้านใหม่", ceremonyDate: "2026-07-01" },
    }),
    myDonations: async () => [donationRecord],
    myReceipts: async () => [receiptRecord],
    myCeremonies: async () => [ceremonyRecord],
    ...overrides,
  };
}

function flush(): Promise<void> {
  return act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
}

describe("devotee-auth logic", () => {
  it("validates the register form (email, password length, confirm match)", () => {
    const errors = validateDevoteeRegisterForm({
      email: "bad",
      displayName: "",
      password: "short",
      confirmPassword: "mismatch",
      phone: "",
    });
    expect(errors.email).toBeTruthy();
    expect(errors.displayName).toBeTruthy();
    expect(errors.password).toBeTruthy();
    expect(errors.confirmPassword).toBeTruthy();
  });

  it("accepts a valid login and rejects an empty one", () => {
    expect(hasLoginErrors(validateDevoteeLoginForm({ email: "a@b.com", password: "secret" }))).toBe(false);
    expect(hasLoginErrors(validateDevoteeLoginForm({ email: "", password: "" }))).toBe(true);
  });

  it("converts a ฿ string to integer satang and rejects bad input", () => {
    expect(bahtStringToSatang("100")).toBe(10000);
    expect(bahtStringToSatang("1,234.50")).toBe(123450);
    expect(Number.isNaN(bahtStringToSatang("abc"))).toBe(true);
    expect(Number.isNaN(bahtStringToSatang("1.234"))).toBe(true);
  });

  it("derives a session from the token claims, falling back to the form display name", () => {
    const payload = Buffer.from(JSON.stringify({ sub: "dev-1", email: "Me@Example.com" })).toString("base64url");
    const token = `h.${payload}.s`;
    const session = deriveDevoteeSession({ accessToken: token }, { email: "typed@x.com", displayName: "คุณโยม" });
    expect(session.devotee.id).toBe("dev-1");
    expect(session.devotee.email).toBe("me@example.com");
    expect(session.devotee.displayName).toBe("คุณโยม");
  });
});

describe("devotee views (static)", () => {
  it("login view shows both tabs and the login fields", () => {
    const html = renderToStaticMarkup(
      <DevoteeLoginView api={makeApi()} onAuthenticated={() => undefined} />,
    );
    expect(html).toContain("เข้าสู่ระบบ");
    expect(html).toContain("สมัครสมาชิก");
    expect(html).toContain("อีเมล");
    expect(html).toContain("ร่วมบุญออนไลน์");
  });
});

describe("devotee views (mounted)", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("temple picker lists active temples and selecting one fires onSelect", async () => {
    let selected = "";
    await act(async () => {
      root.render(
        <TemplePicker
          api={makeApi()}
          token="t"
          onSelect={(id) => {
            selected = id;
          }}
          onUnauthorized={() => undefined}
        />,
      );
    });
    await flush();
    expect(container.textContent).toContain("วัดอรุณเดโม");

    const button = Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("เลือกวัดนี้"),
    );
    expect(button).toBeTruthy();
    await act(async () => {
      button?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(selected).toBe(templeId);
  });

  it("temple page donate flow posts the donation and shows the success entry no", async () => {
    await act(async () => {
      root.render(
        <TemplePage
          api={makeApi()}
          token="t"
          templeId={templeId}
          today="2026-06-04"
          onBack={() => undefined}
          onUnauthorized={() => undefined}
        />,
      );
    });
    await flush();
    expect(container.textContent).toContain("ร่วมทำบุญ");
    expect(container.textContent).toContain("พระเดโม");

    const amount = container.querySelector<HTMLInputElement>("#devotee-amount");
    expect(amount).toBeTruthy();
    await act(async () => {
      if (amount) {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
        setter?.call(amount, "500");
        amount.dispatchEvent(new Event("input", { bubbles: true }));
      }
    });

    const form = container.querySelector("form");
    await act(async () => {
      form?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    await flush();
    expect(container.textContent).toContain("อนุโมทนาบุญ");
    expect(container.textContent).toContain("LG-2026-0001");
  });

  it("blocks an over-cap donation client-side without calling the API", async () => {
    let donateCalled = false;
    const api = makeApi({
      donate: async () => {
        donateCalled = true;
        return {
          donation: { id: "d1", amountSatang: "1", method: "cash", donationDate: "2026-06-04", status: "confirmed" },
          ledgerEntry: { id: "l1", entryNo: "LG-1" },
        };
      },
    });
    await act(async () => {
      root.render(
        <TemplePage
          api={api}
          token="t"
          templeId={templeId}
          today="2026-06-04"
          onBack={() => undefined}
          onUnauthorized={() => undefined}
        />,
      );
    });
    await flush();
    const amount = container.querySelector<HTMLInputElement>("#devotee-amount");
    await act(async () => {
      if (amount) {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
        setter?.call(amount, "1000000001"); // ฿1,000,000,001 — above the ฿1,000,000,000 cap
        amount.dispatchEvent(new Event("input", { bubbles: true }));
      }
    });
    const form = container.querySelector("form");
    await act(async () => {
      form?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    await flush();
    expect(container.textContent).toContain("จำนวนเงินสูงเกินไป");
    expect(donateCalled).toBe(false);
  });

  it("my records renders the donation + receipt + ceremony rows", async () => {
    await act(async () => {
      root.render(<MyRecords api={makeApi()} token="t" onUnauthorized={() => undefined} />);
    });
    await flush();
    expect(container.textContent).toContain("รายการบริจาค");
    expect(container.textContent).toContain("ใบอนุโมทนา");
    expect(container.textContent).toContain("RC-2026-0001");
    expect(container.textContent).toContain("วัดอรุณเดโม");
    // Phase 2: ceremony bookings section + the requested-status booking.
    expect(container.textContent).toContain("การจองพิธี / นิมนต์พระ");
    expect(container.textContent).toContain("ทำบุญขึ้นบ้านใหม่");
    expect(container.textContent).toContain("รอยืนยัน");
  });

  it("temple page ceremony booking posts the request and shows the pending message", async () => {
    await act(async () => {
      root.render(
        <TemplePage
          api={makeApi()}
          token="t"
          templeId={templeId}
          today="2026-06-04"
          onBack={() => undefined}
          onUnauthorized={() => undefined}
        />,
      );
    });
    await flush();
    expect(container.textContent).toContain("จองพิธี / นิมนต์พระ");

    const title = container.querySelector<HTMLInputElement>("#ceremony-title");
    expect(title).toBeTruthy();
    await act(async () => {
      if (title) {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
        setter?.call(title, "ทำบุญขึ้นบ้านใหม่");
        title.dispatchEvent(new Event("input", { bubbles: true }));
      }
    });
    // Submit the ceremony form (the 2nd form on the page; donate is the 1st).
    const forms = container.querySelectorAll("form");
    const ceremonyForm = forms[forms.length - 1];
    await act(async () => {
      ceremonyForm?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    await flush();
    expect(container.textContent).toContain("ส่งคำขอจอง");
    expect(container.textContent).toContain("รอวัดยืนยัน");
  });

  it("redirects to login (onUnauthorized) when the API returns 401", async () => {
    let unauthorized = false;
    const failing = makeApi({
      listTemples: async () => {
        throw Object.assign(new Error("unauth"), { status: 401 });
      },
    });
    await act(async () => {
      root.render(
        <TemplePicker
          api={failing}
          token="t"
          onSelect={() => undefined}
          onUnauthorized={() => {
            unauthorized = true;
          }}
        />,
      );
    });
    await flush();
    expect(unauthorized).toBe(true);
  });
});
