import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Permissions } from '../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import type { AuthUser } from '../common/types/auth-user';
import { CreateFileVersionDto } from './dto/create-file-version.dto';
import { ListFilesDto } from './dto/list-files.dto';
import { PresignUploadDto } from './dto/presign-upload.dto';
import { FilesService } from './files.service';

@ApiTags('files')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('files')
export class FilesController {
  constructor(private readonly files: FilesService) {}

  @Get()
  @Permissions('read:files')
  list(@CurrentUser() user: AuthUser, @Query() query: ListFilesDto) {
    return this.files.list(user, query);
  }

  @Post('presign-upload')
  @Permissions('write:files')
  presignUpload(@CurrentUser() user: AuthUser, @Body() dto: PresignUploadDto) {
    return this.files.presignUpload(user, dto);
  }

  @Post(':id/presign-download')
  @Permissions('read:files')
  presignDownload(@CurrentUser() user: AuthUser, @Param('id') fileId: string) {
    return this.files.presignDownload(user, fileId);
  }

  @Post(':id/prefetch')
  @Permissions('write:files')
  prefetch(@CurrentUser() user: AuthUser, @Param('id') fileId: string) {
    return this.files.markPrefetched(user, fileId);
  }

  @Post('versions')
  @Permissions('write:files')
  createVersion(@CurrentUser() user: AuthUser, @Body() dto: CreateFileVersionDto) {
    return this.files.createVersion(user, dto);
  }
}
