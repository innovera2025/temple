import { PrismaClient } from "@prisma/client";

export function createPrismaClient(databaseUrl = process.env.DATABASE_URL): PrismaClient {
  return new PrismaClient(
    databaseUrl
      ? {
          datasources: {
            db: {
              url: databaseUrl,
            },
          },
        }
      : undefined,
  );
}
