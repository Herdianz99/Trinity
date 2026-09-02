import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { IpAccessService } from '../../common/ip-access.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    private readonly ipAccess: IpAccessService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get('JWT_SECRET', 'default-secret'),
      passReqToCallback: true,
    });
  }

  async validate(req: Request, payload: any) {
    // IP-lock: si el usuario está restringido, verificar su IP en cada request.
    // La whitelist se lee live (caché 30s); el flag viene del token.
    if (payload?.restrictToOnSiteIp) {
      const blocked = await this.ipAccess.shouldBlock(req.ip || '', {
        restrict: true,
        role: payload.role,
      });
      if (blocked) {
        throw new UnauthorizedException({
          code: 'OFFSITE_BLOCKED',
          message: 'Acceso permitido solo desde el local.',
        });
      }
    }
    return {
      id: payload.sub,
      name: payload.name,
      email: payload.email,
      role: payload.role,
      permissions: payload.permissions,
      mustChangePassword: payload.mustChangePassword,
    };
  }
}
