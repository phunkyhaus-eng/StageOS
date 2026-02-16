import { Body, Controller, Get, Header, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Permissions } from '../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import type { AuthUser } from '../common/types/auth-user';
import { CalendarService } from './calendar.service';
import { GoogleSyncDto } from './dto/google-sync.dto';

@ApiTags('calendar')
@Controller('calendar')
export class CalendarController {
  constructor(private readonly calendar: CalendarService) {}

  @Get('bands/ics')
  @Header('Content-Type', 'text/calendar; charset=utf-8')
  async bandIcs(@Query('token') token: string) {
    return this.calendar.bandIcs(token);
  }

  @Get('users/ics')
  @Header('Content-Type', 'text/calendar; charset=utf-8')
  async userIcs(@Query('token') token: string) {
    return this.calendar.userIcs(token);
  }

  @Get('export.csv')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions('read:events')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  async exportCsv(@CurrentUser() user: AuthUser, @Query('bandId') bandId: string) {
    return this.calendar.exportCsv(user, bandId);
  }

  @Post('google/sync')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions('write:events')
  syncGoogle(@CurrentUser() user: AuthUser, @Body() dto: GoogleSyncDto) {
    return this.calendar.syncGoogleCalendar(user, dto);
  }
}
