import { FormEvent, ReactElement, useEffect, useMemo, useState } from "react";
import { DONOR_TYPES, validateCreateDonor, type FieldError } from "@wat/shared";
import { Badge, Button, Card } from "../../design-system";
import { DonorRecord, DonorsApi, donorTypeLabel } from "./donors";

interface DonorFormValues {
  displayName: string;
  donorType: string;
  phone: string;
  email: string;
}

const EMPTY_FORM: DonorFormValues = { displayName: "", donorType: "person", phone: "", email: "" };

function errorFor(errors: FieldError[], field: string): string | undefined {
  return errors.find((error) => error.field === field)?.message;
}

export function DonorsTable({ rows }: { rows: DonorRecord[] }): ReactElement {
  if (!rows.length) {
    return <p style={{ margin: 0, fontSize: 13, color: "var(--ink-3)" }}>ยังไม่มีผู้บริจาคในระบบ — เพิ่มรายแรกได้จากแบบฟอร์มด้านบน</p>;
  }
  return (
    <table className="w-full" style={{ borderCollapse: "collapse", width: "100%", fontSize: 13 }}>
      <thead>
        <tr style={{ textAlign: "left", color: "var(--ink-3)" }}>
          <th style={{ padding: "6px 8px" }}>ชื่อ</th>
          <th style={{ padding: "6px 8px" }}>ประเภท</th>
          <th style={{ padding: "6px 8px" }}>โทรศัพท์</th>
          <th style={{ padding: "6px 8px" }}>อีเมล</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((donor) => (
          <tr key={donor.id} style={{ borderTop: "1px solid var(--border)" }}>
            <td style={{ padding: "6px 8px", color: "var(--ink)" }}>{donor.displayName}</td>
            <td style={{ padding: "6px 8px" }}>
              <Badge kind="neutral">{donorTypeLabel(donor.donorType)}</Badge>
            </td>
            <td style={{ padding: "6px 8px", color: "var(--ink-2)" }}>{donor.phone ?? "—"}</td>
            <td style={{ padding: "6px 8px", color: "var(--ink-2)" }}>{donor.email ?? "—"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function DonorsPage({ api, canWrite }: { api: DonorsApi; canWrite: boolean }): ReactElement {
  const [donors, setDonors] = useState<DonorRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<DonorFormValues>(EMPTY_FORM);
  const [formErrors, setFormErrors] = useState<FieldError[]>([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    api
      .list()
      .then((rows) => {
        if (active) {
          setDonors(rows);
          setError(null);
        }
      })
      .catch((err: unknown) => {
        if (active) setError(err instanceof Error ? err.message : "โหลดข้อมูลไม่สำเร็จ");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [api]);

  const nameError = useMemo(() => errorFor(formErrors, "displayName"), [formErrors]);

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const result = validateCreateDonor({
      displayName: form.displayName,
      donorType: form.donorType,
      phone: form.phone || undefined,
      email: form.email || undefined,
    });
    if (!result.success) {
      setFormErrors(result.errors);
      return;
    }
    setFormErrors([]);
    setSubmitting(true);
    try {
      const created = await api.create(result.data);
      setDonors((prev) => [created, ...prev]);
      setForm(EMPTY_FORM);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "บันทึกไม่สำเร็จ");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={{ maxWidth: 880 }}>
      <h1 style={{ margin: "0 0 4px", fontSize: 22, fontWeight: 700, color: "var(--ink)" }}>ทะเบียนผู้บริจาค</h1>
      <p style={{ margin: "0 0 16px", fontSize: 13, color: "var(--ink-3)" }}>ค้นหา เพิ่ม และดูรายชื่อญาติโยม/ผู้บริจาคของวัด</p>

      {canWrite ? (
        <Card pad className="mb-4">
          <form onSubmit={submit} style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}>
            <label style={{ gridColumn: "1 / -1", fontSize: 12, color: "var(--ink-2)" }}>
              ชื่อที่แสดง *
              <input
                value={form.displayName}
                onChange={(event) => setForm((prev) => ({ ...prev, displayName: event.target.value }))}
                style={{ marginTop: 4, width: "100%", padding: "7px 10px", border: "1px solid var(--border)", borderRadius: "var(--r)" }}
              />
              {nameError ? <span style={{ color: "var(--debit)", fontSize: 11 }}>{nameError}</span> : null}
            </label>
            <label style={{ fontSize: 12, color: "var(--ink-2)" }}>
              ประเภท
              <select
                value={form.donorType}
                onChange={(event) => setForm((prev) => ({ ...prev, donorType: event.target.value }))}
                style={{ marginTop: 4, width: "100%", padding: "7px 10px", border: "1px solid var(--border)", borderRadius: "var(--r)" }}
              >
                {DONOR_TYPES.map((type) => (
                  <option key={type} value={type}>{donorTypeLabel(type)}</option>
                ))}
              </select>
            </label>
            <label style={{ fontSize: 12, color: "var(--ink-2)" }}>
              โทรศัพท์
              <input
                value={form.phone}
                onChange={(event) => setForm((prev) => ({ ...prev, phone: event.target.value }))}
                style={{ marginTop: 4, width: "100%", padding: "7px 10px", border: "1px solid var(--border)", borderRadius: "var(--r)" }}
              />
            </label>
            <label style={{ gridColumn: "1 / -1", fontSize: 12, color: "var(--ink-2)" }}>
              อีเมล
              <input
                value={form.email}
                onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
                style={{ marginTop: 4, width: "100%", padding: "7px 10px", border: "1px solid var(--border)", borderRadius: "var(--r)" }}
              />
            </label>
            <div style={{ gridColumn: "1 / -1" }}>
              <Button variant="primary" type="submit" disabled={submitting}>
                {submitting ? "กำลังบันทึก..." : "เพิ่มผู้บริจาค"}
              </Button>
            </div>
          </form>
        </Card>
      ) : null}

      <Card pad>
        {loading ? (
          <p style={{ margin: 0, fontSize: 13, color: "var(--ink-3)" }}>กำลังโหลดรายชื่อผู้บริจาค...</p>
        ) : error ? (
          <p style={{ margin: 0, fontSize: 13, color: "var(--debit)" }}>เกิดข้อผิดพลาด: {error}</p>
        ) : (
          <DonorsTable rows={donors} />
        )}
      </Card>
    </div>
  );
}
