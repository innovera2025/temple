import { SetMetadata } from "@nestjs/common";

export const ROLES_KEY = "wat:roles";

export function Roles(...roles: string[]): ReturnType<typeof SetMetadata> {
  return SetMetadata(ROLES_KEY, roles);
}
