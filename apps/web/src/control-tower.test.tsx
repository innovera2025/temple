import { describe, expect, it } from "vitest";
import {
  controlTowerState,
  countGateStatuses,
  getActivePathLocks,
  getBlockingDecisions,
  getNextOrchestratorAction,
} from "./control-tower";

describe("control tower state", () => {
  it("models the AI workforce and active delivery work", () => {
    expect(controlTowerState.agents.length).toBeGreaterThanOrEqual(5);
    expect(controlTowerState.tasks.length).toBeGreaterThanOrEqual(4);
    expect(controlTowerState.tasks.some((task) => task.status === "running")).toBe(true);
  });

  it("summarises quality gates by status", () => {
    const counts = countGateStatuses(controlTowerState.gates);

    expect(counts.pass).toBeGreaterThan(0);
    expect(counts.pending).toBeGreaterThan(0);
    expect(counts.blocked).toBeGreaterThanOrEqual(0);
  });

  it("lists only active path locks", () => {
    const locks = getActivePathLocks(controlTowerState.pathLocks);

    expect(locks.length).toBeGreaterThan(0);
    expect(locks.every((lock) => lock.status === "locked")).toBe(true);
  });

  it("keeps human decision blockers visible", () => {
    const decisions = getBlockingDecisions(controlTowerState.decisions);

    expect(decisions.length).toBeGreaterThan(0);
    expect(decisions[0]?.question).toContain("เลขใบอนุโมทนา");
  });

  it("selects the next orchestrator action from the highest priority task", () => {
    expect(getNextOrchestratorAction(controlTowerState)).toBe(
      "รอ Codex ส่งผล migration/test ของ Task 2 แล้วให้ security-reviewer ตรวจ RLS ก่อนปิด gate",
    );
  });
});
