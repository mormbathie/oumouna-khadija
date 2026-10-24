import { readFile } from 'node:fs/promises';
import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AccountSecurityService } from '../auth/account-security.service';
import * as nodemailer from 'nodemailer';

@Injectable()
export class SchoolMailService {
  constructor(private readonly security: AccountSecurityService, private readonly config: ConfigService) {}
  async send(to: string, subject: string, text: string) {
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to) || to.length > 254) throw new ServiceUnavailableException('Adresse du destinataire invalide.');
    const path = this.config.get<string>('SCHOOL_SMTP_CONFIG_FILE');
    const smtp: Record<string,string> = path ? JSON.parse(await readFile(path, 'utf8')) : await this.security.smtpSettings();
    const secure = smtp.ssl === 'true';
    if (!smtp.host || !smtp.from || !smtp.password || /^\*+$/.test(smtp.password)) throw new ServiceUnavailableException('Service e-mail non configuré.');
    const transport = nodemailer.createTransport({ host: smtp.host, port: Number(smtp.port) || (secure ? 465 : 587), secure,
      requireTLS: !secure, auth: { user: smtp.user, pass: smtp.password },
      connectionTimeout: 15000, greetingTimeout: 15000, socketTimeout: 20000,
      tls: { rejectUnauthorized: true }, logger: false, debug: false,
    });
    try {
      const result = await transport.sendMail({ from: { name: smtp.fromDisplayName || 'Institut Oumouna Khadija', address: smtp.from }, to, subject, text });
      if (!result.accepted.length) throw new ServiceUnavailableException('Message non accepté.');
      return { accepted: true };
    } finally { transport.close(); }
  }
}
