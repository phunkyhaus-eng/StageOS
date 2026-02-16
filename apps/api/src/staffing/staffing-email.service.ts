import { Injectable, Logger } from '@nestjs/common';
import { config } from '../config';

interface SendEmailInput {
  to: string;
  subject: string;
  text: string;
  html: string;
}

interface OfferEmailInput {
  recipientName: string;
  recipientEmail: string;
  role: string;
  eventTitle: string;
  startsAt: Date;
  venueName?: string | null;
  yesUrl: string;
  noUrl: string;
  expiresAt: Date;
}

interface ManagerAlertInput {
  to: string[];
  subject: string;
  summary: string;
  details: string;
}

@Injectable()
export class StaffingEmailService {
  private readonly logger = new Logger(StaffingEmailService.name);

  private async send(input: SendEmailInput): Promise<void> {
    if (config.mail.provider === 'resend') {
      if (!config.mail.resendApiKey) {
        this.logger.warn('MAIL_PROVIDER=resend but RESEND_API_KEY is missing. Falling back to console logging.');
      } else {
        const response = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${config.mail.resendApiKey}`,
            'content-type': 'application/json'
          },
          body: JSON.stringify({
            from: config.mail.from,
            to: [input.to],
            subject: input.subject,
            text: input.text,
            html: input.html
          })
        });

        if (!response.ok) {
          const body = await response.text();
          throw new Error(`Resend send failed (${response.status}): ${body}`);
        }

        return;
      }
    }

    this.logger.log(
      JSON.stringify(
        {
          channel: 'email.console-fallback',
          to: input.to,
          subject: input.subject,
          text: input.text
        },
        null,
        2
      )
    );
  }

  async sendOfferEmail(input: OfferEmailInput): Promise<void> {
    const startLabel = input.startsAt.toLocaleString();
    const expiryLabel = input.expiresAt.toLocaleString();
    const venueLabel = input.venueName?.trim().length ? input.venueName.trim() : 'Venue TBD';

    const subject = `StageOS offer: ${input.role} for ${input.eventTitle}`;
    const text = [
      `Hi ${input.recipientName},`,
      '',
      `Are you available for ${input.eventTitle}?`,
      `Role: ${input.role}`,
      `When: ${startLabel}`,
      `Venue: ${venueLabel}`,
      `Please reply by: ${expiryLabel}`,
      '',
      `YES: ${input.yesUrl}`,
      `NO: ${input.noUrl}`
    ].join('\n');

    const html = `
      <div style="font-family:system-ui,Segoe UI,Arial,sans-serif;line-height:1.5;color:#0f172a">
        <p>Hi <strong>${input.recipientName}</strong>,</p>
        <p>Are you available for <strong>${input.eventTitle}</strong>?</p>
        <ul>
          <li><strong>Role:</strong> ${input.role}</li>
          <li><strong>When:</strong> ${startLabel}</li>
          <li><strong>Venue:</strong> ${venueLabel}</li>
          <li><strong>Reply by:</strong> ${expiryLabel}</li>
        </ul>
        <p>
          <a href="${input.yesUrl}" style="display:inline-block;padding:10px 14px;background:#059669;color:#fff;text-decoration:none;border-radius:8px;margin-right:8px">Yes, I'm available</a>
          <a href="${input.noUrl}" style="display:inline-block;padding:10px 14px;background:#b91c1c;color:#fff;text-decoration:none;border-radius:8px">No, can't do it</a>
        </p>
      </div>
    `;

    await this.send({
      to: input.recipientEmail,
      subject,
      text,
      html
    });
  }

  async sendAcceptedConfirmation(to: string, eventTitle: string, role: string): Promise<void> {
    await this.send({
      to,
      subject: `Confirmed: ${role} for ${eventTitle}`,
      text: `You're confirmed for ${eventTitle} as ${role}.`,
      html: `<p>You're confirmed for <strong>${eventTitle}</strong> as <strong>${role}</strong>.</p>`
    });
  }

  async sendDeclinedConfirmation(to: string, eventTitle: string, role: string): Promise<void> {
    await this.send({
      to,
      subject: `Declined: ${role} for ${eventTitle}`,
      text: `Thanks, we recorded your decline for ${eventTitle} (${role}).`,
      html: `<p>Thanks, we recorded your decline for <strong>${eventTitle}</strong> (${role}).</p>`
    });
  }

  async sendRoleAlreadyFilled(to: string, eventTitle: string, role: string): Promise<void> {
    await this.send({
      to,
      subject: `Role already filled: ${role} for ${eventTitle}`,
      text: `Thanks for responding. ${role} for ${eventTitle} was already filled.`,
      html: `<p>Thanks for responding. <strong>${role}</strong> for <strong>${eventTitle}</strong> was already filled.</p>`
    });
  }

  async sendOfferExpired(to: string, eventTitle: string, role: string): Promise<void> {
    await this.send({
      to,
      subject: `Offer expired: ${role} for ${eventTitle}`,
      text: `The offer for ${eventTitle} (${role}) expired before your response was processed.`,
      html: `<p>The offer for <strong>${eventTitle}</strong> (${role}) expired before your response was processed.</p>`
    });
  }

  async sendManagerAlert(input: ManagerAlertInput): Promise<void> {
    if (input.to.length === 0) return;

    await Promise.all(
      input.to.map((recipient) =>
        this.send({
          to: recipient,
          subject: input.subject,
          text: `${input.summary}\n\n${input.details}`,
          html: `<p>${input.summary}</p><pre style="white-space:pre-wrap">${input.details}</pre>`
        })
      )
    );
  }
}
