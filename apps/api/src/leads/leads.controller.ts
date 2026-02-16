import { Body, Controller, Delete, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Permissions } from '../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import type { AuthUser } from '../common/types/auth-user';
import { CreateLeadDto } from './dto/create-lead.dto';
import { UpdateLeadDto } from './dto/update-lead.dto';
import { LeadsService } from './leads.service';

@ApiTags('crm')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('leads')
export class LeadsController {
  constructor(private readonly leads: LeadsService) {}

  @Get()
  @Permissions('read:crm')
  list(@CurrentUser() user: AuthUser, @Query('bandId') bandId: string, @Query('q') query?: string) {
    return this.leads.listBoard(user, bandId, query);
  }

  @Post()
  @Permissions('write:crm')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateLeadDto) {
    return this.leads.create(user, dto);
  }

  @Put(':id')
  @Permissions('write:crm')
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateLeadDto) {
    return this.leads.update(user, id, dto);
  }

  @Post(':id/convert')
  @Permissions('write:crm')
  convert(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.leads.convertToEvent(user, id);
  }

  @Delete(':id')
  @Permissions('write:crm')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.leads.softDelete(user, id);
  }
}
