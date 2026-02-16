import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import type { AuthUser } from '../common/types/auth-user';
import { SyncPullDto } from './dto/sync-pull.dto';
import { SyncPushDto } from './dto/sync-push.dto';
import { SyncService } from './sync.service';

@ApiTags('sync')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('sync')
export class SyncController {
  constructor(private readonly sync: SyncService) {}

  @Post('pull')
  pull(@CurrentUser() user: AuthUser, @Body() dto: SyncPullDto) {
    return this.sync.pull(user, dto);
  }

  @Post('push')
  push(@CurrentUser() user: AuthUser, @Body() dto: SyncPushDto) {
    return this.sync.push(user, dto);
  }

  @Post('merge')
  merge(
    @CurrentUser() user: AuthUser,
    @Body()
    dto: {
      bandId: string;
      operation: SyncPushDto['operations'][number];
    }
  ) {
    return this.sync.merge(user, dto);
  }
}
