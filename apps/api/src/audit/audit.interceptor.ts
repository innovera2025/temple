import {
  CallHandler,
  ExecutionContext,
  Inject,
  Injectable,
  NestInterceptor,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { Prisma } from "@prisma/client";
import { Observable, mergeMap } from "rxjs";
import { unauthorized } from "../common/errors/project-error";
import { AuthenticatedRequest } from "../common/types/authenticated-request";
import { AuditMetadata, AUDIT_METADATA_KEY } from "./audit.decorator";
import { AuditService } from "./audit.service";

interface AuditResponse {
  entityId?: string;
  before?: Prisma.InputJsonValue;
  after?: Prisma.InputJsonValue;
  reason?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function asAuditResponse(value: unknown): AuditResponse {
  if (!isRecord(value)) {
    return {};
  }

  return {
    entityId: typeof value.entityId === "string" ? value.entityId : undefined,
    before: isRecord(value.before) ? (value.before as Prisma.InputJsonValue) : undefined,
    after: isRecord(value.after) ? (value.after as Prisma.InputJsonValue) : undefined,
    reason: typeof value.reason === "string" ? value.reason : undefined,
  };
}

function requestBodyAuditFields(body: unknown): AuditResponse {
  if (!isRecord(body)) {
    return {};
  }

  return {
    entityId: typeof body.entityId === "string" ? body.entityId : undefined,
    before: isRecord(body.before) ? (body.before as Prisma.InputJsonValue) : undefined,
    after: isRecord(body.after) ? (body.after as Prisma.InputJsonValue) : undefined,
    reason: typeof body.reason === "string" ? body.reason : undefined,
  };
}

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(
    @Inject(Reflector)
    private readonly reflector: Reflector,
    @Inject(AuditService)
    private readonly auditService: AuditService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const metadata = this.reflector.get<AuditMetadata>(AUDIT_METADATA_KEY, context.getHandler());

    if (!metadata) {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    return next.handle().pipe(
      mergeMap(async (result: unknown) => {
        const responseFields = asAuditResponse(result);
        const requestFields = requestBodyAuditFields(request.body);
        const tenantId = request.currentTenantId ?? request.user?.tenant_id;

        if (!tenantId) {
          throw unauthorized("Missing tenant context");
        }

        await this.auditService.write({
          tenantId,
          actorUserId: request.user?.sub,
          action: metadata.action,
          entityType: metadata.entityType,
          entityId: responseFields.entityId ?? requestFields.entityId,
          before: responseFields.before ?? requestFields.before,
          after: responseFields.after ?? requestFields.after,
          reason: responseFields.reason ?? requestFields.reason,
          ip: request.ip ?? request.socket?.remoteAddress,
          metadata: {},
        });

        return result;
      }),
    );
  }
}
