import { SetMetadata } from "@nestjs/common";

export const PLATFORM_ROLES_KEY = "wat:platform-roles";

export function PlatformRoles(...roles: string[]): ReturnType<typeof SetMetadata> {
  return SetMetadata(PLATFORM_ROLES_KEY, roles);
}
