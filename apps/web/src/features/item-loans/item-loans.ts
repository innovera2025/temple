/**
 * การยืม-คืนสิ่งของวัด feature client (web) — calls the real /item-loans API and reuses the
 * @wat/shared contract. The borrow photo is uploaded via the attachments client first, then
 * its id is passed as borrowPhotoId (ถ่ายรูปก่อนยืม).
 */
import {
  type BorrowableItemView,
  type CreateBorrowableItemInput,
  type CreateLoanInput,
  formatSatang,
  type ItemLoanView,
  type LoanSettlementType,
  type LoanStatus,
  LOAN_SETTLEMENT_TYPE_LABELS_TH,
  LOAN_STATUS_LABELS_TH,
  type ReturnLoanInput,
} from "@wat/shared";

export type { BorrowableItemView, CreateBorrowableItemInput, CreateLoanInput, ItemLoanView, ReturnLoanInput } from "@wat/shared";

export function loanStatusLabel(status: string): string {
  return LOAN_STATUS_LABELS_TH[status as LoanStatus] ?? status;
}
export function settlementTypeLabel(type: string): string {
  return LOAN_SETTLEMENT_TYPE_LABELS_TH[type as LoanSettlementType] ?? type;
}
export function displayBaht(satang: string | number | bigint): string {
  return `฿${formatSatang(satang)}`;
}

export interface ItemLoansApi {
  listItems(query?: { q?: string; status?: string }): Promise<BorrowableItemView[]>;
  createItem(input: CreateBorrowableItemInput): Promise<BorrowableItemView>;
  listLoans(query?: { itemId?: string; status?: string; q?: string }): Promise<ItemLoanView[]>;
  createLoan(input: CreateLoanInput): Promise<ItemLoanView>;
  returnLoan(id: string, input: ReturnLoanInput): Promise<ItemLoanView>;
}

export interface ItemLoansApiClientOptions {
  baseUrl: string;
  getToken: () => string | null;
  fetchFn?: typeof fetch;
}

interface ApiErrorBody {
  error?: { message?: string };
}

async function readError(response: Response): Promise<string> {
  const body = (await response.json().catch(() => null)) as ApiErrorBody | null;
  return body?.error?.message ?? `คำขอไม่สำเร็จ (${response.status})`;
}

export function createItemLoansApiClient(options: ItemLoansApiClientOptions): ItemLoansApi {
  const doFetch = options.fetchFn ?? fetch;
  function headers(): Record<string, string> {
    const token = options.getToken();
    return { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) };
  }
  async function get<T>(path: string, key: string): Promise<T> {
    const response = await doFetch(`${options.baseUrl}${path}`, { headers: headers() });
    if (!response.ok) throw new Error(await readError(response));
    return ((await response.json()) as Record<string, T>)[key] as T;
  }
  async function post<T>(path: string, payload: unknown, key: string): Promise<T> {
    const response = await doFetch(`${options.baseUrl}${path}`, { method: "POST", headers: headers(), body: JSON.stringify(payload) });
    if (!response.ok) throw new Error(await readError(response));
    return ((await response.json()) as Record<string, T>)[key] as T;
  }
  const qs = (params: Record<string, string | undefined>): string => {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v) sp.set(k, v);
    const s = sp.toString();
    return s ? `?${s}` : "";
  };
  return {
    listItems: (query = {}) => get<BorrowableItemView[]>(`/item-loans/items${qs(query)}`, "items"),
    createItem: (input) => post<BorrowableItemView>(`/item-loans/items`, input, "item"),
    listLoans: (query = {}) => get<ItemLoanView[]>(`/item-loans/loans${qs(query)}`, "loans"),
    createLoan: (input) => post<ItemLoanView>(`/item-loans/loans`, input, "loan"),
    returnLoan: (id, input) => post<ItemLoanView>(`/item-loans/loans/${id}/return`, input, "loan"),
  };
}
