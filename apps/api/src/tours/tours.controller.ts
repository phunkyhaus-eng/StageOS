import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Permissions } from '../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import type { AuthUser } from '../common/types/auth-user';
import { AddTourEventDto } from './dto/add-tour-event.dto';
import { CreateItineraryItemDto } from './dto/create-itinerary-item.dto';
import { CreateTourDto } from './dto/create-tour.dto';
import { TourSheetQueryDto } from './dto/tour-sheet-query.dto';
import { ToursService } from './tours.service';

@ApiTags('tours')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('tours')
export class ToursController {
  constructor(private readonly tours: ToursService) {}

  @Get()
  @Permissions('read:tours')
  list(@CurrentUser() user: AuthUser, @Query('bandId') bandId: string) {
    return this.tours.list(user, bandId);
  }

  @Post()
  @Permissions('write:tours')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateTourDto) {
    return this.tours.create(user, dto);
  }

  @Get(':id')
  @Permissions('read:tours')
  getById(@CurrentUser() user: AuthUser, @Param('id') tourId: string) {
    return this.tours.getById(user, tourId);
  }

  @Post(':id/events')
  @Permissions('write:tours')
  addEvents(@CurrentUser() user: AuthUser, @Param('id') tourId: string, @Body() dto: AddTourEventDto) {
    return this.tours.addEvents(user, tourId, dto);
  }

  @Post(':id/itinerary')
  @Permissions('write:tours')
  addItinerary(
    @CurrentUser() user: AuthUser,
    @Param('id') tourId: string,
    @Body() dto: CreateItineraryItemDto
  ) {
    return this.tours.addItineraryItem(user, tourId, dto);
  }

  @Get(':id/sheet')
  @Permissions('read:tours')
  getSheet(
    @CurrentUser() user: AuthUser,
    @Param('id') tourId: string,
    @Query() query: TourSheetQueryDto
  ) {
    return this.tours.dailySheet(user, tourId, query);
  }
}
