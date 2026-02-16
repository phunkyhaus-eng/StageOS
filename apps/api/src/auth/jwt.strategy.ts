import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { config } from '../config';
import type { AuthUser } from '../common/types/auth-user';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.jwt.accessSecret,
      issuer: config.jwt.issuer
    });
  }

  async validate(payload: AuthUser & { sub: string }): Promise<AuthUser> {
    return {
      id: payload.sub,
      email: payload.email,
      organisationId: payload.organisationId,
      roles: payload.roles,
      permissions: payload.permissions
    };
  }
}
