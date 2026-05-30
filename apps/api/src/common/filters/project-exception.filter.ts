import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from "@nestjs/common";
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

@Catch(HttpException)
export class ProjectExceptionFilter implements ExceptionFilter<HttpException> {
  catch(exception: HttpException, host: ArgumentsHost): void {
    const statusCode = exception.getStatus();
    const response = exception.getResponse();
    const http = host.switchToHttp();
    const res = http.getResponse<HttpResponse>();

    if (hasProjectErrorBody(response)) {
      res.status(statusCode).json(response);
      return;
    }

    const fallback = statusCode === HttpStatus.INTERNAL_SERVER_ERROR ? "Internal server error" : exception.message;
    res.status(statusCode).json(projectErrorBody(statusCode, undefined, extractMessage(response, fallback)));
  }
}
