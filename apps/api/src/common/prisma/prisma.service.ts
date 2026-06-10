import { Injectable, OnModuleDestroy } from "@nestjs/common";
import { Prisma, PrismaClient } from "@prisma/client";

// Prisma's interactive-transaction defaults (maxWait 2s, timeout 5s) are too
// tight for legitimate bulk work (e.g. a 1000-row inventory import) and would
// abort it mid-flight. Generous-but-bounded: a runaway transaction still dies.
const TRANSACTION_OPTIONS = { maxWait: 10_000, timeout: 30_000 } as const;

@Injectable()
export class PrismaService implements OnModuleDestroy {
  readonly client = new PrismaClient();

  async onModuleDestroy(): Promise<void> {
    await this.client.$disconnect();
  }

  async withTenant<T>(
    tenantId: string,
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    return this.client.$transaction(async (tx) => {
      await tx.$executeRawUnsafe("SET LOCAL ROLE wat_app");
      await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;

      return fn(tx);
    }, TRANSACTION_OPTIONS);
  }

  async withSystemAccess<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    return this.client.$transaction(async (tx) => {
      await tx.$executeRawUnsafe("SET LOCAL ROLE wat_migrate");

      return fn(tx);
    }, TRANSACTION_OPTIONS);
  }
}
