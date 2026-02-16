import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Permissions } from '../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import type { AuthUser } from '../common/types/auth-user';
import { ApplySetlistOpsDto } from './dto/apply-ops.dto';
import { CreateSetlistDto } from './dto/create-setlist.dto';
import { SetlistsService } from './setlists.service';

@ApiTags('setlists')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('setlists')
export class SetlistsController {
  constructor(private readonly setlists: SetlistsService) {}

  @Get()
  @Permissions('read:setlists')
  list(@CurrentUser() user: AuthUser, @Query('bandId') bandId: string) {
    return this.setlists.list(user, bandId);
  }

  @Post()
  @Permissions('write:setlists')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateSetlistDto) {
    return this.setlists.create(user, dto);
  }

  @Get(':id')
  @Permissions('read:setlists')
  getOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.setlists.getOne(user, id);
  }

  @Post(':id/ops')
  @Permissions('write:setlists')
  applyOps(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: ApplySetlistOpsDto) {
    return this.setlists.applyOperations(user, id, dto);
  }

  @Post(':id/lock')
  @Permissions('write:setlists')
  lock(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.setlists.lock(user, id);
  }
}
