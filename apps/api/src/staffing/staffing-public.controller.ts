import { Controller, Get, Param } from '@nestjs/common';
import { OfferDecision } from './dto/respond-offer.dto';
import { StaffingService } from './staffing.service';

@Controller('staffing')
export class StaffingPublicController {
  constructor(private readonly staffing: StaffingService) {}

  @Get('offers/respond/:token/:decision')
  respondFromEmail(
    @Param('token') token: string,
    @Param('decision') rawDecision: string
  ) {
    const decision = rawDecision.toLowerCase() === 'no' ? OfferDecision.NO : OfferDecision.YES;
    return this.staffing.respondToOfferToken(token, decision);
  }

  @Get('verify/:token')
  verifyPersonEmail(@Param('token') token: string) {
    return this.staffing.verifyPersonEmailTokenPublic(token);
  }
}
