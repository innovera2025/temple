import { Global, Module } from "@nestjs/common";
import { MailService } from "./mail.service";

// Global: auth (staff) and devotee planes both send recovery mail; one shared
// transport/capture instance keeps tests able to observe every message.
@Global()
@Module({
  providers: [MailService],
  exports: [MailService],
})
export class MailModule {}
