# Agent Control Tower MVP Implementation Plan

> **For Hermes:** Use subagent-driven-development skill for future expansion. This first slice is small enough for direct TDD implementation.

**Goal:** Add a first usable Agent Control Tower screen before returning to the temple product build.

**Architecture:** Keep this as a frontend-only MVP inside `apps/web` using typed seed data. The screen will show agent status, task pipeline, quality gates, path ownership, command evidence, decision inbox, and audit events. Later slices can replace the seed data with `.hermes/project-control/*.json` or an API.

**Tech Stack:** React 19, TypeScript, Vite, Tailwind, Vitest.

---

## Slice 1 — static working monitor

### Task 1: Add typed control tower model and seed data

**Objective:** Create a data module that represents project tasks, agents, gates, path locks, decisions, commands, and audit events.

**Files:**
- Create: `apps/web/src/control-tower.ts`
- Test: `apps/web/src/control-tower.test.ts`

**Verification:**
- `pnpm --filter @wat/web test -- control-tower`
- Expected: control tower tests fail before implementation, then pass.

### Task 2: Replace empty shell with Agent Control Tower UI

**Objective:** Render the monitor as the first app screen with Thai copy and real workflow information for the current temple project.

**Files:**
- Modify: `apps/web/src/app.tsx`
- Modify: `apps/web/src/app.test.tsx`

**Verification:**
- `pnpm --filter @wat/web test -- app`
- Expected: app tests fail before UI implementation, then pass.

### Task 3: Style the screen for daily operational use

**Objective:** Add warm, dense, readable dashboard styling suitable for command-center work.

**Files:**
- Modify: `apps/web/src/styles.css`

**Verification:**
- `pnpm --filter @wat/web build`
- Expected: TypeScript and Vite build pass.

### Task 4: Full repo gate

**Objective:** Verify the artifact with the repo scripts.

**Commands:**
- `pnpm --filter @wat/web test`
- `pnpm --filter @wat/web typecheck`
- `pnpm --filter @wat/web lint`
- `pnpm --filter @wat/web build`

**Acceptance criteria:**
- Dashboard names itself Agent Control Tower / ห้องควบคุมทีม AI.
- Shows at least 5 agents, 4 tasks, quality gates, path ownership, command evidence, decisions, and audit timeline.
- Shows concrete next action for the orchestrator.
- Tests and build pass with real command output.
