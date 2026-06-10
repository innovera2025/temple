import { Injectable, Logger } from "@nestjs/common";
import { createTransport, type Transporter } from "nodemailer";

export interface OutboundMail {
  to: string;
  subject: string;
  text: string;
}

const CAPTURE_LIMIT = 50;

/**
 * Outbound mail. Real SMTP when SMTP_URL is configured; otherwise a log
 * transport — the message is logged (dev) and captured in-memory (`sent`,
 * last 50) so flows remain testable without a mail server. Recovery emails
 * carry single-use links, so a missing SMTP config in production is a
 * misconfiguration the operator must notice: we log loudly per send.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter: Transporter | null;
  /** Captured messages when no SMTP transport is configured (dev/test). */
  readonly sent: OutboundMail[] = [];

  constructor() {
    const smtpUrl = process.env.SMTP_URL?.trim();
    this.transporter = smtpUrl ? createTransport(smtpUrl) : null;
  }

  private from(): string {
    return process.env.MAIL_FROM?.trim() || "no-reply@wat.local";
  }

  async send(mail: OutboundMail): Promise<void> {
    if (this.transporter) {
      await this.transporter.sendMail({ from: this.from(), ...mail });
      return;
    }
    this.sent.push(mail);
    if (this.sent.length > CAPTURE_LIMIT) {
      this.sent.splice(0, this.sent.length - CAPTURE_LIMIT);
    }
    if (process.env.NODE_ENV !== "test") {
      this.logger.warn(
        `SMTP_URL not configured — mail NOT delivered (to=${mail.to}, subject="${mail.subject}")`,
      );
    }
  }
}
