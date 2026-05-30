import type { ReactElement } from "react";
import {
  controlTowerState,
  countGateStatuses,
  getActivePathLocks,
  getBlockingDecisions,
  getNextOrchestratorAction,
  type AgentStatus,
  type GateStatus,
  type TaskStatus,
} from "./control-tower";

const agentTone: Record<AgentStatus, string> = {
  idle: "bg-slate-100 text-slate-600 ring-slate-200",
  queued: "bg-amber-50 text-amber-700 ring-amber-200",
  running: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  reviewing: "bg-indigo-50 text-indigo-700 ring-indigo-200",
  blocked: "bg-rose-50 text-rose-700 ring-rose-200",
  passed: "bg-teal-50 text-teal-700 ring-teal-200",
};

const taskTone: Record<TaskStatus, string> = {
  ready: "border-slate-200 bg-white",
  running: "border-emerald-200 bg-emerald-50/60",
  review: "border-indigo-200 bg-indigo-50/60",
  blocked: "border-rose-200 bg-rose-50/60",
  done: "border-teal-200 bg-teal-50/60",
};

const gateTone: Record<GateStatus, string> = {
  pass: "bg-emerald-600",
  running: "bg-indigo-600",
  pending: "bg-amber-500",
  blocked: "bg-rose-600",
};

function Pill({ children, className = "" }: { children: React.ReactNode; className?: string }): ReactElement {
  return <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${className}`}>{children}</span>;
}

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }): ReactElement {
  return (
    <section className="rounded-2xl border border-stone-200 bg-white/90 p-5 shadow-sm">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-stone-950">{title}</h2>
          {subtitle ? <p className="mt-1 text-xs text-stone-500">{subtitle}</p> : null}
        </div>
      </div>
      {children}
    </section>
  );
}

export function App(): ReactElement {
  const state = controlTowerState;
  const gateCounts = countGateStatuses(state.gates);
  const activeLocks = getActivePathLocks(state.pathLocks);
  const blockingDecisions = getBlockingDecisions(state.decisions);
  const nextAction = getNextOrchestratorAction(state);

  return (
    <main className="min-h-screen bg-[var(--paper)] text-stone-950">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-5 py-6 lg:px-8">
        <header className="rounded-3xl border border-stone-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-sm font-semibold text-[var(--brand)]">Agent Control Tower</p>
              <h1 className="mt-2 text-3xl font-bold tracking-tight text-stone-950">ห้องควบคุมทีม AI</h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-stone-600">
                ใช้ดูสถานะจ่อย, Codex, Claude reviewer และ Antigravity ในงาน build/review/test/gate ของระบบวัด
                โดยยึด output จริง ไม่ใช่คำบอกเล่าของ agent อย่างเดียว
              </p>
            </div>
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 lg:max-w-md">
              <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">Next orchestrator action</p>
              <p className="mt-2 text-sm font-medium leading-6 text-stone-800">{nextAction}</p>
            </div>
          </div>
        </header>

        <section className="grid gap-4 md:grid-cols-4">
          <div className="metric-card">
            <span>Agents active</span>
            <strong>{state.agents.filter((agent) => agent.status !== "idle").length}</strong>
            <small>จากทั้งหมด {state.agents.length} ตัว</small>
          </div>
          <div className="metric-card">
            <span>Running task</span>
            <strong>{state.tasks.filter((task) => task.status === "running").length}</strong>
            <small>{state.tasks.length} tasks ใน queue</small>
          </div>
          <div className="metric-card">
            <span>Gates passed</span>
            <strong>{gateCounts.pass}</strong>
            <small>{gateCounts.pending} pending · {gateCounts.running} running</small>
          </div>
          <div className="metric-card">
            <span>Decisions blocking</span>
            <strong>{blockingDecisions.length}</strong>
            <small>ต้องให้คนตัดสินใจก่อน schema settle</small>
          </div>
        </section>

        <div className="grid gap-6 xl:grid-cols-[1.45fr_0.95fr]">
          <div className="flex flex-col gap-6">
            <Section title="Delivery pipeline" subtitle="งานหลักที่จะกลับไปทำระบบวัดหลัง monitor พร้อม">
              <div className="grid gap-3">
                {state.tasks.map((task) => (
                  <article key={task.id} className={`rounded-xl border p-4 ${taskTone[task.status]}`}>
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-semibold text-stone-950">{task.title}</h3>
                          <Pill className="bg-white text-stone-700 ring-stone-200">{task.priority}</Pill>
                          <Pill className="bg-white text-stone-700 ring-stone-200">{task.status}</Pill>
                        </div>
                        <p className="mt-2 text-sm text-stone-600">Owner: {task.owner}</p>
                        <p className="mt-1 text-sm font-medium text-stone-800">Next: {task.nextAction}</p>
                      </div>
                      <span className="text-xs text-stone-500">{task.updatedAt}</span>
                    </div>
                  </article>
                ))}
              </div>
            </Section>

            <Section title="Quality gates" subtitle="ปิดงานไม่ได้จนกว่าประตูสำคัญจะผ่านครบ">
              <div className="grid gap-3 md:grid-cols-2">
                {state.gates.map((gate) => (
                  <article key={gate.id} className="rounded-xl border border-stone-200 bg-stone-50 p-4">
                    <div className="flex items-center gap-3">
                      <span className={`h-3 w-3 rounded-full ${gateTone[gate.status]}`} />
                      <div>
                        <h3 className="text-sm font-semibold text-stone-900">{gate.label}</h3>
                        <p className="text-xs text-stone-500">{gate.reviewer} · {gate.status}</p>
                      </div>
                    </div>
                    <p className="mt-3 text-sm leading-6 text-stone-700">{gate.evidence}</p>
                  </article>
                ))}
              </div>
            </Section>

            <Section title="Command evidence" subtitle="หลักฐานจากคำสั่งจริง ใช้แทนคำว่า agent บอกว่าผ่านแล้ว">
              <div className="overflow-hidden rounded-xl border border-stone-200">
                {state.commands.map((command) => (
                  <div key={command.id} className="border-b border-stone-200 bg-stone-950 p-4 font-mono text-xs text-stone-100 last:border-b-0">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span>$ {command.command}</span>
                      <span className={command.exitCode === 0 ? "text-emerald-300" : command.exitCode === null ? "text-amber-300" : "text-rose-300"}>
                        exit: {command.exitCode ?? "pending"}
                      </span>
                    </div>
                    <p className="mt-2 text-stone-300">{command.result}</p>
                  </div>
                ))}
              </div>
            </Section>
          </div>

          <aside className="flex flex-col gap-6">
            <Section title="Agent status" subtitle="ใครทำอะไรอยู่ตอนนี้">
              <div className="space-y-3">
                {state.agents.map((agent) => (
                  <article key={agent.id} className="rounded-xl border border-stone-200 bg-stone-50 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="text-sm font-semibold text-stone-900">{agent.name}</h3>
                        <p className="text-xs text-stone-500">{agent.runtime} · {agent.role}</p>
                      </div>
                      <Pill className={agentTone[agent.status]}>{agent.status}</Pill>
                    </div>
                    <p className="mt-3 text-sm text-stone-700">{agent.currentTask}</p>
                    <p className="mt-1 text-xs text-stone-500">Evidence: {agent.evidence}</p>
                  </article>
                ))}
              </div>
            </Section>

            <Section title="Path ownership" subtitle="กัน agent แก้ไฟล์ชนกัน">
              <div className="space-y-3">
                {activeLocks.map((lock) => (
                  <article key={lock.id} className="rounded-xl border border-stone-200 bg-stone-50 p-4">
                    <h3 className="text-sm font-semibold text-stone-900">{lock.owner}</h3>
                    <ul className="mt-2 space-y-1">
                      {lock.paths.map((path) => (
                        <li key={path} className="rounded bg-white px-2 py-1 font-mono text-xs text-stone-700">{path}</li>
                      ))}
                    </ul>
                    <p className="mt-2 text-xs text-stone-500">{lock.reason}</p>
                  </article>
                ))}
              </div>
            </Section>

            <Section title="Decision inbox" subtitle="เรื่องที่ AI ไม่ควรเดาเอง">
              <div className="space-y-3">
                {state.decisions.map((decision) => (
                  <article key={decision.id} className="rounded-xl border border-stone-200 bg-white p-4">
                    <div className="flex items-center justify-between gap-3">
                      <Pill className={decision.status === "blocking" ? "bg-rose-50 text-rose-700 ring-rose-200" : "bg-amber-50 text-amber-700 ring-amber-200"}>
                        {decision.status}
                      </Pill>
                      <span className="text-xs text-stone-500">{decision.owner}</span>
                    </div>
                    <h3 className="mt-3 text-sm font-semibold leading-6 text-stone-900">{decision.question}</h3>
                    <p className="mt-2 text-xs leading-5 text-stone-500">Impact: {decision.impact}</p>
                  </article>
                ))}
              </div>
            </Section>

            <Section title="Audit timeline" subtitle="ประวัติการทำงานล่าสุด">
              <ol className="space-y-3 border-l border-stone-200 pl-4">
                {state.auditEvents.map((event) => (
                  <li key={event.id} className="relative">
                    <span className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full bg-[var(--brand)]" />
                    <p className="text-xs font-semibold text-stone-500">{event.time} · {event.actor}</p>
                    <p className="mt-1 text-sm leading-6 text-stone-800">{event.event}</p>
                  </li>
                ))}
              </ol>
            </Section>
          </aside>
        </div>
      </div>
    </main>
  );
}
