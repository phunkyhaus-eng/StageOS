import { Injectable } from '@nestjs/common';
import crypto from 'crypto';
import { config } from '../config';

interface OfferTokenPayload {
  attemptId: string;
  personId: string;
  correlationToken: string;
  exp: number;
}

interface VerificationResult {
  valid: boolean;
  payload?: OfferTokenPayload;
}

function toBase64Url(value: Buffer | string): string {
  const raw = value instanceof Buffer ? value.toString('base64') : Buffer.from(value).toString('base64');
  return raw.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function fromBase64Url(value: string): Buffer {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padLength = (4 - (normalized.length % 4)) % 4;
  return Buffer.from(normalized + '='.repeat(padLength), 'base64');
}

@Injectable()
export class StaffingTokenService {
  private readonly secret = config.jwt.accessSecret;

  signOfferToken(payload: OfferTokenPayload): string {
    const body = toBase64Url(JSON.stringify(payload));
    const signature = toBase64Url(crypto.createHmac('sha256', this.secret).update(body).digest());
    return `${body}.${signature}`;
  }

  verifyOfferToken(token: string): VerificationResult {
    const [body, signature] = token.split('.');
    if (!body || !signature) return { valid: false };

    const expectedSignature = toBase64Url(crypto.createHmac('sha256', this.secret).update(body).digest());
    const a = Buffer.from(signature);
    const b = Buffer.from(expectedSignature);

    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      return { valid: false };
    }

    try {
      const parsed = JSON.parse(fromBase64Url(body).toString('utf8')) as Partial<OfferTokenPayload>;
      if (
        typeof parsed.attemptId !== 'string' ||
        typeof parsed.personId !== 'string' ||
        typeof parsed.correlationToken !== 'string' ||
        typeof parsed.exp !== 'number'
      ) {
        return { valid: false };
      }

      return {
        valid: true,
        payload: {
          attemptId: parsed.attemptId,
          personId: parsed.personId,
          correlationToken: parsed.correlationToken,
          exp: parsed.exp
        }
      };
    } catch {
      return { valid: false };
    }
  }
}

export type { OfferTokenPayload };
