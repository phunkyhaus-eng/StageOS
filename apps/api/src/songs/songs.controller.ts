import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Permissions } from '../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import type { AuthUser } from '../common/types/auth-user';
import { CreateSongDto } from './dto/create-song.dto';
import { CreateSongVersionDto } from './dto/create-song-version.dto';
import { SongsService } from './songs.service';

@ApiTags('songs')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('songs')
export class SongsController {
  constructor(private readonly songs: SongsService) {}

  @Get()
  @Permissions('read:setlists')
  list(@CurrentUser() user: AuthUser, @Query('bandId') bandId: string) {
    return this.songs.list(user, bandId);
  }

  @Post()
  @Permissions('write:setlists')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateSongDto) {
    return this.songs.create(user, dto);
  }

  @Post('versions')
  @Permissions('write:setlists')
  createVersion(@CurrentUser() user: AuthUser, @Body() dto: CreateSongVersionDto) {
    return this.songs.createVersion(user, dto);
  }
}
