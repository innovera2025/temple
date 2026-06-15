import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { PublicEventSummary, PublicTempleProfile, PublicTempleSummary } from "@wat/shared";
import { AccountView } from "./account-view";
import { DevoteeLoginView } from "./login-view";
import { DevoteeShell } from "./devotee-shell";
import { MyCeremonies, MyDonations, MyItemLoans, MyReceipts } from "./my-records";
import { DevoteeHome } from "./devotee-home";
import { BookCeremonyForm, BorrowItemForm, DonateForm, TempleEventsList } from "./temple-page";
import { TemplePicker } from "./temple-picker";
import {
  DevoteeApi,
  DevoteeBorrowableItem,
  DevoteeCeremonyRecord,
  DevoteeDonationRecord,
  DevoteeItemLoanRecord,
  DevoteeReceiptRecord,
  bahtStringToSatang,
  clearActiveTemple,
  deriveDevoteeSession,
  hasLoginErrors,
  loadActiveTemple,
  saveActiveTemple,
  validateDevoteeItemLoanForm,
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

const eventSummary: PublicEventSummary = {
  id: "44444444-4444-4444-8444-444444444444",
  templeId,
  templeNameTh: "วัดอรุณเดโม",
  ceremonyType: "kathin",
  title: "งานกฐินประจำปี",
  ceremonyDate: "2026-11-05",
  timeNote: "09:00 น.",
  location: "ศาลาการเปรียญ",
};

const borrowableItem: DevoteeBorrowableItem = {
  id: "55555555-5555-4555-8555-555555555555",
  name: "เต็นท์",
  category: "equipment",
  unit: "หลัง",
  availableQty: 5,
};

const itemLoanRecord: DevoteeItemLoanRecord = {
  id: "66666666-6666-4666-8666-666666666666",
  templeId,
  templeNameTh: "วัดอรุณเดโม",
  loanNo: "LOAN-000001",
  itemName: "เต็นท์",
  quantity: 2,
  borrowedAt: "2026-06-10",
  dueAt: "2026-06-12",
  status: "requested",
  returnedQty: null,
};

function makeApi(overrides: Partial<DevoteeApi> = {}): DevoteeApi {
  return {
    register: async () => ({ accessToken: "a", refreshToken: "r" }),
    login: async () => ({ accessToken: "a", refreshToken: "r" }),
    listTemples: async () => [templeSummary],
    getTemple: async () => templeProfile,
    donate: async () => ({
      donation: { id: "d1", amountSatang: "50000", method: "cash", donationDate: "2026-06-01", status: "pledged" },
      ledgerEntry: null,
    }),
    bookCeremony: async () => ({
      booking: { id: "c1", status: "requested", title: "ทำบุญขึ้นบ้านใหม่", ceremonyDate: "2026-07-01" },
    }),
    listBorrowableItems: async () => [borrowableItem],
    templeEvents: async () => [eventSummary],
    requestItemLoan: async () => ({
      request: {
        id: "ln1",
        loanNo: "LOAN-000002",
        itemName: "เต็นท์",
        quantity: 2,
        status: "requested",
        borrowedAt: "2026-06-10",
        dueAt: null,
      },
    }),
    myDonations: async () => [donationRecord],
    myReceipts: async () => [receiptRecord],
    myCeremonies: async () => [ceremonyRecord],
    myItemLoans: async () => [itemLoanRecord],
    getProfile: async () => ({ id: "dev-1", email: "me@example.com", displayName: "คุณโยม", phone: null }),
    updateProfile: async (_t, v) => ({ id: "dev-1", email: "me@example.com", displayName: v.displayName, phone: v.phone || null }),
    changePassword: async () => undefined,
    getReceiptDocument: async () => ({
      receiptNo: "RC-2026-0001",
      status: "issued",
      issuedAt: "2026-06-01T00:00:00.000Z",
      templeNameTh: "วัดอรุณเดโม",
      templeNameEn: null,
      donorName: "คุณโยม",
      amountSatang: "50000",
      amountText: "ห้าร้อยบาทถ้วน",
      donationDate: "2026-06-01",
      donationMethod: "cash",
    }),
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

  it("validates the item-loan form (item required, quantity ≥ 1, date required)", () => {
    const bad = validateDevoteeItemLoanForm({ itemId: "", quantity: "0", borrowedAt: "", dueAt: "", requesterPhone: "", note: "" });
    expect(bad.itemId).toBeTruthy();
    expect(bad.quantity).toBeTruthy();
    expect(bad.borrowedAt).toBeTruthy();
    const ok = validateDevoteeItemLoanForm({ itemId: "55555555-5555-4555-8555-555555555555", quantity: "2", borrowedAt: "2026-06-10", dueAt: "", requesterPhone: "", note: "" });
    expect(ok.itemId).toBeUndefined();
    expect(ok.quantity).toBeUndefined();
    expect(ok.borrowedAt).toBeUndefined();
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
          onSelect={(t) => {
            selected = t.id;
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

  it("donate form posts the donation and shows the success entry no", async () => {
    await act(async () => {
      root.render(
        <DonateForm api={makeApi()} token="t" templeId={templeId} today="2026-06-04" onUnauthorized={() => undefined} />,
      );
    });
    await flush();
    expect(container.textContent).toContain("ร่วมทำบุญ");

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
    // A devotee donation is a pledge: no ledger entry number — the portal
    // explains that staff will verify the amount before it counts.
    expect(container.textContent).toContain("รอเจ้าหน้าที่วัดตรวจสอบยอดและยืนยัน");
    expect(container.textContent).not.toContain("เลขที่รายการบัญชี");
  });

  it("blocks an over-cap donation client-side without calling the API", async () => {
    let donateCalled = false;
    const api = makeApi({
      donate: async () => {
        donateCalled = true;
        return {
          donation: { id: "d1", amountSatang: "1", method: "cash", donationDate: "2026-06-04", status: "pledged" },
          ledgerEntry: null,
        };
      },
    });
    await act(async () => {
      root.render(
        <DonateForm api={api} token="t" templeId={templeId} today="2026-06-04" onUnauthorized={() => undefined} />,
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

  it("devotee home shows the personal summary (KPIs + recent merit) and quick actions", async () => {
    let navTo = "";
    await act(async () => {
      root.render(
        <DevoteeHome
          api={makeApi()}
          token="t"
          displayName="คุณโยมดี"
          activeTempleName="วัดอรุณเดโม"
          onGoto={(p) => {
            navTo = p;
          }}
          onUnauthorized={() => undefined}
        />,
      );
    });
    await flush();
    expect(container.textContent).toContain("สวัสดี คุณโยมดี");
    expect(container.textContent).toContain("ยอดร่วมบุญรวม");
    expect(container.textContent).toContain("ร่วมบุญล่าสุด");
    expect(container.textContent).toContain("วัดอรุณเดโม"); // recent donation row + active-temple banner
    // quick-action tile navigates to the matching menu
    const donateTile = Array.from(container.querySelectorAll("button")).find((b) => b.textContent?.includes("ร่วมบริจาค"));
    await act(async () => {
      donateTile?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(navTo).toBe("donations");
  });

  it("my-records pages each render their own rows (donations / receipts / ceremonies / item-loans)", async () => {
    const api = makeApi();
    await act(async () => {
      root.render(<MyDonations api={api} token="t" onUnauthorized={() => undefined} />);
    });
    await flush();
    expect(container.textContent).toContain("การบริจาคของฉัน");
    expect(container.textContent).toContain("วัดอรุณเดโม");

    await act(async () => {
      root.render(<MyReceipts api={api} token="t" onUnauthorized={() => undefined} />);
    });
    await flush();
    expect(container.textContent).toContain("ใบอนุโมทนา");
    expect(container.textContent).toContain("RC-2026-0001");

    await act(async () => {
      root.render(<MyCeremonies api={api} token="t" onUnauthorized={() => undefined} />);
    });
    await flush();
    expect(container.textContent).toContain("การจองพิธี / นิมนต์พระ");
    expect(container.textContent).toContain("ทำบุญขึ้นบ้านใหม่");
    expect(container.textContent).toContain("รอยืนยัน");

    await act(async () => {
      root.render(<MyItemLoans api={api} token="t" onUnauthorized={() => undefined} />);
    });
    await flush();
    expect(container.textContent).toContain("การยืมของวัด");
    expect(container.textContent).toContain("LOAN-000001");
    expect(container.textContent).toContain("รอเจ้าหน้าที่ยืนยัน");
  });

  it("devotee shell renders the grouped sidebar (ทำบุญ / ของฉัน) and routes nav clicks", async () => {
    let navigatedTo = "";
    let loggedOut = false;
    await act(async () => {
      root.render(
        <DevoteeShell
          userName="คุณโยม"
          page="picker"
          crumb="เลือกวัด"
          onNavigate={(id) => {
            navigatedTo = id;
          }}
          onLogout={() => {
            loggedOut = true;
          }}
        >
          <div>เนื้อหา</div>
        </DevoteeShell>,
      );
    });
    // Same design shell as the back-office (sidebar + topbar + grouped nav + role badge).
    expect(container.querySelector(".app .sidebar")).toBeTruthy();
    expect(container.querySelector(".topbar")).toBeTruthy();
    expect(container.textContent).toContain("ร่วมบุญออนไลน์");
    expect(container.textContent).toContain("ทำบุญ");
    expect(container.textContent).toContain("ของฉัน");
    expect(container.textContent).toContain("การยืมของ");
    expect(container.textContent).toContain("ญาติโยม");

    const loansBtn = Array.from(container.querySelectorAll(".sb-item")).find((b) => b.textContent?.includes("การยืมของ"));
    await act(async () => {
      loansBtn?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(navigatedTo).toBe("loans");

    const logoutBtn = Array.from(container.querySelectorAll("button")).find((b) => b.getAttribute("aria-label") === "ออกจากระบบ");
    await act(async () => {
      logoutBtn?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(loggedOut).toBe(true);
  });

  it("ceremony booking form posts the request and shows the pending message", async () => {
    await act(async () => {
      root.render(
        <BookCeremonyForm api={makeApi()} token="t" templeId={templeId} today="2026-06-04" onUnauthorized={() => undefined} />,
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
    const ceremonyForm = title?.closest("form");
    await act(async () => {
      ceremonyForm?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    await flush();
    expect(container.textContent).toContain("ส่งคำขอจอง");
    expect(container.textContent).toContain("รอวัดยืนยัน");
  });

  it("temple events list shows upcoming temple events", async () => {
    await act(async () => {
      root.render(<TempleEventsList api={makeApi()} token="t" templeId={templeId} onUnauthorized={() => undefined} />);
    });
    await flush();
    expect(container.textContent).toContain("กิจกรรมของวัด");
    expect(container.textContent).toContain("งานกฐินประจำปี");
    expect(container.textContent).toContain("ศาลาการเปรียญ");
  });

  it("borrow form posts the request and shows the pending message", async () => {
    let requested: { itemId: string; quantity: string } | null = null;
    const api = makeApi({
      requestItemLoan: async (_t, _id, values) => {
        requested = { itemId: values.itemId, quantity: values.quantity };
        return {
          request: { id: "ln1", loanNo: "LOAN-000002", itemName: "เต็นท์", quantity: 2, status: "requested", borrowedAt: "2026-06-10", dueAt: null },
        };
      },
    });
    await act(async () => {
      root.render(
        <BorrowItemForm api={api} token="t" templeId={templeId} today="2026-06-04" onUnauthorized={() => undefined} />,
      );
    });
    await flush();
    expect(container.textContent).toContain("ยืมของวัด");

    const itemSelect = container.querySelector<HTMLSelectElement>("#loan-item");
    expect(itemSelect).toBeTruthy();
    await act(async () => {
      if (itemSelect) {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, "value")?.set;
        setter?.call(itemSelect, borrowableItem.id);
        itemSelect.dispatchEvent(new Event("change", { bubbles: true }));
      }
    });
    const borrowForm = itemSelect?.closest("form");
    await act(async () => {
      borrowForm?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    await flush();
    expect(requested).toEqual({ itemId: borrowableItem.id, quantity: "1" });
    expect(container.textContent).toContain("ส่งคำขอยืม");
    expect(container.textContent).toContain("รอเจ้าหน้าที่ยืนยัน");
  });

  it("account view loads the profile and saves an edit via updateProfile", async () => {
    let savedName = "";
    const api = makeApi({
      updateProfile: async (_t, v) => {
        savedName = v.displayName;
        return { id: "dev-1", email: "me@example.com", displayName: v.displayName, phone: v.phone || null };
      },
    });
    await act(async () => {
      root.render(<AccountView api={api} token="t" onUnauthorized={() => undefined} />);
    });
    await flush();
    expect(container.textContent).toContain("บัญชีของฉัน");
    expect(container.textContent).toContain("เปลี่ยนรหัสผ่าน");
    const name = container.querySelector<HTMLInputElement>("#acct-name");
    await act(async () => {
      if (name) {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
        setter?.call(name, "คุณโยมใหม่");
        name.dispatchEvent(new Event("input", { bubbles: true }));
      }
    });
    const form = container.querySelector("form");
    await act(async () => {
      form?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    await flush();
    expect(savedName).toBe("คุณโยมใหม่");
    expect(container.textContent).toContain("บันทึกโปรไฟล์แล้ว");
  });

  it("opens a printable receipt document from my-records", async () => {
    let askedId = "";
    const api = makeApi({
      getReceiptDocument: async (_t, id) => {
        askedId = id;
        return {
          receiptNo: "RC-2026-0001", status: "issued", issuedAt: "2026-06-01T00:00:00.000Z",
          templeNameTh: "วัดอรุณเดโม", templeNameEn: null, donorName: "คุณญาติโยม",
          amountSatang: "50000", amountText: "ห้าร้อยบาทถ้วน", donationDate: "2026-06-01", donationMethod: "cash",
        };
      },
    });
    await act(async () => {
      root.render(<MyReceipts api={api} token="t" onUnauthorized={() => undefined} />);
    });
    await flush();
    const btn = Array.from(container.querySelectorAll("button")).find((b) => b.textContent?.includes("ดู / พิมพ์"));
    expect(btn).toBeTruthy();
    await act(async () => {
      btn?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flush();
    expect(askedId).toBe(receiptRecord.id);
    expect(container.textContent).toContain("ใบอนุโมทนาบุญ");
    expect(container.textContent).toContain("คุณญาติโยม");
    expect(container.textContent).toContain("ห้าร้อยบาทถ้วน");
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

  it("persists the active temple across reloads and clears it on logout", () => {
    clearActiveTemple();
    expect(loadActiveTemple()).toBeNull();

    saveActiveTemple({ id: templeId, nameTh: "วัดอรุณเดโม" });
    expect(loadActiveTemple()).toEqual({ id: templeId, nameTh: "วัดอรุณเดโม" });

    clearActiveTemple();
    expect(loadActiveTemple()).toBeNull();
  });
});
