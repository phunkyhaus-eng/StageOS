import { Injectable } from '@nestjs/common';
import crypto from 'crypto';
import { config } from '../config';

const ALGO = 'aes-256-gcm';
const PREFIX = 'enc:v1';

@Injectable()
export class EncryptionService {
  private readonly key: Buffer;

  constructor() {
    const raw = Buffer.from(config.encryptionKey, 'utf8');
    this.key = crypto.createHash('sha256').update(raw).digest();
  }

  encrypt(plainText: string): string {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv(ALGO, this.key, iv);
    const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `${PREFIX}:${iv.toString('base64url')}:${tag.toString('base64url')}:${encrypted.toString('base64url')}`;
  }

  decrypt(value: string | null | undefined): string | null {
    if (!value) return null;
    if (!value.startsWith(`${PREFIX}:`)) {
      return value;
    }

    const [, ivB64, tagB64, bodyB64] = value.split(':');
    if (!ivB64 || !tagB64 || !bodyB64) {
      throw new Error('Invalid ciphertext format');
    }

    const decipher = crypto.createDecipheriv(ALGO, this.key, Buffer.from(ivB64, 'base64url'));
    decipher.setAuthTag(Buffer.from(tagB64, 'base64url'));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(bodyB64, 'base64url')),
      decipher.final()
    ]);

    return decrypted.toString('utf8');
  }
}
