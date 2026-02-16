import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { API_KEY_SCOPES_KEY } from './api-key-scopes.decorator';

@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector
  ) {}

  private hash(raw: string): string {
    return crypto.createHash('sha256').update(raw).digest('hex');
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<{
      headers: Record<string, string | string[] | undefined>;
      apiKey?: {
        id: string;
        organisationId: string;
        scopes: string[];
      };
    }>();

    const rawHeader = req.headers['x-stageos-api-key'] ?? req.headers['x-api-key'];
    const raw = Array.isArray(rawHeader) ? rawHeader[0] : rawHeader;

    if (!raw) {
      throw new UnauthorizedException('Missing API key');
    }

    const keyHash = this.hash(raw);
    const apiKey = await this.prisma.apiKey.findFirst({
      where: {
        keyHash,
        deletedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }]
      },
      select: {
        id: true,
        organisationId: true,
        scopes: true
      }
    });

    if (!apiKey) {
      throw new UnauthorizedException('Invalid API key');
    }

    const requiredScopes = this.reflector.getAllAndOverride<string[]>(API_KEY_SCOPES_KEY, [
      context.getHandler(),
      context.getClass()
    ]);

    if (requiredScopes && requiredScopes.length > 0) {
      const hasAll = requiredScopes.every((scope) => apiKey.scopes.includes(scope));
      if (!hasAll) {
        throw new ForbiddenException('API key missing required scopes');
      }
    }

    req.apiKey = apiKey;

    await this.prisma.apiKey.update({
      where: { id: apiKey.id },
      data: { lastUsedAt: new Date() }
    });

    return true;
  }
}
