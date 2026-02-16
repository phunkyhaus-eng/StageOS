import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnsupportedMediaTypeException
} from '@nestjs/common';
import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../config';
import { AuditService } from '../common/audit.service';
import type { AuthUser } from '../common/types/auth-user';
import { PrismaService } from '../prisma/prisma.service';
import { AccessService } from '../rbac/access.service';
import { ChangeLogService } from '../sync/change-log.service';
import { CreateFileVersionDto } from './dto/create-file-version.dto';
import { ListFilesDto } from './dto/list-files.dto';
import { PresignUploadDto } from './dto/presign-upload.dto';

const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
  'audio/mpeg',
  'audio/wav',
  'audio/x-wav',
  'text/plain',
  'text/csv',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
]);

@Injectable()
export class FilesService {
  private readonly s3 = new S3Client({
    endpoint: config.s3.endpoint,
    region: config.s3.region,
    forcePathStyle: config.s3.forcePathStyle,
    credentials: {
      accessKeyId: config.s3.accessKeyId,
      secretAccessKey: config.s3.secretAccessKey
    }
  });

  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly changeLog: ChangeLogService,
    private readonly audit: AuditService
  ) {}

  private sanitizeFileName(fileName: string): string {
    const normalized = fileName
      .trim()
      .replace(/\s+/g, '-')
      .replace(/[^a-zA-Z0-9._-]/g, '')
      .slice(0, 120);

    if (!normalized) {
      throw new BadRequestException('Invalid filename');
    }

    return normalized;
  }

  private scanInput(input: { mimeType: string; sizeBytes: number; fileName: string }) {
    if (input.sizeBytes > config.limits.fileMaxBytes) {
      throw new BadRequestException(`File exceeds maximum size of ${config.limits.fileMaxBytes} bytes`);
    }

    if (!ALLOWED_MIME_TYPES.has(input.mimeType)) {
      throw new UnsupportedMediaTypeException(
        `MIME type ${input.mimeType} is not allowed by security policy`
      );
    }

    const lower = input.fileName.toLowerCase();
    if (lower.endsWith('.exe') || lower.endsWith('.dll') || lower.endsWith('.sh')) {
      throw new UnsupportedMediaTypeException('Executable uploads are not allowed');
    }
  }

  private buildObjectKey(input: {
    organisationId: string;
    bandId: string;
    fileName: string;
    scope: 'events' | 'leads' | 'songs' | 'general';
    scopeId?: string;
  }): string {
    const now = new Date();
    const year = now.getUTCFullYear();
    const month = String(now.getUTCMonth() + 1).padStart(2, '0');
    const scopeSegment = input.scopeId ? `${input.scope}/${input.scopeId}` : input.scope;

    return `org/${input.organisationId}/band/${input.bandId}/${scopeSegment}/${year}/${month}/${uuidv4()}-${input.fileName}`;
  }

  async list(user: AuthUser, query: ListFilesDto) {
    await this.access.ensureBandAccess(user, query.bandId);

    const links = await this.prisma.fileAssetLink.findMany({
      where: {
        organisationId: user.organisationId,
        bandId: query.bandId,
        eventId: query.eventId,
        leadId: query.leadId,
        songVersionId: query.songVersionId
      },
      include: {
        fileAsset: true,
        event: {
          select: {
            id: true,
            title: true,
            startsAt: true
          }
        },
        lead: {
          select: {
            id: true,
            name: true,
            stage: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    return links.map((link) => ({
      id: link.fileAsset.id,
      linkId: link.id,
      fileName: link.fileAsset.fileName,
      mimeType: link.fileAsset.mimeType,
      sizeBytes: link.fileAsset.sizeBytes,
      availableOffline: link.fileAsset.availableOffline,
      version: link.fileAsset.version,
      createdAt: link.fileAsset.createdAt,
      event: link.event,
      lead: link.lead,
      objectKey: link.fileAsset.objectKey
    }));
  }

  async presignUpload(user: AuthUser, dto: PresignUploadDto) {
    await this.access.ensureBandAccess(user, dto.bandId);

    const fileName = this.sanitizeFileName(dto.fileName);
    this.scanInput({ mimeType: dto.mimeType, sizeBytes: dto.sizeBytes, fileName });

    const scope: 'events' | 'leads' | 'songs' | 'general' = dto.eventId
      ? 'events'
      : dto.leadId
        ? 'leads'
        : dto.songVersionId
          ? 'songs'
          : 'general';

    const scopeId = dto.eventId ?? dto.leadId ?? dto.songVersionId;
    const objectKey = this.buildObjectKey({
      organisationId: user.organisationId,
      bandId: dto.bandId,
      fileName,
      scope,
      scopeId
    });

    const asset = await this.prisma.fileAsset.create({
      data: {
        organisationId: user.organisationId,
        bandId: dto.bandId,
        bucket: config.s3.bucket,
        objectKey,
        fileName,
        mimeType: dto.mimeType,
        sizeBytes: dto.sizeBytes,
        checksum: null,
        availableOffline: false,
        version: 1
      }
    });

    await this.prisma.fileAssetLink.create({
      data: {
        organisationId: user.organisationId,
        bandId: dto.bandId,
        fileAssetId: asset.id,
        eventId: dto.eventId,
        leadId: dto.leadId,
        songVersionId: dto.songVersionId
      }
    });

    const uploadUrl = await getSignedUrl(
      this.s3,
      new PutObjectCommand({
        Bucket: config.s3.bucket,
        Key: objectKey,
        ContentType: dto.mimeType,
        ContentLength: dto.sizeBytes
      }),
      { expiresIn: 900 }
    );

    await this.changeLog.append({
      organisationId: user.organisationId,
      bandId: dto.bandId,
      entityType: 'FILE',
      entityId: asset.id,
      action: 'create',
      version: asset.version,
      payload: {
        fileName,
        objectKey
      }
    });

    return {
      fileId: asset.id,
      objectKey,
      uploadUrl,
      headers: {
        'content-type': dto.mimeType
      }
    };
  }

  async presignDownload(user: AuthUser, fileId: string) {
    const file = await this.prisma.fileAsset.findFirst({
      where: {
        id: fileId,
        organisationId: user.organisationId,
        deletedAt: null
      }
    });

    if (!file) throw new NotFoundException('File not found');
    if (file.bandId) {
      await this.access.ensureBandAccess(user, file.bandId);
    }

    const downloadUrl = await getSignedUrl(
      this.s3,
      new GetObjectCommand({
        Bucket: file.bucket,
        Key: file.objectKey,
        ResponseContentType: file.mimeType,
        ResponseContentDisposition: `inline; filename="${file.fileName}"`
      }),
      { expiresIn: 600 }
    );

    return {
      fileId: file.id,
      fileName: file.fileName,
      mimeType: file.mimeType,
      downloadUrl
    };
  }

  async markPrefetched(user: AuthUser, fileId: string) {
    const file = await this.prisma.fileAsset.findFirst({
      where: {
        id: fileId,
        organisationId: user.organisationId,
        deletedAt: null
      }
    });
    if (!file) throw new NotFoundException('File not found');
    if (file.bandId) {
      await this.access.ensureBandAccess(user, file.bandId);
    }

    const updated = await this.prisma.fileAsset.update({
      where: { id: file.id },
      data: {
        availableOffline: true,
        version: { increment: 1 }
      }
    });

    await this.changeLog.append({
      organisationId: user.organisationId,
      bandId: updated.bandId ?? '',
      entityType: 'FILE',
      entityId: updated.id,
      action: 'update',
      version: updated.version,
      payload: { availableOffline: true }
    });

    return updated;
  }

  async createVersion(user: AuthUser, dto: CreateFileVersionDto) {
    const source = await this.prisma.fileAsset.findFirst({
      where: {
        id: dto.sourceFileId,
        organisationId: user.organisationId,
        deletedAt: null
      },
      include: {
        links: true
      }
    });

    if (!source) throw new NotFoundException('Source file not found');
    if (!source.bandId) {
      throw new BadRequestException('Source file is not attached to a band context');
    }

    await this.access.ensureBandAccess(user, source.bandId);

    const versionNumber = source.version + 1;
    const sanitized = this.sanitizeFileName(dto.fileName);

    const objectKey = source.objectKey.replace(/(\.[^./]+)?$/, `-v${versionNumber}$1`);
    const created = await this.prisma.fileAsset.create({
      data: {
        organisationId: user.organisationId,
        bandId: source.bandId,
        bucket: source.bucket,
        objectKey,
        fileName: sanitized,
        mimeType: dto.mimeType,
        sizeBytes: source.sizeBytes,
        version: versionNumber,
        links: {
          createMany: {
            data: source.links.map((link) => ({
              organisationId: link.organisationId,
              bandId: link.bandId,
              eventId: link.eventId,
              leadId: link.leadId,
              songVersionId: link.songVersionId
            }))
          }
        }
      }
    });

    const uploadUrl = await getSignedUrl(
      this.s3,
      new PutObjectCommand({
        Bucket: created.bucket,
        Key: created.objectKey,
        ContentType: dto.mimeType
      }),
      { expiresIn: 900 }
    );

    await this.audit.log({
      organisationId: user.organisationId,
      actorId: user.id,
      action: 'file.version.create',
      entityType: 'FileAsset',
      entityId: created.id,
      metadata: {
        sourceFileId: source.id,
        version: created.version
      }
    });

    return {
      fileId: created.id,
      sourceFileId: source.id,
      version: created.version,
      uploadUrl,
      objectKey: created.objectKey
    };
  }
}
