import {
  ConflictException,
  Injectable,
  UnauthorizedException
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Prisma, RoleName } from '@prisma/client';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { config } from '../config';
import { EncryptionService } from '../common/encryption.service';
import type { AuthUser } from '../common/types/auth-user';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import {
  buildOtpAuthUrl,
  generateRecoveryCodes,
  generateTotpSecret,
  verifyTotpCode
} from './utils/totp';

interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  sessionId: string;
}

interface SessionContext {
  ipAddress?: string;
  userAgent?: string;
  deviceName?: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly encryption: EncryptionService
  ) {}

  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  private async getUserAuthContext(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        userRoles: {
          include: {
            role: {
              include: {
                rolePerms: {
                  include: {
                    permission: true
                  }
                }
              }
            }
          }
        },
        totpFactors: {
          where: {
            disabledAt: null,
            verifiedAt: { not: null }
          }
        }
      }
    });

    if (!user || user.deletedAt) {
      throw new UnauthorizedException('User not found');
    }

    const roles = user.userRoles.map((ur) => ur.role.name);
    const permissions = user.userRoles.flatMap((ur) => ur.role.rolePerms.map((rp) => rp.permission.key));

    return {
      user,
      roles: [...new Set(roles)],
      permissions: [...new Set(permissions)],
      mfaEnabled: user.totpFactors.length > 0
    };
  }

  private async issueTokens(userId: string, ctx?: SessionContext): Promise<AuthTokens> {
    const context = await this.getUserAuthContext(userId);

    const payload = {
      sub: context.user.id,
      email: context.user.email,
      organisationId: context.user.organisationId,
      roles: context.roles,
      permissions: context.permissions,
      mfa: context.mfaEnabled
    };

    const accessToken = await this.jwt.signAsync(payload, {
      secret: config.jwt.accessSecret,
      expiresIn: config.jwt.accessTtl,
      issuer: config.jwt.issuer
    });

    const refreshToken = await this.jwt.signAsync(
      { sub: context.user.id, organisationId: context.user.organisationId },
      {
        secret: config.jwt.refreshSecret,
        expiresIn: config.jwt.refreshTtl,
        issuer: config.jwt.issuer
      }
    );

    const decoded = this.jwt.decode(refreshToken) as { exp?: number };
    const expiresAt = new Date((decoded.exp ?? Math.floor(Date.now() / 1000) + 86400) * 1000);
    const tokenHash = this.hashToken(refreshToken);

    await this.prisma.refreshToken.create({
      data: {
        userId: context.user.id,
        tokenHash,
        expiresAt
      }
    });

    const session = await this.prisma.userSession.create({
      data: {
        organisationId: context.user.organisationId,
        userId: context.user.id,
        refreshTokenHash: tokenHash,
        deviceLabel: ctx?.deviceName,
        ipAddress: ctx?.ipAddress,
        userAgent: ctx?.userAgent,
        expiresAt
      }
    });

    return { accessToken, refreshToken, sessionId: session.id };
  }

  private async ensureRoleGraph(tx: Prisma.TransactionClient, organisationId: string): Promise<void> {
    const permissions = [
      'read:events',
      'write:events',
      'read:finance',
      'write:finance',
      'read:files',
      'write:files',
      'read:setlists',
      'write:setlists',
      'read:availability',
      'write:availability',
      'read:crm',
      'write:crm',
      'read:tours',
      'write:tours',
      'read:analytics',
      'write:analytics',
      'manage:webhooks',
      'manage:api-keys',
      'manage:plugins',
      'manage:feature-flags'
    ];

    for (const key of permissions) {
      await tx.permission.upsert({
        where: { organisationId_key: { organisationId, key } },
        update: {},
        create: { organisationId, key, description: key }
      });
    }

    const map = {
      OWNER: permissions,
      MANAGER: permissions.filter((p) => p !== 'manage:api-keys'),
      MEMBER: ['read:events', 'read:files', 'read:setlists', 'read:availability', 'write:availability'],
      CREW: ['read:events', 'read:files', 'read:setlists', 'read:availability', 'write:availability'],
      ACCOUNTANT: ['read:finance', 'write:finance', 'read:events', 'read:files', 'read:analytics']
    } as const;

    for (const roleName of Object.values(RoleName) as RoleName[]) {
      const role = await tx.role.upsert({
        where: { organisationId_name: { organisationId, name: roleName } },
        update: {},
        create: {
          organisationId,
          name: roleName,
          description: `${roleName} role`
        }
      });

      await tx.rolePermission.deleteMany({ where: { roleId: role.id } });
      for (const permissionKey of map[roleName]) {
        const permission = await tx.permission.findUniqueOrThrow({
          where: { organisationId_key: { organisationId, key: permissionKey } }
        });

        await tx.rolePermission.create({
          data: {
            roleId: role.id,
            permissionId: permission.id
          }
        });
      }
    }
  }

  private async createEmailVerificationToken(tx: Prisma.TransactionClient, user: {
    id: string;
    email: string;
    organisationId: string;
  }) {
    const raw = crypto.randomBytes(24).toString('hex');
    const tokenHash = this.hashToken(raw);
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await tx.emailVerificationToken.create({
      data: {
        organisationId: user.organisationId,
        userId: user.id,
        email: user.email,
        tokenHash,
        expiresAt
      }
    });

    return raw;
  }

  private async maybeRecordIpAnomaly(userId: string, organisationId: string, ipAddress?: string, userAgent?: string) {
    if (!ipAddress) return;

    const known = await this.prisma.userSession.findMany({
      where: {
        userId,
        organisationId,
        ipAddress: { not: null },
        status: 'ACTIVE'
      },
      select: { ipAddress: true },
      take: 30,
      orderBy: { createdAt: 'desc' }
    });

    const knownIps = new Set(known.map((entry) => entry.ipAddress).filter(Boolean));
    if (knownIps.size === 0 || knownIps.has(ipAddress)) {
      return;
    }

    await this.prisma.ipAnomaly.create({
      data: {
        organisationId,
        userId,
        ipAddress,
        userAgent,
        reason: 'new_login_ip',
        metadata: {
          knownIps: Array.from(knownIps)
        }
      }
    });
  }

  async register(input: RegisterDto, ctx?: SessionContext) {
    const existing = await this.prisma.user.findUnique({ where: { email: input.email } });
    if (existing) {
      throw new ConflictException('Email already exists');
    }

    const passwordHash = await bcrypt.hash(input.password, 12);

    const result = await this.prisma.$transaction(async (tx) => {
      const organisation = await tx.organisation.create({
        data: {
          name: input.organisationName,
          retentionDays: config.limits.defaultRetentionDays
        }
      });

      await this.ensureRoleGraph(tx, organisation.id);

      const band = await tx.band.create({
        data: {
          organisationId: organisation.id,
          name: `${input.organisationName} Band`
        }
      });

      const created = await tx.user.create({
        data: {
          organisationId: organisation.id,
          email: input.email,
          name: input.name,
          passwordHash
        }
      });

      const ownerRole = await tx.role.findUniqueOrThrow({
        where: { organisationId_name: { organisationId: organisation.id, name: RoleName.OWNER } }
      });

      await tx.bandMembership.create({
        data: {
          organisationId: organisation.id,
          bandId: band.id,
          userId: created.id,
          roleName: RoleName.OWNER
        }
      });

      await tx.userRole.create({
        data: {
          organisationId: organisation.id,
          userId: created.id,
          roleId: ownerRole.id
        }
      });

      await tx.subscription.create({
        data: {
          organisationId: organisation.id,
          tier: 'FREE',
          status: 'ACTIVE',
          currentPeriodStart: new Date(),
          currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          graceUntil: new Date(Date.now() + config.limits.gracePeriodDays * 24 * 60 * 60 * 1000)
        }
      });

      const verificationToken = await this.createEmailVerificationToken(tx, {
        id: created.id,
        email: created.email,
        organisationId: organisation.id
      });

      await tx.auditLog.create({
        data: {
          organisationId: organisation.id,
          actorId: created.id,
          action: 'auth.register',
          entityType: 'User',
          entityId: created.id,
          metadata: { email: created.email }
        }
      });

      return { user: created, verificationToken };
    });

    const tokens = await this.issueTokens(result.user.id, ctx);

    return {
      ...tokens,
      emailVerificationToken: config.isProd ? undefined : result.verificationToken
    };
  }

  async login(input: {
    email: string;
    password: string;
    totpCode?: string;
    context?: SessionContext;
  }) {
    const user = await this.prisma.user.findUnique({
      where: { email: input.email },
      include: {
        totpFactors: {
          where: {
            disabledAt: null,
            verifiedAt: { not: null }
          }
        }
      }
    });

    if (!user || user.deletedAt) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const ok = await bcrypt.compare(input.password, user.passwordHash);
    if (!ok) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const activeFactor = user.totpFactors[0];
    if (activeFactor) {
      const secret = this.encryption.decrypt(activeFactor.secretEncrypted);
      if (!secret || !input.totpCode || !verifyTotpCode(secret, input.totpCode)) {
        throw new UnauthorizedException('2FA verification failed');
      }
    }

    await this.maybeRecordIpAnomaly(user.id, user.organisationId, input.context?.ipAddress, input.context?.userAgent);

    await this.prisma.auditLog.create({
      data: {
        organisationId: user.organisationId,
        actorId: user.id,
        action: 'auth.login',
        entityType: 'User',
        entityId: user.id,
        metadata: {
          ipAddress: input.context?.ipAddress
        }
      }
    });

    return this.issueTokens(user.id, input.context);
  }

  async refresh(rawRefreshToken: string, ctx?: SessionContext) {
    if (!rawRefreshToken) {
      throw new UnauthorizedException('Missing refresh token');
    }

    let payload: { sub: string; organisationId: string };
    try {
      payload = await this.jwt.verifyAsync(rawRefreshToken, { secret: config.jwt.refreshSecret });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const tokenHash = this.hashToken(rawRefreshToken);
    const stored = await this.prisma.refreshToken.findUnique({ where: { tokenHash } });
    if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
      throw new UnauthorizedException('Refresh token revoked or expired');
    }

    await this.prisma.$transaction([
      this.prisma.refreshToken.update({
        where: { tokenHash },
        data: { revokedAt: new Date() }
      }),
      this.prisma.userSession.updateMany({
        where: {
          refreshTokenHash: tokenHash,
          status: 'ACTIVE'
        },
        data: {
          status: 'EXPIRED',
          revokedAt: new Date()
        }
      })
    ]);

    return this.issueTokens(payload.sub, ctx);
  }

  async logout(rawRefreshToken: string): Promise<void> {
    if (!rawRefreshToken) return;
    const tokenHash = this.hashToken(rawRefreshToken);

    await this.prisma.$transaction([
      this.prisma.refreshToken.updateMany({
        where: { tokenHash },
        data: { revokedAt: new Date() }
      }),
      this.prisma.userSession.updateMany({
        where: {
          refreshTokenHash: tokenHash,
          status: 'ACTIVE'
        },
        data: {
          status: 'REVOKED',
          revokedAt: new Date()
        }
      })
    ]);
  }

  async verifyEmail(token: string) {
    const tokenHash = this.hashToken(token);

    const record = await this.prisma.emailVerificationToken.findUnique({
      where: { tokenHash },
      include: { user: true }
    });

    if (!record || record.expiresAt < new Date() || record.verifiedAt) {
      throw new UnauthorizedException('Verification token is invalid or expired');
    }

    await this.prisma.emailVerificationToken.update({
      where: { id: record.id },
      data: { verifiedAt: new Date() }
    });

    await this.prisma.auditLog.create({
      data: {
        organisationId: record.organisationId,
        actorId: record.userId,
        action: 'auth.email_verified',
        entityType: 'User',
        entityId: record.userId
      }
    });

    return { ok: true };
  }

  async setupTotp(user: AuthUser) {
    const secret = generateTotpSecret();
    const recoveryCodes = generateRecoveryCodes();

    const factor = await this.prisma.totpFactor.create({
      data: {
        userId: user.id,
        secretEncrypted: this.encryption.encrypt(secret),
        recoveryCodesEnc: recoveryCodes.map((code) => this.encryption.encrypt(code))
      }
    });

    return {
      factorId: factor.id,
      secret,
      otpAuthUrl: buildOtpAuthUrl({
        issuer: config.jwt.issuer,
        accountName: user.email,
        secret
      }),
      recoveryCodes
    };
  }

  async verifyTotp(user: AuthUser, code: string) {
    const factor = await this.prisma.totpFactor.findFirst({
      where: {
        userId: user.id,
        disabledAt: null,
        verifiedAt: null
      },
      orderBy: { createdAt: 'desc' }
    });

    if (!factor) {
      throw new UnauthorizedException('No pending TOTP factor');
    }

    const secret = this.encryption.decrypt(factor.secretEncrypted);
    if (!secret || !verifyTotpCode(secret, code)) {
      throw new UnauthorizedException('Invalid TOTP code');
    }

    await this.prisma.totpFactor.update({
      where: { id: factor.id },
      data: {
        verifiedAt: new Date()
      }
    });

    return { ok: true };
  }

  async listSessions(user: AuthUser) {
    return this.prisma.userSession.findMany({
      where: {
        userId: user.id
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        deviceLabel: true,
        ipAddress: true,
        userAgent: true,
        status: true,
        createdAt: true,
        lastSeenAt: true,
        expiresAt: true
      }
    });
  }

  async revokeSession(user: AuthUser, sessionId: string) {
    const session = await this.prisma.userSession.findFirst({
      where: {
        id: sessionId,
        userId: user.id
      }
    });

    if (!session) {
      throw new UnauthorizedException('Session not found');
    }

    await this.prisma.$transaction([
      this.prisma.userSession.update({
        where: { id: session.id },
        data: {
          status: 'REVOKED',
          revokedAt: new Date()
        }
      }),
      this.prisma.refreshToken.updateMany({
        where: {
          tokenHash: session.refreshTokenHash,
          revokedAt: null
        },
        data: {
          revokedAt: new Date()
        }
      })
    ]);

    return { ok: true };
  }
}
