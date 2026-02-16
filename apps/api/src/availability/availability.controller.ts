import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Permissions } from '../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import type { AuthUser } from '../common/types/auth-user';
import { AvailabilityService } from './availability.service';
import { AvailabilityGridDto } from './dto/availability-grid.dto';
import { CreateAvailabilityRequestDto } from './dto/create-availability-request.dto';
import { RespondAvailabilityDto } from './dto/respond-availability.dto';

@ApiTags('availability')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('availability')
export class AvailabilityController {
  constructor(private readonly availability: AvailabilityService) {}

  @Get('requests')
  @Permissions('read:availability')
  listRequests(
    @CurrentUser() user: AuthUser,
    @Query('bandId') bandId: string,
    @Query('eventId') eventId?: string
  ) {
    return this.availability.listRequests(user, bandId, eventId);
  }

  @Post('requests')
  @Permissions('write:availability')
  createRequest(@CurrentUser() user: AuthUser, @Body() dto: CreateAvailabilityRequestDto) {
    return this.availability.createRequest(user, dto);
  }

  @Post('requests/:id/respond')
  @Permissions('write:availability')
  respond(
    @CurrentUser() user: AuthUser,
    @Param('id') requestId: string,
    @Body() dto: RespondAvailabilityDto
  ) {
    return this.availability.respond(user, requestId, dto);
  }

  @Post('requests/:id/lock')
  @Permissions('write:availability')
  lockRoster(@CurrentUser() user: AuthUser, @Param('id') requestId: string) {
    return this.availability.lockRoster(user, requestId);
  }

  @Get('grid')
  @Permissions('read:availability')
  grid(@CurrentUser() user: AuthUser, @Query() query: AvailabilityGridDto) {
    return this.availability.grid(user, query);
  }
}
