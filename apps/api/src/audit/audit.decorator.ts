import { SetMetadata } from "@nestjs/common";

export const AUDIT_METADATA_KEY = "wat:audit";

export interface AuditMetadata {
  action: string;
  entityType: string;
}

export function Audit(metadata: AuditMetadata): ReturnType<typeof SetMetadata> {
  return SetMetadata(AUDIT_METADATA_KEY, metadata);
}
