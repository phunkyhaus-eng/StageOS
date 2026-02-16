import { BadRequestException, Injectable } from '@nestjs/common';
import { PluginStatus, Prisma } from '@prisma/client';
import vm from 'node:vm';
import { AuditService } from '../common/audit.service';
import type { AuthUser } from '../common/types/auth-user';
import { PrismaService } from '../prisma/prisma.service';
import { UpsertPluginDto } from './dto/upsert-plugin.dto';

interface PluginManifest {
  hooks: string[];
  handler: string;
  featureFlag?: string;
}

@Injectable()
export class PluginsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService
  ) {}

  async list(user: AuthUser) {
    return this.prisma.plugin.findMany({
      where: {
        organisationId: user.organisationId,
        deletedAt: null
      },
      orderBy: { createdAt: 'desc' }
    });
  }

  async upsert(user: AuthUser, dto: UpsertPluginDto) {
    const manifest = dto.manifest as PluginManifest;
    if (!manifest || !Array.isArray(manifest.hooks) || typeof manifest.handler !== 'string') {
      throw new BadRequestException('Plugin manifest must include hooks[] and handler source code');
    }

    const existing = await this.prisma.plugin.findFirst({
      where: {
        organisationId: user.organisationId,
        key: dto.key,
        deletedAt: null
      }
    });

    const createData: Prisma.PluginUncheckedCreateInput = {
      organisationId: user.organisationId,
      key: dto.key,
      name: dto.name,
      version: dto.version,
      status: PluginStatus.INSTALLED,
      sourceUrl: dto.sourceUrl,
      manifest: dto.manifest as unknown as Prisma.InputJsonValue,
      sandboxPolicy: dto.sandboxPolicy as unknown as Prisma.InputJsonValue,
      enabled: dto.enabled ?? true,
      createdByUserId: user.id
    };

    const updateData: Prisma.PluginUncheckedUpdateInput = {
      name: dto.name,
      version: dto.version,
      status: PluginStatus.INSTALLED,
      sourceUrl: dto.sourceUrl,
      manifest: dto.manifest as unknown as Prisma.InputJsonValue,
      sandboxPolicy: dto.sandboxPolicy as unknown as Prisma.InputJsonValue,
      enabled: dto.enabled ?? true,
      createdByUserId: user.id
    };

    const plugin = existing
      ? await this.prisma.plugin.update({ where: { id: existing.id }, data: updateData })
      : await this.prisma.plugin.create({ data: createData });

    await this.audit.log({
      organisationId: user.organisationId,
      actorId: user.id,
      action: existing ? 'plugin.update' : 'plugin.install',
      entityType: 'Plugin',
      entityId: plugin.id,
      metadata: {
        key: plugin.key,
        version: plugin.version,
        enabled: plugin.enabled
      }
    });

    return plugin;
  }

  async disable(user: AuthUser, pluginId: string) {
    const plugin = await this.prisma.plugin.updateMany({
      where: {
        id: pluginId,
        organisationId: user.organisationId,
        deletedAt: null
      },
      data: {
        enabled: false,
        status: PluginStatus.DISABLED
      }
    });

    return { ok: plugin.count > 0 };
  }

  async emitForUser(user: AuthUser, hook: string, payload: Record<string, unknown>) {
    return this.emit(user.organisationId, hook, payload, user.id);
  }

  async emit(
    organisationId: string,
    hook: string,
    payload: Record<string, unknown>,
    actorUserId?: string
  ) {
    const plugins = await this.prisma.plugin.findMany({
      where: {
        organisationId,
        enabled: true,
        status: { not: PluginStatus.DISABLED },
        deletedAt: null
      }
    });

    const results: Array<{ pluginKey: string; ok: boolean; result?: unknown; error?: string }> = [];

    for (const plugin of plugins) {
      const manifest = plugin.manifest as unknown as PluginManifest;
      if (!manifest.hooks.includes(hook)) {
        continue;
      }

      if (manifest.featureFlag) {
        const flag = await this.prisma.featureFlag.findFirst({
          where: {
            organisationId,
            key: manifest.featureFlag,
            deletedAt: null,
            userId: null
          }
        });

        if (!flag?.enabled) {
          continue;
        }
      }

      const started = Date.now();
      let executionResult: unknown;
      let executionError: string | undefined;

      try {
        const sandbox = {
          payload: structuredClone(payload),
          context: {
            organisationId,
            actorUserId: actorUserId ?? null,
            hook,
            now: new Date().toISOString()
          },
          result: null as unknown
        };

        const ctx = vm.createContext(sandbox, {
          name: `stageos-plugin-${plugin.key}`,
          codeGeneration: {
            strings: false,
            wasm: false
          }
        });

        const script = new vm.Script(
          `const __handler = (${manifest.handler}); result = __handler(payload, context);`
        );

        script.runInContext(ctx, { timeout: 250 });
        executionResult = sandbox.result;
      } catch (error) {
        executionError = error instanceof Error ? error.message : 'Plugin runtime error';
      }

      const durationMs = Date.now() - started;
      await this.prisma.pluginExecution.create({
        data: {
          organisationId,
          pluginId: plugin.id,
          actorUserId,
          hook,
          payload: payload as unknown as Prisma.InputJsonValue,
          result: executionResult as Prisma.InputJsonValue | undefined,
          error: executionError,
          durationMs
        }
      });

      if (executionError) {
        await this.prisma.plugin.update({
          where: { id: plugin.id },
          data: { status: PluginStatus.ERROR }
        });

        results.push({ pluginKey: plugin.key, ok: false, error: executionError });
      } else {
        await this.prisma.plugin.update({
          where: { id: plugin.id },
          data: { status: PluginStatus.INSTALLED }
        });

        results.push({ pluginKey: plugin.key, ok: true, result: executionResult });
      }
    }

    return {
      hook,
      pluginRuns: results
    };
  }

  async executionHistory(user: AuthUser, pluginId?: string) {
    return this.prisma.pluginExecution.findMany({
      where: {
        organisationId: user.organisationId,
        pluginId
      },
      orderBy: { createdAt: 'desc' },
      take: 200
    });
  }
}
