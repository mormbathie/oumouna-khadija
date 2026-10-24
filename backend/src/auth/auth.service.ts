import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuthService {
  constructor(
    private configService: ConfigService,
    private prisma: PrismaService,
  ) {}

  private get tokenUrl() {
    const keycloakUrl = this.configService.get<string>('KEYCLOAK_INTERNAL_URL') ||
      this.configService.get<string>('KEYCLOAK_AUTH_SERVER_URL') || 'http://localhost:8080';
    const realm = this.configService.get<string>('KEYCLOAK_REALM') || 'oumouna-khadija';
    return `${keycloakUrl}/realms/${realm}/protocol/openid-connect/token`;
  }

  private get clientId() {
    return this.configService.get<string>('KEYCLOAK_CLIENT_ID') || 'oumouna-khadija-app';
  }

  private async exchangeToken(params: Record<string, string>) {
    const response = await fetch(this.tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: this.clientId, ...params }),
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const description = String(errorData.error_description || 'Identifiants invalides');
      if (/account is not fully set up/i.test(description)) {
        throw new ForbiddenException({ code: 'PASSWORD_UPDATE_REQUIRED', message: 'Votre compte nécessite une mise à jour. Contactez un administrateur pour réinitialiser le mot de passe.' });
      }
      throw new UnauthorizedException('Identifiant, mot de passe ou code de vérification incorrect.');
    }
    return response.json();
  }

  async directLogin(username: string, password: string, totp?: string) {
    try {
      const tokenData = await this.exchangeToken({ grant_type: 'password', username, password, ...(totp ? { totp } : {}) });

      // Find or sync local user in db
      const localUser = await this.prisma.user.findFirst({ where: { username } });

      return {
        ...tokenData,
        user: localUser || { username },
      };
    } catch (err: any) {
      if (err instanceof UnauthorizedException || err instanceof ForbiddenException) throw err;
      throw new UnauthorizedException('Le service de connexion est indisponible. Réessayez plus tard.');
    }
  }

  async refresh(refreshToken: string) {
    if (!refreshToken) throw new UnauthorizedException('Session expirée. Reconnectez-vous.');
    try {
      return await this.exchangeToken({ grant_type: 'refresh_token', refresh_token: refreshToken });
    } catch (error) {
      if (error instanceof UnauthorizedException) throw error;
      throw new UnauthorizedException('Impossible de renouveler la session.');
    }
  }

  async logout(refreshToken?: string) {
    if (!refreshToken) return;
    const response = await fetch(this.tokenUrl.replace(/\/token$/, '/logout'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: this.clientId, refresh_token: refreshToken }),
    });
    if (!response.ok) throw new UnauthorizedException('La déconnexion a échoué.');
  }

  async getProfile(user: any) {
    const localUser = await this.prisma.user.findFirst({
      where: {
        OR: [
          { username: user.username },
          { email: user.email },
        ],
      },
    });

    const rolePriority = ['ADMIN', 'DIRECTEUR', 'COMPTABLE', 'ENSEIGNANT', 'PARENT', 'CONTROLEUR_PRESENCE'];
    const appRole = rolePriority.find((role) => (user.roles || []).includes(role));
    let syncedUser = localUser;
    if (user.userId && user.email && user.username && appRole) {
      const role = appRole as any;
      const localData = {
        keycloakId: user.userId,
        email: user.email.toLowerCase(),
        username: user.username,
        firstName: user.firstName || user.username,
        lastName: user.lastName || '',
        role,
      };
      const existing = await this.prisma.user.findFirst({
        where: { OR: [{ keycloakId: user.userId }, { email: localData.email }, { username: user.username }] },
      });
      syncedUser = existing
        ? await this.prisma.user.update({ where: { id: existing.id }, data: existing.keycloakId === user.userId ? { keycloakId: user.userId, username: user.username, role } : localData })
        : await this.prisma.user.create({ data: localData });
    }

    return {
      ...user,
      mustChangePassword: Boolean(syncedUser?.mustChangePassword),
      localProfile: syncedUser,
    };
  }
}
