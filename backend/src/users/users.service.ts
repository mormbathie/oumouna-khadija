import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  HttpException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { Role as LocalRole } from '@prisma/client';
import { AuthService } from '../auth/auth.service';
import { randomBytes } from 'node:crypto';

const APP_ROLES = ['ADMIN', 'DIRECTEUR', 'COMPTABLE', 'ENSEIGNANT', 'PARENT', 'CONTROLEUR_PRESENCE'];

@Injectable()
export class UsersService {
  private cachedToken: string | null = null;
  private tokenExpiresAt = 0;

  constructor(private readonly config: ConfigService, private readonly prisma: PrismaService, private readonly auth: AuthService) {}

  private get keycloakUrl() {
    return (
      this.config.get<string>('KEYCLOAK_INTERNAL_URL') ||
      this.config.get<string>('KEYCLOAK_AUTH_SERVER_URL') ||
      'http://localhost:8080'
    ).replace(/\/$/, '');
  }

  private get realm() {
    return this.config.get<string>('KEYCLOAK_REALM') || 'oumouna-khadija';
  }

  private async adminToken(): Promise<string> {
    if (this.cachedToken && Date.now() < this.tokenExpiresAt - 30_000) {
      return this.cachedToken;
    }

    const username = this.config.get<string>('KEYCLOAK_ADMIN_USERNAME');
    const password = this.config.get<string>('KEYCLOAK_ADMIN_PASSWORD');
    if (!username || !password) {
      throw new ServiceUnavailableException(
        'La gestion des comptes n’est pas configurée. Contactez l’administrateur.',
      );
    }

    let response: Response;
    try {
      response = await fetch(
        `${this.keycloakUrl}/realms/master/protocol/openid-connect/token`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            grant_type: 'password',
            client_id: 'admin-cli',
            username,
            password,
          }),
        },
      );
    } catch {
      throw new ServiceUnavailableException('Le service de connexion est indisponible.');
    }

    if (!response.ok) {
      throw new ServiceUnavailableException(
        'La connexion au service des comptes a échoué. Contactez l’administrateur.',
      );
    }

    const data = await response.json();
    this.cachedToken = data.access_token;
    this.tokenExpiresAt = Date.now() + Number(data.expires_in || 60) * 1000;
    return this.cachedToken!;
  }

  private async request(path: string, init: RequestInit = {}) {
    let response: Response;
    try {
      response = await fetch(`${this.keycloakUrl}/admin/realms/${this.realm}${path}`, {
        ...init,
        headers: {
          Authorization: `Bearer ${await this.adminToken()}`,
          'Content-Type': 'application/json',
          ...init.headers,
        },
      });
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new ServiceUnavailableException('Le service de connexion est indisponible.');
    }

    if (!response.ok) {
      const raw = await response.text();
      let message = 'Le service des comptes a refusé la demande.';
      try {
        const body = JSON.parse(raw);
        message = body.errorMessage || body.error || message;
      } catch {
        // Do not return raw server or proxy responses to the browser.
      }
      if (response.status === 404) throw new NotFoundException(message);
      if (response.status === 409) throw new ConflictException(message);
      if (response.status === 400) throw new BadRequestException(message);
      throw new BadGatewayException(message);
    }

    if (response.status === 204) return null;
    const body = await response.text();
    return body ? JSON.parse(body) : null;
  }

  async findAll() {
    const users = await this.request('/users?max=500');
    const managedUsers = await Promise.all(
      users.map(async (user: any) => {
        const mappings = await this.request(`/users/${encodeURIComponent(user.id)}/role-mappings/realm`);
        return this.publicUser(user, mappings);
      }),
    );
    await Promise.all(managedUsers.map((user) => this.syncLocalUser(user)));
    return managedUsers;
  }

  async create(input: {
    username: string;
    email: string;
    firstName: string;
    lastName: string;
    password?: string;
    role: string;
  }) {
    const username = input.username?.trim();
    const email = input.email?.trim();
    const roleName = input.role?.toUpperCase();
    if (!username || !email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || !input.firstName?.trim() || !input.lastName?.trim()) {
      throw new BadRequestException('Le nom d’utilisateur, l’adresse e-mail, le prénom et le nom sont obligatoires.');
    }
    if (!APP_ROLES.includes(roleName)) {
      throw new BadRequestException('Le rôle sélectionné est invalide.');
    }
    const initialPassword = input.password && input.password.length >= 8 ? input.password : randomBytes(24).toString('base64url');

    const created = await this.request('/users', {
      method: 'POST',
      body: JSON.stringify({
        username,
        email,
        firstName: input.firstName.trim(),
        lastName: input.lastName.trim(),
        enabled: true,
        emailVerified: false,
        requiredActions: ['VERIFY_EMAIL', 'UPDATE_PASSWORD'],
      }),
    });
    const user = created || (await this.request(`/users?username=${encodeURIComponent(username)}&exact=true`))?.[0];
    if (!user?.id) {
      throw new BadGatewayException('Le compte a été créé, mais son identifiant est indisponible.');
    }

    try {
      await this.request(`/users/${encodeURIComponent(user.id)}/reset-password`, {
        method: 'PUT',
        body: JSON.stringify({ type: 'password', value: initialPassword, temporary: true }),
      });
      const role = await this.ensureRealmRole(roleName);
      await this.request(`/users/${encodeURIComponent(user.id)}/role-mappings/realm`, {
        method: 'POST',
        body: JSON.stringify([role]),
      });
      const safeUser = this.publicUser(user, [role]);
      await this.syncLocalUser(safeUser);
      await this.prisma.user.updateMany({ where: { keycloakId: user.id }, data: { mustChangePassword: true } });
      await this.sendAccountActions(user.id, ['VERIFY_EMAIL', 'UPDATE_PASSWORD']);
      return { ...safeUser, invitationSent: true };
    } catch (error) {
      try {
        await this.request(`/users/${encodeURIComponent(user.id)}`, { method: 'DELETE' });
      } catch {
        // Preserve the provisioning error; Keycloak may already have removed the partial account.
      }
      throw error;
    }
  }

  private async sendAccountActions(id: string, actions: string[]) {
    const origin = (this.config.get<string>('CORS_ORIGINS') || 'http://localhost:5173').split(',')[0].trim().replace(/\/$/, '');
    const query = new URLSearchParams({ lifespan: '86400', client_id: this.config.get<string>('KEYCLOAK_CLIENT_ID') || 'oumouna-khadija-app', redirect_uri: origin + '/login' });
    await this.request(`/users/${encodeURIComponent(id)}/execute-actions-email?${query}`, { method: 'PUT', body: JSON.stringify(actions) });
  }

  async sendActivation(id: string) {
    const user = await this.request(`/users/${encodeURIComponent(id)}`);
    if (!user?.enabled || !user?.email) throw new BadRequestException('Ce compte actif doit avoir une adresse e-mail.');
    await this.sendAccountActions(id, ['VERIFY_EMAIL', 'UPDATE_PASSWORD']);
    return { sent: true };
  }

  async sendPasswordReset(id: string) {
    const user = await this.request(`/users/${encodeURIComponent(id)}`);
    if (!user?.enabled || !user?.email) throw new BadRequestException('Ce compte actif doit avoir une adresse e-mail.');
    await this.sendAccountActions(id, ['UPDATE_PASSWORD']);
    return { sent: true };
  }

  async resetPassword(id: string, password: string) {
    if (!password || password.length < 8) {
      throw new BadRequestException('Le mot de passe doit contenir au moins 8 caractères.');
    }
    await this.request(`/users/${encodeURIComponent(id)}/reset-password`, {
      method: 'PUT',
      body: JSON.stringify({ type: 'password', value: password, temporary: false }),
    });
    const user = await this.request(`/users/${encodeURIComponent(id)}`);
    if (user?.requiredActions?.includes('UPDATE_PASSWORD')) {
      await this.request(`/users/${encodeURIComponent(id)}`, {
        method: 'PUT',
        body: JSON.stringify({ id, requiredActions: user.requiredActions.filter((action: string) => action !== 'UPDATE_PASSWORD') }),
      });
    }
    await this.prisma.user.updateMany({ where: { keycloakId: id }, data: { mustChangePassword: true } });
    return { updated: true, temporary: false };
  }

  async changeOwnPassword(actor: { userId: string; username: string }, currentPassword: string, newPassword: string, totp?: string) {
    if (!actor?.userId || !actor?.username) throw new BadRequestException('Utilisateur invalide.');
    if (!currentPassword || !newPassword || newPassword.length < 8) {
      throw new BadRequestException('Le mot de passe actuel et un nouveau mot de passe de 8 caractères minimum sont obligatoires.');
    }
    if (currentPassword === newPassword) throw new BadRequestException('Choisissez un nouveau mot de passe différent.');
    await this.auth.directLogin(actor.username, currentPassword, totp);
    await this.request(`/users/${encodeURIComponent(actor.userId)}/reset-password`, {
      method: 'PUT',
      body: JSON.stringify({ type: 'password', value: newPassword, temporary: false }),
    });
    await this.prisma.user.updateMany({ where: { keycloakId: actor.userId }, data: { mustChangePassword: false } });
    return { updated: true };
  }

  async getOwnProfile(actor: { userId: string }) {
    if (!actor?.userId) throw new BadRequestException('Utilisateur invalide.');
    const user = await this.request(`/users/${encodeURIComponent(actor.userId)}`);
    const local = await this.prisma.user.findUnique({ where: { keycloakId: actor.userId }, select: { phone: true } });
    return {
      id: user.id,
      username: user.username,
      email: user.email || '',
      emailVerified: Boolean(user.emailVerified),
      firstName: user.firstName || '',
      lastName: user.lastName || '',
      phone: local?.phone || '',
    };
  }

  async updateOwnProfile(actor: { userId: string }, input: { firstName: string; lastName: string; email: string; phone?: string }) {
    if (!actor?.userId) throw new BadRequestException('Utilisateur invalide.');
    const firstName = input?.firstName?.trim();
    const lastName = input?.lastName?.trim();
    const email = input?.email?.trim().toLowerCase();
    const phone = input?.phone?.trim() || null;
    if (!firstName || !lastName || !email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      throw new BadRequestException('Prénom, nom et adresse e-mail valides sont obligatoires.');
    }
    if (phone && (phone.length > 30 || !/^[+\d\s().-]+$/.test(phone))) {
      throw new BadRequestException('Numéro de téléphone invalide.');
    }
    const duplicate = await this.prisma.user.findFirst({ where: { email, keycloakId: { not: actor.userId } }, select: { id: true } });
    if (duplicate) throw new ConflictException('Cette adresse e-mail est déjà utilisée.');
    const current = await this.request(`/users/${encodeURIComponent(actor.userId)}`);
    const emailChanged = current.email?.toLowerCase() !== email;
    await this.request(`/users/${encodeURIComponent(actor.userId)}`, {
      method: 'PUT',
      body: JSON.stringify({ id: actor.userId, firstName, lastName, email, emailVerified: emailChanged ? false : Boolean(current.emailVerified) }),
    });
    await this.prisma.user.updateMany({ where: { keycloakId: actor.userId }, data: { firstName, lastName, email, phone } });
    return this.getOwnProfile(actor);
  }

  async requestOwnEmailVerification(actor: { userId: string }) {
    const profile = await this.getOwnProfile(actor);
    if (profile.emailVerified) return { sent: false, verified: true };
    await this.request(`/users/${encodeURIComponent(actor.userId)}/send-verify-email`, { method: 'PUT' });
    return { sent: true, verified: false };
  }

  async update(id: string, input: { email: string; firstName: string; lastName: string; role: string }, actorId: string) {
    const email = input.email?.trim().toLowerCase();
    const firstName = input.firstName?.trim();
    const lastName = input.lastName?.trim();
    const roleName = input.role?.toUpperCase();
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || !firstName || !lastName) {
      throw new BadRequestException('Adresse e-mail, prénom et nom valides sont obligatoires.');
    }
    if (!APP_ROLES.includes(roleName)) throw new BadRequestException('Rôle invalide.');
    if (id === actorId && roleName !== 'ADMIN') {
      throw new ConflictException('Vous ne pouvez pas retirer votre propre rôle administrateur.');
    }

    const user = await this.request(`/users/${encodeURIComponent(id)}`);
    await this.request(`/users/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify({ id, email, firstName, lastName, emailVerified: user.email?.toLowerCase() === email ? Boolean(user.emailVerified) : false }),
    });
    const mappings: any[] = await this.request(`/users/${encodeURIComponent(id)}/role-mappings/realm`);
    const oldAppRoles = mappings.filter((role) => APP_ROLES.includes(role.name) && role.name !== roleName);
    if (oldAppRoles.length) {
      await this.request(`/users/${encodeURIComponent(id)}/role-mappings/realm`, {
        method: 'DELETE',
        body: JSON.stringify(oldAppRoles),
      });
    }
    if (!mappings.some((role) => role.name === roleName)) {
      const role = await this.ensureRealmRole(roleName);
      await this.request(`/users/${encodeURIComponent(id)}/role-mappings/realm`, {
        method: 'POST',
        body: JSON.stringify([role]),
      });
    }
    const safeUser = this.publicUser({ ...user, email, firstName, lastName }, [{ name: roleName }]);
    await this.syncLocalUser(safeUser);
    return safeUser;
  }

  private async ensureRealmRole(roleName: string) {
    const path = `/roles/${encodeURIComponent(roleName)}`;
    try {
      return await this.request(path);
    } catch (error) {
      if (!(error instanceof NotFoundException)) throw error;
    }

    try {
      await this.request('/roles', {
        method: 'POST',
        body: JSON.stringify({
          name: roleName,
          description: roleName === 'CONTROLEUR_PRESENCE'
            ? 'Contrôle des présences par scan des QR codes'
            : roleName,
        }),
      });
    } catch (error) {
      if (!(error instanceof ConflictException)) throw error;
    }
    return this.request(path);
  }

  async setEnabled(id: string, enabled: boolean, actorId: string) {
    if (id === actorId && !enabled) {
      throw new ConflictException('Vous ne pouvez pas désactiver votre propre compte.');
    }
    const user = await this.request(`/users/${encodeURIComponent(id)}`);
    await this.request(`/users/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify({ id, enabled }),
    });
    return { id, enabled, username: user.username };
  }

  async remove(id: string, actorId: string) {
    if (id === actorId) {
      throw new ConflictException('Vous ne pouvez pas supprimer votre propre compte.');
    }
    await this.request(`/users/${encodeURIComponent(id)}`, { method: 'DELETE' });
    const localUser = await this.prisma.user.findUnique({ where: { keycloakId: id }, select: { id: true } });
    if (localUser) {
      await this.prisma.$transaction([
        this.prisma.classroom.updateMany({ where: { teacherId: localUser.id }, data: { teacherId: null } }),
        this.prisma.user.delete({ where: { id: localUser.id } }),
      ]);
    }
    return { id, deleted: true };
  }

  async syncLocalUser(user: { id: string; username: string; email: string; firstName: string; lastName: string; roles: string[] }) {
    if (!user.id || !user.email || !user.username) return;
    const roleName = ['ADMIN', 'DIRECTEUR', 'COMPTABLE', 'ENSEIGNANT', 'PARENT', 'CONTROLEUR_PRESENCE']
      .find((candidate) => user.roles.includes(candidate)) || 'ENSEIGNANT';
    const data = {
      keycloakId: user.id,
      username: user.username,
      email: user.email.toLowerCase(),
      firstName: user.firstName || user.username,
      lastName: user.lastName || '',
      role: roleName as LocalRole,
    };
    const existing = await this.prisma.user.findFirst({
      where: { OR: [{ keycloakId: user.id }, { email: data.email }, { username: data.username }] },
    });
    if (existing) {
      return this.prisma.user.update({ where: { id: existing.id }, data });
    }
    return this.prisma.user.create({ data });
  }

  private publicUser(user: any, roleMappings: any[] = []) {
    const roles = roleMappings
      .map((role) => role.name)
      .filter((role: string) => APP_ROLES.includes(role));
    return {
      id: user.id,
      username: user.username,
      email: user.email || '',
      firstName: user.firstName || '',
      lastName: user.lastName || '',
      enabled: Boolean(user.enabled),
      emailVerified: Boolean(user.emailVerified),
      roles,
    };
  }
}
