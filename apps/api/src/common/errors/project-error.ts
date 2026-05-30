import { HttpException, HttpStatus } from "@nestjs/common";

export interface ProjectErrorBody {
  error: {
    code: string;
    message: string;
    statusCode: number;
    details?: unknown;
  };
}

const statusCodes: Record<number, string> = {
  [HttpStatus.UNAUTHORIZED]: "UNAUTHORIZED",
  [HttpStatus.FORBIDDEN]: "FORBIDDEN",
  [HttpStatus.NOT_FOUND]: "NOT_FOUND",
  [HttpStatus.CONFLICT]: "CONFLICT",
  [HttpStatus.UNPROCESSABLE_ENTITY]: "UNPROCESSABLE_ENTITY",
};

const statusMessages: Record<number, string> = {
  [HttpStatus.UNAUTHORIZED]: "Unauthorized",
  [HttpStatus.FORBIDDEN]: "Forbidden",
  [HttpStatus.NOT_FOUND]: "Not found",
  [HttpStatus.CONFLICT]: "Conflict",
  [HttpStatus.UNPROCESSABLE_ENTITY]: "Unprocessable entity",
};

export function projectErrorBody(
  statusCode: number,
  code = statusCodes[statusCode] ?? "INTERNAL_SERVER_ERROR",
  message = statusMessages[statusCode] ?? "Internal server error",
  details?: unknown,
): ProjectErrorBody {
  return {
    error: {
      code,
      message,
      statusCode,
      ...(details === undefined ? {} : { details }),
    },
  };
}

export function projectHttpException(
  statusCode: number,
  code?: string,
  message?: string,
  details?: unknown,
): HttpException {
  return new HttpException(projectErrorBody(statusCode, code, message, details), statusCode);
}

export function unauthorized(message = "Unauthorized"): HttpException {
  return projectHttpException(HttpStatus.UNAUTHORIZED, "UNAUTHORIZED", message);
}

export function forbidden(message = "Forbidden"): HttpException {
  return projectHttpException(HttpStatus.FORBIDDEN, "FORBIDDEN", message);
}
