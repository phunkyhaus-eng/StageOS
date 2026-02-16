import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { config } from '../config';
import { EncryptionService } from '../common/encryption.service';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './jwt.strategy';

@Module({
  imports: [
    PassportModule,
    JwtModule.register({
      secret: config.jwt.accessSecret,
      signOptions: { expiresIn: config.jwt.accessTtl, issuer: config.jwt.issuer }
    })
  ],
  providers: [AuthService, JwtStrategy, EncryptionService],
  controllers: [AuthController],
  exports: [AuthService]
})
export class AuthModule {}
