import { Injectable, OnModuleDestroy } from "@nestjs/common";
import { Prisma, PrismaClient } from "@prisma/client";

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
    });
  }

  async withSystemAccess<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    return this.client.$transaction(async (tx) => {
      await tx.$executeRawUnsafe("SET LOCAL ROLE wat_migrate");

      return fn(tx);
    });
  }
}
