import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, ExtractJwt, StrategyOptions } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import * as jwksRsa from 'jwks-rsa';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKeyProvider: jwksRsa.passportJwtSecret({
        cache: true,
        rateLimit: true,
        jwksRequestsPerMinute: 10,
        jwksUri: `https://cognito-idp.${configService.get<string>(
          'aws.region'
        )}.amazonaws.com/${configService.get<string>(
          'cognito.userPoolId'
        )}/.well-known/jwks.json`,
      }),
      issuer: `https://cognito-idp.${configService.get<string>(
        'aws.region'
      )}.amazonaws.com/${configService.get<string>('cognito.userPoolId')}`,
      algorithms: ['RS256'],
    } as StrategyOptions);
  }

  async validate(payload: any) {
    return payload;
  }
}
