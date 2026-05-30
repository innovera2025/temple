export type AgentStatus = "idle" | "queued" | "running" | "reviewing" | "blocked" | "passed";
export type TaskStatus = "ready" | "running" | "review" | "blocked" | "done";
export type GateStatus = "pass" | "pending" | "blocked" | "running";
export type PathLockStatus = "locked" | "released";
export type DecisionStatus = "blocking" | "open" | "answered";

export interface AgentRun {
  id: string;
  name: string;
  runtime: "จ่อย" | "Codex" | "Claude" | "Antigravity";
  role: string;
  status: AgentStatus;
  currentTask: string;
  evidence: string;
}

export interface ControlTask {
  id: string;
  title: string;
  owner: string;
  status: TaskStatus;
  priority: "P0" | "P1" | "P2";
  nextAction: string;
  updatedAt: string;
}

export interface QualityGate {
  id: string;
  taskId: string;
  label: string;
  status: GateStatus;
  reviewer: string;
  evidence: string;
}

export interface PathLock {
  id: string;
  owner: string;
  paths: string[];
  status: PathLockStatus;
  reason: string;
}

export interface CommandEvidence {
  id: string;
  command: string;
  exitCode: number | null;
  result: string;
  taskId: string;
}

export interface DecisionItem {
  id: string;
  question: string;
  status: DecisionStatus;
  owner: string;
  impact: string;
}

export interface AuditEvent {
  id: string;
  time: string;
  actor: string;
  event: string;
}

export interface ControlTowerState {
  agents: AgentRun[];
  tasks: ControlTask[];
  gates: QualityGate[];
  pathLocks: PathLock[];
  commands: CommandEvidence[];
  decisions: DecisionItem[];
  auditEvents: AuditEvent[];
}

export const controlTowerState: ControlTowerState = {
  agents: [
    {
      id: "orchestrator",
      name: "จ่อย / orchestrator",
      runtime: "จ่อย",
      role: "gate owner + verifier",
      status: "running",
      currentTask: "ตั้ง Agent Control Tower MVP",
      evidence: "สร้าง plan + RED tests แล้ว",
    },
    {
      id: "codex-db",
      name: "Codex / db-architect",
      runtime: "Codex",
      role: "DB/RLS implementer",
      status: "queued",
      currentTask: "Task 2 — DB schema + RLS",
      evidence: "รอ monitor พร้อมก่อนเริ่ม migration",
    },
    {
      id: "security-reviewer",
      name: "Claude / security-reviewer",
      runtime: "Claude",
      role: "RLS + tenant isolation review",
      status: "idle",
      currentTask: "รอ diff จาก Task 2",
      evidence: "read-only reviewer",
    },
    {
      id: "finance-auditor",
      name: "Claude / finance-auditor",
      runtime: "Claude",
      role: "finance lifecycle review",
      status: "idle",
      currentTask: "ตรวจ no hard delete + audit + receipt lifecycle",
      evidence: "read-only reviewer",
    },
    {
      id: "antigravity-sanity",
      name: "Antigravity / fast sanity",
      runtime: "Antigravity",
      role: "scope + AC challenger",
      status: "idle",
      currentTask: "รอ checklist ปิด gate",
      evidence: "ไม่แก้ไฟล์หลัก",
    },
    {
      id: "qa-engineer",
      name: "Codex / qa-engineer",
      runtime: "Codex",
      role: "test fixer + acceptance proof",
      status: "queued",
      currentTask: "เพิ่ม regression test หลัง Task 2",
      evidence: "รอ schema foundation",
    },
  ],
  tasks: [
    {
      id: "task-2-db-rls",
      title: "Task 2 — DB schema + RLS",
      owner: "Codex / db-architect",
      status: "running",
      priority: "P0",
      nextAction: "รอ Codex ส่งผล migration/test ของ Task 2 แล้วให้ security-reviewer ตรวจ RLS ก่อนปิด gate",
      updatedAt: "วันนี้",
    },
    {
      id: "task-3-auth-rbac",
      title: "Task 3 — Auth + RBAC + audit",
      owner: "Codex / backend-engineer",
      status: "ready",
      priority: "P0",
      nextAction: "เริ่มหลัง Task 2 ผ่าน tenant context gate",
      updatedAt: "รอคิว",
    },
    {
      id: "task-4-donation-api",
      title: "Task 4 — Donation intake API",
      owner: "Codex / backend-engineer",
      status: "ready",
      priority: "P1",
      nextAction: "ต้องใช้ auth + fund model จาก Task 2/3",
      updatedAt: "รอคิว",
    },
    {
      id: "task-5-receipt-ui",
      title: "Task 5 — Receipt / ใบอนุโมทนา UI",
      owner: "Codex / frontend-engineer",
      status: "ready",
      priority: "P1",
      nextAction: "รอ API contract และ document numbering decision",
      updatedAt: "รอคิว",
    },
  ],
  gates: [
    {
      id: "gate-spec",
      taskId: "task-2-db-rls",
      label: "Spec gate",
      status: "pass",
      reviewer: "จ่อย",
      evidence: "docs/plans/mvp-1-build-plan.md + domain model พร้อม",
    },
    {
      id: "gate-implementation",
      taskId: "task-2-db-rls",
      label: "Implementation",
      status: "running",
      reviewer: "Codex",
      evidence: "ต้องส่ง git diff + migration output",
    },
    {
      id: "gate-test",
      taskId: "task-2-db-rls",
      label: "Migration + tests",
      status: "pending",
      reviewer: "qa-engineer",
      evidence: "รอ pnpm test / prisma validate output",
    },
    {
      id: "gate-security",
      taskId: "task-2-db-rls",
      label: "Security / RLS",
      status: "pending",
      reviewer: "security-reviewer",
      evidence: "ต้องยืนยัน tenant_id isolation ทุก table",
    },
    {
      id: "gate-finance",
      taskId: "task-2-db-rls",
      label: "Finance lifecycle",
      status: "pending",
      reviewer: "finance-auditor",
      evidence: "ต้องยืนยัน receipt/ledger append-only และ void lifecycle",
    },
  ],
  pathLocks: [
    {
      id: "lock-db",
      owner: "Task 2 — DB schema + RLS",
      paths: ["packages/db/**", "prisma/**", "apps/api/src/tenant/**"],
      status: "locked",
      reason: "กัน Task 3 แตะ tenant context ก่อน schema settle",
    },
    {
      id: "lock-web-monitor",
      owner: "Agent Control Tower MVP",
      paths: ["apps/web/src/**", "docs/plans/agent-control-tower-mvp.md"],
      status: "locked",
      reason: "จ่อยสร้าง monitor ก่อนกลับไป Task 2",
    },
    {
      id: "lock-docs-old",
      owner: "Task 1 scaffold",
      paths: ["README.md", "CLAUDE.md"],
      status: "released",
      reason: "scaffold เสร็จแล้ว",
    },
  ],
  commands: [
    {
      id: "cmd-red",
      command: "corepack pnpm --filter @wat/web test -- control-tower app",
      exitCode: 1,
      result: "RED: tests fail because control-tower module and new UI do not exist yet",
      taskId: "agent-control-tower",
    },
    {
      id: "cmd-green",
      command: "corepack pnpm --filter @wat/web test && typecheck && lint && build",
      exitCode: 0,
      result: "GREEN: 7 tests passed, TypeScript passed, ESLint passed, Vite production build passed",
      taskId: "agent-control-tower",
    },
  ],
  decisions: [
    {
      id: "decision-doc-number",
      question: "เลขใบอนุโมทนาแยกตามวัด/สาขา หรือรวมทั้ง tenant?",
      status: "blocking",
      owner: "Wei",
      impact: "มีผลกับ schema, unique constraint, print format และ audit search",
    },
    {
      id: "decision-anonymous",
      question: "รับบริจาคแบบไม่ระบุชื่อควรออกใบอนุโมทนาได้ไหม?",
      status: "open",
      owner: "Wei",
      impact: "มีผลกับ donor profile และ tax/document fields",
    },
    {
      id: "decision-ledger-lock",
      question: "หลังปิดงวดบัญชีให้ lock ledger ถาวรหรือให้ admin reopen ได้?",
      status: "open",
      owner: "Wei + finance-auditor",
      impact: "มีผลกับ period close และ correction workflow",
    },
  ],
  auditEvents: [
    { id: "evt-1", time: "14:40", actor: "Wei", event: "สั่งให้สร้าง Agent Control Tower ก่อนกลับไปทำระบบวัด" },
    { id: "evt-2", time: "14:44", actor: "จ่อย", event: "บันทึก implementation plan สำหรับ monitor MVP" },
    { id: "evt-3", time: "14:48", actor: "จ่อย", event: "รัน RED tests และยืนยัน failure จริง" },
    { id: "evt-4", time: "ถัดไป", actor: "จ่อย", event: "implement UI + run quality gates" },
  ],
};

export function countGateStatuses(gates: QualityGate[]): Record<GateStatus, number> {
  return gates.reduce<Record<GateStatus, number>>(
    (counts, gate) => ({ ...counts, [gate.status]: counts[gate.status] + 1 }),
    { pass: 0, pending: 0, blocked: 0, running: 0 },
  );
}

export function getActivePathLocks(pathLocks: PathLock[]): PathLock[] {
  return pathLocks.filter((lock) => lock.status === "locked");
}

export function getBlockingDecisions(decisions: DecisionItem[]): DecisionItem[] {
  return decisions.filter((decision) => decision.status === "blocking");
}

export function getNextOrchestratorAction(state: ControlTowerState): string {
  const runningP0 = state.tasks.find((task) => task.priority === "P0" && task.status === "running");
  return runningP0?.nextAction ?? "ไม่มีงาน P0 ที่กำลัง running — เลือกงานถัดไปจาก Ready queue";
}
