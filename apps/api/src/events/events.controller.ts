import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
  UseGuards
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Permissions } from '../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import type { AuthUser } from '../common/types/auth-user';
import { CreateEventDto } from './dto/create-event.dto';
import { UpdateEventDto } from './dto/update-event.dto';
import { EventsService } from './events.service';

@ApiTags('events')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('events')
export class EventsController {
  constructor(private readonly events: EventsService) {}

  @Get()
  @Permissions('read:events')
  list(
    @CurrentUser() user: AuthUser,
    @Query('bandId') bandId: string,
    @Query('page', new ParseIntPipe({ optional: true })) page?: number,
    @Query('pageSize', new ParseIntPipe({ optional: true })) pageSize?: number
  ) {
    return this.events.list(user, bandId, page, pageSize);
  }

  @Post()
  @Permissions('write:events')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateEventDto) {
    return this.events.create(user, dto);
  }

  @Get(':id')
  @Permissions('read:events')
  get(@CurrentUser() user: AuthUser, @Param('id') eventId: string) {
    return this.events.getById(user, eventId);
  }

  @Put(':id')
  @Permissions('write:events')
  update(@CurrentUser() user: AuthUser, @Param('id') eventId: string, @Body() dto: UpdateEventDto) {
    return this.events.update(user, eventId, dto);
  }

  @Post(':id/roster/lock')
  @Permissions('write:events')
  lockRoster(@CurrentUser() user: AuthUser, @Param('id') eventId: string) {
    return this.events.lockRoster(user, eventId);
  }

  @Delete(':id')
  @Permissions('write:events')
  delete(@CurrentUser() user: AuthUser, @Param('id') eventId: string) {
    return this.events.softDelete(user, eventId);
  }
}
