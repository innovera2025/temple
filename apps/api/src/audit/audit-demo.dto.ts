import { IsObject, IsOptional, IsString, IsUUID } from "class-validator";

export class AuditDemoMutationDto {
  @IsUUID()
  entityId!: string;

  @IsObject()
  after!: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  before?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  reason?: string;
}
