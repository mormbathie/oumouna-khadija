import { BadRequestException, ForbiddenException, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AccountSecurityService {
  private readonly logger = new Logger(AccountSecurityService.name);
  private readonly limits = new Map<string, { count: number; expires: number }>();
  constructor(private readonly config: ConfigService) {}

  private async request(path: string, body?: unknown) {
    const base = (this.config.get<string>('KEYCLOAK_INTERNAL_URL') || this.config.get<string>('KEYCLOAK_AUTH_SERVER_URL') || 'http://localhost:8080').replace(/\/$/, '');
    const tokenResponse = await fetch(base + '/realms/master/protocol/openid-connect/token', {
      signal: AbortSignal.timeout(15000), method: 'POST', body: new URLSearchParams({ grant_type: 'password', client_id: 'admin-cli',
        username: this.config.get<string>('KEYCLOAK_ADMIN_USERNAME') || '',
        password: this.config.get<string>('KEYCLOAK_ADMIN_PASSWORD') || '' }),
    });
    if (!tokenResponse.ok) throw new ServiceUnavailableException('Service de sécurité indisponible.');
    const token = (await tokenResponse.json()).access_token;
    const realm = this.config.get<string>('KEYCLOAK_REALM') || 'oumouna-khadija';
    const response = await fetch(`${base}/admin/realms/${encodeURIComponent(realm)}${path}`, {
      signal: AbortSignal.timeout(15000), method: body === undefined ? 'GET' : 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!response.ok) throw new ServiceUnavailableException('Impossible de réaliser cette opération.');
    return response.status === 204 ? undefined : response.json();
  }

  async smtpSettings(): Promise<Record<string, string>> {
    return (await this.request('')).smtpServer || {};
  }

  private throttle(key: string, maximum: number) {
    const now = Date.now();
    for (const [k, value] of this.limits) if (value.expires <= now) this.limits.delete(k);
    const entry = this.limits.get(key) || { count: 0, expires: now + 15 * 60_000 };
    if (entry.count >= maximum || (!this.limits.has(key) && this.limits.size >= 20000)) return false;
    entry.count++;
    this.limits.set(key, entry);
    return true;
  }

  private async sendActions(id: string, actions: string[]) {
    const origin = (this.config.get<string>('CORS_ORIGINS') || 'http://localhost:5173').split(',')[0].trim();
    const query = new URLSearchParams({ lifespan: '900', client_id: this.config.get<string>('KEYCLOAK_CLIENT_ID') || 'oumouna-khadija-app', redirect_uri: origin.replace(/\/$/, '') + '/login' });
    await this.request(`/users/${encodeURIComponent(id)}/execute-actions-email?${query}`, actions);
  }

  async forgotPassword(email: unknown, ip: string) {
    const reply = { message: 'Si cette adresse correspond à un compte actif, un lien de réinitialisation vous sera envoyé.' };
    if (typeof email !== 'string' || email.length > 254 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new BadRequestException('Adresse e-mail invalide.');
    const address = email.trim().toLowerCase();
    if (!this.throttle('ip:' + ip, 5) || !this.throttle('email:' + address, 2)) return reply;
    try {
      const users = await this.request(`/users?email=${encodeURIComponent(address)}&exact=true&max=2`);
      const user = users?.find((item: any) => item.enabled && item.email?.toLowerCase() === address);
      if (user) await this.sendActions(user.id, ['UPDATE_PASSWORD']);
    } catch {
      // Keep the public response identical, without exposing whether the account exists.
      this.logger.warn('Password recovery request could not be processed.');
    }
    return reply;
  }

  async status(id: string) {
    const credentials = await this.request(`/users/${encodeURIComponent(id)}/credentials`);
    return { enabled: credentials.some((item: any) => item.type === 'otp') };
  }

  async enroll(id: string) {
    const user = await this.request(`/users/${encodeURIComponent(id)}`);
    if (!user.emailVerified) throw new ForbiddenException('Vérifiez votre adresse e-mail avant d’activer la double authentification.');
    if ((await this.status(id)).enabled) return { enabled: true, sent: false };
    if (!this.throttle('enroll:' + id, 2)) throw new BadRequestException('Veuillez patienter avant de demander un nouveau lien.');
    await this.sendActions(id, ['CONFIGURE_TOTP']);
    return { enabled: false, sent: true };
  }
}
