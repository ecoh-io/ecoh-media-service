import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule } from '@nestjs/config';
import { JwtStrategy } from './jwt.strategy';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    ConfigModule, // Import ConfigModule to access environment variables
  ],
  providers: [JwtStrategy],
  exports: [PassportModule],
})
export class AuthModule {}
