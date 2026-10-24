import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { passportJwtSecret } from 'jwks-rsa';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private configService: ConfigService) {
    // URL publique de Keycloak — utilisée dans le claim "iss" du token JWT
    // (le token est émis pour le browser, donc c'est localhost:8080)
    const keycloakPublicUrl =
      configService.get<string>('KEYCLOAK_AUTH_SERVER_URL') || 'http://localhost:8080';

    // URL interne de Keycloak — utilisée depuis le container backend pour
    // récupérer les clés JWKS. En Docker c'est http://keycloak:8080, en
    // local c'est la même chose que keycloakPublicUrl.
    const keycloakInternalUrl =
      configService.get<string>('KEYCLOAK_INTERNAL_URL') || keycloakPublicUrl;

    const realm = configService.get<string>('KEYCLOAK_REALM') || 'oumouna-khadija';

    super({
      secretOrKeyProvider: passportJwtSecret({
        cache: true,
        rateLimit: true,
        jwksRequestsPerMinute: 5,
        // Fetch des clés via le réseau interne Docker
        jwksUri: `${keycloakInternalUrl}/realms/${realm}/protocol/openid-connect/certs`,
      }),
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      // Validation de l'issuer avec l'URL publique (celle dans le token)
      issuer: `${keycloakPublicUrl}/realms/${realm}`,
      algorithms: ['RS256'],
    });
  }

  async validate(payload: any) {
    if (!payload) {
      throw new UnauthorizedException('Token invalide');
    }

    const roles: string[] = payload.realm_access?.roles || [];

    return {
      userId: payload.sub,
      username: payload.preferred_username || payload.username,
      email: payload.email,
      emailVerified: payload.email_verified === true,
      firstName: payload.given_name || '',
      lastName: payload.family_name || '',
      roles,
    };
  }
}
