import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
  UseGuards
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import type { AuthUser } from '../common/types/auth-user';
import { PrismaService } from '../prisma/prisma.service';
import { config } from '../config';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';
import { RegisterDto } from './dto/register.dto';
import { RevokeSessionDto } from './dto/revoke-session.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { VerifyTotpDto } from './dto/verify-totp.dto';

const REFRESH_COOKIE = 'stageos_refresh_token';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly prisma: PrismaService
  ) {}

  private setRefreshCookie(res: Response, refreshToken: string): void {
    res.cookie(REFRESH_COOKIE, refreshToken, {
      httpOnly: true,
      sameSite: 'lax',
      secure: config.jwt.cookieSecure,
      path: '/auth',
      maxAge: 30 * 24 * 60 * 60 * 1000
    });
  }

  @Post('register')
  async register(
    @Body() dto: RegisterDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response
  ) {
    const tokens = await this.authService.register(dto, {
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    });
    this.setRefreshCookie(res, tokens.refreshToken);
    return { accessToken: tokens.accessToken, sessionId: tokens.sessionId, emailVerificationToken: (tokens as { emailVerificationToken?: string }).emailVerificationToken };
  }

  @Post('login')
  @HttpCode(200)
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
    const tokens = await this.authService.login({
      email: dto.email,
      password: dto.password,
      totpCode: dto.totpCode,
      loginAs: dto.loginAs,
      context: {
        userAgent: res.req.get('user-agent'),
        ipAddress: res.req.ip,
        deviceName: dto.deviceName
      }
    });
    this.setRefreshCookie(res, tokens.refreshToken);
    return { accessToken: tokens.accessToken, sessionId: tokens.sessionId };
  }

  @Post('refresh')
  @HttpCode(200)
  async refresh(
    @Body() dto: RefreshDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response
  ) {
    const cookieToken = req.cookies?.[REFRESH_COOKIE] as string | undefined;
    const tokens = await this.authService.refresh(dto.refreshToken ?? cookieToken ?? '', {
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    });
    this.setRefreshCookie(res, tokens.refreshToken);
    return { accessToken: tokens.accessToken, sessionId: tokens.sessionId };
  }

  @Post('logout')
  @HttpCode(204)
  async logout(@Req() req: Request, @Body() dto: RefreshDto, @Res({ passthrough: true }) res: Response) {
    const token = dto.refreshToken ?? req.cookies?.[REFRESH_COOKIE] ?? '';
    await this.authService.logout(token);
    res.clearCookie(REFRESH_COOKIE, { path: '/auth' });
  }

  @Get('/me')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  async me(@CurrentUser() user: AuthUser) {
    const fullUser = await this.prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      select: {
        id: true,
        name: true,
        email: true,
        organisationId: true,
        memberships: {
          where: { deletedAt: null },
          select: { bandId: true, roleName: true, band: { select: { name: true } } }
        }
      }
    });

    return {
      ...fullUser,
      roles: user.roles,
      permissions: user.permissions
    };
  }

  @Post('verify-email')
  verifyEmail(@Body() dto: VerifyEmailDto) {
    return this.authService.verifyEmail(dto.token);
  }

  @Post('2fa/setup')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  setupTotp(@CurrentUser() user: AuthUser) {
    return this.authService.setupTotp(user);
  }

  @Post('2fa/verify')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  verifyTotp(@CurrentUser() user: AuthUser, @Body() dto: VerifyTotpDto) {
    return this.authService.verifyTotp(user, dto.code);
  }

  @Get('sessions')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  sessions(@CurrentUser() user: AuthUser) {
    return this.authService.listSessions(user);
  }

  @Post('sessions/revoke')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  revokeSession(@CurrentUser() user: AuthUser, @Body() dto: RevokeSessionDto) {
    return this.authService.revokeSession(user, dto.sessionId);
  }
}
