import { Inject, Injectable } from "@nestjs/common";
import { notFound } from "../common/errors/project-error";
import { PrismaService } from "../common/prisma/prisma.service";

export interface DevoteeProfile {
  id: string;
  email: string;
  displayName: string;
}

/**
 * Reads a devotee's own profile (via withSystemAccess — devotee_accounts has no RLS
 * and is migrate-only). Used to stamp the devotee's name onto the temple-side record
 * (donor / ceremony requester) so temple staff see who transacted.
 */
@Injectable()
export class DevoteeAccountsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async requireProfile(devoteeAccountId: string): Promise<DevoteeProfile> {
    const account = await this.prisma.withSystemAccess((tx) =>
      tx.devoteeAccount.findFirst({
        where: { id: devoteeAccountId },
        select: { id: true, email: true, displayName: true },
      }),
    );
    if (!account) {
      throw notFound("ไม่พบบัญชีผู้ใช้");
    }
    return account;
  }
}
