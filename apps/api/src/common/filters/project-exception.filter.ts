import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { projectErrorBody, ProjectErrorBody } from "../errors/project-error";

interface HttpResponse {
  status(statusCode: number): { json(body: ProjectErrorBody): void };
}

function hasProjectErrorBody(value: unknown): value is ProjectErrorBody {
  return (
    typeof value === "object" &&
    value !== null &&
    "error" in value &&
    typeof (value as { error?: unknown }).error === "object"
  );
}

function extractMessage(response: unknown, fallback: string): string {
  if (typeof response === "string") {
    return response;
  }

  if (typeof response === "object" && response !== null && "message" in response) {
    const message = (response as { message?: unknown }).message;

    if (Array.isArray(message)) {
      return message.join("; ");
    }

    if (typeof message === "string") {
      return message;
    }
  }

  return fallback;
}

interface MappedError {
  statusCode: number;
  code: string;
  message: string;
}

/**
 * Map a known Prisma request error to the project error model. Only well-understood
 * codes get a friendly 4xx; everything else is a 500 (so genuine bugs stay visible
 * server-side and are not silently masked as client errors).
 */
function mapKnownPrismaError(error: Prisma.PrismaClientKnownRequestError): MappedError {
  switch (error.code) {
    case "P2025": // record not found (update/delete target missing)
      return { statusCode: 404, code: "NOT_FOUND", message: "ไม่พบข้อมูลที่ร้องขอ" };
    case "P2002": // unique constraint violation
      return { statusCode: 409, code: "CONFLICT", message: "ข้อมูลซ้ำกับที่มีอยู่แล้ว" };
    case "P2003": // foreign-key constraint violation
      return { statusCode: 409, code: "CONFLICT", message: "ข้อมูลอ้างอิงไม่ถูกต้อง" };
    case "P2000": // value too long for the column
      return { statusCode: 422, code: "UNPROCESSABLE_ENTITY", message: "ข้อมูลไม่ถูกต้อง" };
    default:
      return { statusCode: 500, code: "INTERNAL_SERVER_ERROR", message: "เกิดข้อผิดพลาดภายในระบบ" };
  }
}

/**
 * Single global exception filter. Catches EVERYTHING so no error can escape the
 * project error envelope:
 *  - HttpException -> the existing project-envelope behaviour (unchanged).
 *  - Prisma errors -> mapped to a sanitised 4xx/5xx envelope.
 *  - anything else -> a sanitised 500 (raw message/stack is logged, never returned).
 */
@Catch()
export class ProjectExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ProjectExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    // HTTP-only application; a non-HTTP context (ws/rpc) is never produced here.
    if (host.getType() !== "http") {
      return;
    }
    const res = host.switchToHttp().getResponse<HttpResponse>();

    if (exception instanceof HttpException) {
      const statusCode = exception.getStatus();
      // Any >=500 is sanitised + logged regardless of source, so a caller-supplied
      // 500 message can never leak (mirrors the non-HttpException 500 path).
      if (statusCode >= HttpStatus.INTERNAL_SERVER_ERROR) {
        this.logInternal(exception);
        res
          .status(statusCode)
          .json(projectErrorBody(statusCode, "INTERNAL_SERVER_ERROR", "เกิดข้อผิดพลาดภายในระบบ"));
        return;
      }
      const response = exception.getResponse();
      if (hasProjectErrorBody(response)) {
        res.status(statusCode).json(response);
        return;
      }
      res.status(statusCode).json(projectErrorBody(statusCode, undefined, extractMessage(response, exception.message)));
      return;
    }

    const mapped = this.mapNonHttpException(exception);
    // Surface unexpected/server-side failures in the logs (the client only gets a
    // sanitised envelope — never the raw Prisma/driver message or stack).
    if (mapped.statusCode >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logInternal(exception);
    }
    res.status(mapped.statusCode).json(projectErrorBody(mapped.statusCode, mapped.code, mapped.message));
  }

  private logInternal(exception: unknown): void {
    this.logger.error(
      "Unhandled exception -> 500",
      exception instanceof Error ? exception.stack : String(exception),
    );
  }

  private mapNonHttpException(exception: unknown): MappedError {
    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      return mapKnownPrismaError(exception);
    }
    // Validation / unknown-request / init errors are query-construction or
    // infrastructure faults — report a sanitised 500 (logged above).
    return { statusCode: 500, code: "INTERNAL_SERVER_ERROR", message: "เกิดข้อผิดพลาดภายในระบบ" };
  }
}
