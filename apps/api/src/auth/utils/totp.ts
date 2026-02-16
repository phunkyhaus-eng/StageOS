import crypto from 'crypto';

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Encode(input: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = '';

  for (const byte of input) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }

  return output;
}

function base32Decode(input: string): Buffer {
  const normalized = input.replace(/=+$/g, '').toUpperCase();
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];

  for (const char of normalized) {
    const idx = BASE32_ALPHABET.indexOf(char);
    if (idx < 0) continue;
    value = (value << 5) | idx;
    bits += 5;

    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }

  return Buffer.from(bytes);
}

export function generateTotpSecret(): string {
  return base32Encode(crypto.randomBytes(20));
}

export function generateRecoveryCodes(count = 8): string[] {
  const out: string[] = [];
  for (let i = 0; i < count; i += 1) {
    out.push(crypto.randomBytes(5).toString('hex').toUpperCase());
  }
  return out;
}

function hotp(secret: string, counter: number, digits = 6): string {
  const key = base32Decode(secret);
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(BigInt(counter));

  const hmac = crypto.createHmac('sha1', key).update(counterBuffer).digest();
  const lastByte = hmac[hmac.length - 1];
  if (lastByte === undefined) {
    throw new Error('Invalid HMAC for HOTP');
  }
  const offset = lastByte & 0x0f;
  const b0 = hmac[offset] ?? 0;
  const b1 = hmac[offset + 1] ?? 0;
  const b2 = hmac[offset + 2] ?? 0;
  const b3 = hmac[offset + 3] ?? 0;
  const binary =
    ((b0 & 0x7f) << 24) |
    ((b1 & 0xff) << 16) |
    ((b2 & 0xff) << 8) |
    (b3 & 0xff);

  return (binary % 10 ** digits).toString().padStart(digits, '0');
}

export function generateTotpCode(secret: string, at: Date = new Date(), stepSeconds = 30): string {
  const counter = Math.floor(at.getTime() / 1000 / stepSeconds);
  return hotp(secret, counter, 6);
}

export function verifyTotpCode(
  secret: string,
  code: string,
  at: Date = new Date(),
  stepSeconds = 30,
  skew = 1
): boolean {
  const numeric = code.replace(/\s+/g, '');
  if (!/^\d{6}$/.test(numeric)) return false;

  const counter = Math.floor(at.getTime() / 1000 / stepSeconds);
  for (let delta = -skew; delta <= skew; delta += 1) {
    if (hotp(secret, counter + delta, 6) === numeric) {
      return true;
    }
  }

  return false;
}

export function buildOtpAuthUrl(input: { issuer: string; accountName: string; secret: string }): string {
  const issuer = encodeURIComponent(input.issuer);
  const accountName = encodeURIComponent(input.accountName);
  const secret = encodeURIComponent(input.secret);

  return `otpauth://totp/${issuer}:${accountName}?secret=${secret}&issuer=${issuer}&algorithm=SHA1&digits=6&period=30`;
}
