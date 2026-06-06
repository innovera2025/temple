/**
 * Who performed an audited action. Tenant staff write `actor_user_id` (composite FK
 * to users); a devotee (ญาติโยม) is NOT a user row, so devotee-initiated rows leave
 * `actor_user_id` NULL and record the devotee in `actor_type`/`actor_devotee_account_id`.
 */
export type AuditActor =
  | { kind: "user"; userId: string }
  | { kind: "devotee"; devoteeAccountId: string; email?: string };

export interface AuditActorColumns {
  actorUserId: string | null;
  actorType: string;
  actorDevoteeAccountId: string | null;
}

/** Spread into `auditLog.create({ data: { ...auditActorData(actor), ... } })`. */
export function auditActorData(actor: AuditActor): AuditActorColumns {
  return actor.kind === "user"
    ? { actorUserId: actor.userId, actorType: "user", actorDevoteeAccountId: null }
    : { actorUserId: null, actorType: "devotee", actorDevoteeAccountId: actor.devoteeAccountId };
}

/** Convenience for the common staff case. */
export function userActor(userId: string): AuditActor {
  return { kind: "user", userId };
}
