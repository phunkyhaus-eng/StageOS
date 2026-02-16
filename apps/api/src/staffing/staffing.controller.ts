import { Body, Controller, Get, Param, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Permissions } from '../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import type { AuthUser } from '../common/types/auth-user';
import { AssignManualDto } from './dto/assign-manual.dto';
import { OfferDecision, RespondOfferDto } from './dto/respond-offer.dto';
import { UpsertGigRequirementsDto } from './dto/upsert-gig-requirements.dto';
import { CreatePersonDto, UpdatePersonDto } from './dto/upsert-person.dto';
import { UpdateMusicianProfileDto } from './dto/update-musician-profile.dto';
import { VerifyPersonEmailDto } from './dto/verify-person-email.dto';
import { StaffingService } from './staffing.service';

@ApiTags('staffing')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('staffing')
export class StaffingController {
  constructor(private readonly staffing: StaffingService) {}

  @Get('persons')
  @Permissions('read:events')
  listPersons(@CurrentUser() user: AuthUser, @Query('bandId') bandId: string) {
    return this.staffing.listPersons(user, bandId);
  }

  @Post('persons')
  @Permissions('write:events')
  createPerson(@CurrentUser() user: AuthUser, @Body() dto: CreatePersonDto) {
    return this.staffing.createPerson(user, dto);
  }

  @Patch('persons/:id')
  @Permissions('write:events')
  updatePerson(@CurrentUser() user: AuthUser, @Param('id') personId: string, @Body() dto: UpdatePersonDto) {
    return this.staffing.updatePerson(user, personId, dto);
  }

  @Post('persons/:id/send-verification')
  @Permissions('write:events')
  sendPersonVerification(@CurrentUser() user: AuthUser, @Param('id') personId: string) {
    return this.staffing.issuePersonEmailVerification(user, personId);
  }

  @Get('gigs/:gigId')
  @Permissions('read:events')
  getGigStaffing(@CurrentUser() user: AuthUser, @Param('gigId') gigId: string) {
    return this.staffing.getGigStaffing(user, gigId);
  }

  @Put('gigs/:gigId/requirements')
  @Permissions('write:events')
  upsertGigRequirements(
    @CurrentUser() user: AuthUser,
    @Param('gigId') gigId: string,
    @Body() dto: UpsertGigRequirementsDto
  ) {
    return this.staffing.upsertGigRequirements(user, gigId, dto);
  }

  @Post('requirements/:id/start')
  @Permissions('write:events')
  startOffers(@CurrentUser() user: AuthUser, @Param('id') requirementId: string) {
    return this.staffing.startOffers(user, requirementId);
  }

  @Post('requirements/:id/pause')
  @Permissions('write:events')
  pauseOffers(@CurrentUser() user: AuthUser, @Param('id') requirementId: string) {
    return this.staffing.pauseOffers(user, requirementId);
  }

  @Post('requirements/:id/skip')
  @Permissions('write:events')
  skipCandidate(@CurrentUser() user: AuthUser, @Param('id') requirementId: string) {
    return this.staffing.skipCandidate(user, requirementId);
  }

  @Post('requirements/:id/resend')
  @Permissions('write:events')
  resendOffer(@CurrentUser() user: AuthUser, @Param('id') requirementId: string) {
    return this.staffing.resendActiveOffer(user, requirementId);
  }

  @Post('requirements/:id/assign-manual')
  @Permissions('write:events')
  assignManual(
    @CurrentUser() user: AuthUser,
    @Param('id') requirementId: string,
    @Body() dto: AssignManualDto
  ) {
    return this.staffing.assignManual(user, requirementId, dto);
  }

  @Get('musician/offers')
  @Permissions('read:events')
  listMusicianOffers(@CurrentUser() user: AuthUser, @Query('bandId') bandId?: string) {
    return this.staffing.listMusicianOffers(user, bandId);
  }

  @Post('musician/offers/:attemptId/respond')
  @Permissions('write:events')
  respondAsMusician(
    @CurrentUser() user: AuthUser,
    @Param('attemptId') attemptId: string,
    @Body() dto: RespondOfferDto
  ) {
    return this.staffing.respondToOfferAsMusician(user, attemptId, dto.decision);
  }

  @Get('musician/offers/:attemptId/links')
  @Permissions('read:events')
  getMusicianOfferLinks(@CurrentUser() user: AuthUser, @Param('attemptId') attemptId: string) {
    return this.staffing.getMusicianOfferResponseLink(user, attemptId);
  }

  @Patch('musician/profile')
  @Permissions('write:events')
  updateMusicianProfile(@CurrentUser() user: AuthUser, @Body() dto: UpdateMusicianProfileDto) {
    return this.staffing.updateMusicianProfile(user, dto);
  }

  @Post('musician/verify-email')
  @Permissions('write:events')
  verifyMusicianEmail(@CurrentUser() user: AuthUser, @Body() dto: VerifyPersonEmailDto) {
    return this.staffing.verifyPersonEmailTokenForUser(user, dto.token);
  }

  @Post('offers/respond-token')
  respondUsingToken(@Body() dto: { token: string; decision: OfferDecision }) {
    const decision = dto.decision === OfferDecision.NO ? OfferDecision.NO : OfferDecision.YES;
    return this.staffing.respondToOfferToken(dto.token, decision);
  }
}
