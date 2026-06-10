import { HttpStatus, ValidationPipe } from "@nestjs/common";
import { NestExpressApplication } from "@nestjs/platform-express";
import { json } from "express";

/**
 * CORS_ORIGINS: comma-separated allow-list. In production the web app is
 * served same-origin behind nginx (no cross-origin needed), so an unset value
 * means NO cross-origin access; dev/test fall back to the Vite dev ports.
 */
function corsOrigins(): string[] | false {
  const raw = process.env.CORS_ORIGINS?.trim();
  if (raw) {
    return raw.split(",").map((origin) => origin.trim()).filter(Boolean);
  }
  if (process.env.NODE_ENV === "production") {
    return false;
  }
  return ["http://localhost:5173", "http://127.0.0.1:5173"];
}

/**
 * HTTP-transport configuration shared by `bootstrap()` (main.ts) and the
 * http-transport spec — body-parser limits / CORS / proxy trust live here so
 * tests exercise EXACTLY what production runs (a Nest 10→11 upgrade changed
 * how body-parser errors surface, and nothing had covered it).
 */
export function configureApp(app: NestExpressApplication): void {
  // Behind a reverse proxy (e.g. the nginx web container) Express must trust a
  // fixed number of proxy hops so `req.ip` is the real client — the RateLimitGuard
  // keys pre-auth routes on it. TRUST_PROXY is the hop count (1 = one proxy);
  // unset/empty leaves it OFF (direct connections), so `req.ip` stays the socket
  // peer and cannot be spoofed via X-Forwarded-For. NEVER set this to `true`.
  const trustProxy = process.env.TRUST_PROXY?.trim();
  if (trustProxy) {
    const hops = Number(trustProxy);
    app.set("trust proxy", Number.isInteger(hops) && hops >= 0 ? hops : trustProxy);
  }

  app.enableCors({
    origin: corsOrigins(),
    credentials: false,
    allowedHeaders: ["content-type", "authorization"],
    methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
  });
  // Base64 attachment uploads (capped at 5 MB decoded -> ~6.7 MB base64) need a
  // large JSON body — but ONLY on /attachments. Everything else (including the
  // pre-auth login/refresh routes) keeps a tight 1 MB cap so a client cannot
  // make the API buffer 12 MB bodies on arbitrary endpoints. The route-scoped
  // parser runs first and marks the body consumed, so the global one skips it.
  app.use("/attachments", json({ limit: "12mb" }));
  app.useBodyParser("json", { limit: "1mb" });

  // SIGTERM (docker stop / rolling deploy) must drain in-flight requests and
  // run OnModuleDestroy hooks (Prisma disconnect) instead of being ignored.
  app.enableShutdownHooks();
  app.useGlobalPipes(
    new ValidationPipe({
      errorHttpStatusCode: HttpStatus.UNPROCESSABLE_ENTITY,
      whitelist: true,
      transform: true,
    }),
  );
}
