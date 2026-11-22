import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { PrismaService } from '../database/prisma.service';

const MANAGING_PARTNER_EMAIL = 'ligbakelo@yahoo.fr';
const GMAIL_SEND_SCOPE = 'https://www.googleapis.com/auth/gmail.send';

type GmailAttachment = { filename: string; contentType: string; data: Buffer };

function base64Lines(value: Buffer | string) {
  return Buffer.from(value).toString('base64').replace(/.{1,76}/g, '$&\r\n').trim();
}

function encryptionKey() {
  const value = process.env.EMAIL_TOKEN_ENCRYPTION_KEY?.trim();
  if (!value) throw new ServiceUnavailableException('La clé de chiffrement e-mail n’est pas configurée sur le serveur.');
  const key = /^[a-f0-9]{64}$/i.test(value) ? Buffer.from(value, 'hex') : Buffer.from(value, 'base64');
  if (key.length !== 32) throw new ServiceUnavailableException('EMAIL_TOKEN_ENCRYPTION_KEY doit représenter 32 octets (base64 ou 64 caractères hexadécimaux).');
  return key;
}

@Injectable()
export class MailSettingsService {
  constructor(private readonly prisma: PrismaService) {}

  private config() {
    const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID?.trim();
    const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim();
    const callbackUrl = process.env.GOOGLE_OAUTH_CALLBACK_URL?.trim();
    const webUrl = process.env.APP_WEB_URL?.trim() || process.env.FRONTEND_ORIGIN?.split(',')[0]?.trim();
    return { clientId, clientSecret, callbackUrl, webUrl };
  }

  status(companyId: string) {
    const config = this.config();
    return this.prisma.companyEmailIntegration.findUnique({
      where: { companyId },
      select: { email: true, connectedAt: true },
    }).then((integration) => ({
      configured: Boolean(config.clientId && config.clientSecret && config.callbackUrl && config.webUrl && process.env.EMAIL_TOKEN_ENCRYPTION_KEY),
      connected: Boolean(integration),
      email: integration?.email ?? null,
      connectedAt: integration?.connectedAt ?? null,
      recipient: MANAGING_PARTNER_EMAIL,
    }));
  }

  async connectUrl(companyId: string, userId: string) {
    const { clientId, clientSecret, callbackUrl, webUrl } = this.config();
    if (!clientId || !clientSecret || !callbackUrl || !webUrl) throw new ServiceUnavailableException('La connexion Google n’est pas encore configurée sur le serveur.');
    encryptionKey();
    const state = randomBytes(32).toString('hex');
    await this.prisma.mailOAuthState.create({
      data: { id: state, companyId, userId, expiresAt: new Date(Date.now() + 10 * 60_000) },
    });
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: callbackUrl,
      response_type: 'code',
      scope: `openid email ${GMAIL_SEND_SCOPE}`,
      access_type: 'offline',
      prompt: 'consent',
      include_granted_scopes: 'true',
      state,
    });
    return { authorizationUrl: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}` };
  }

  async completeAuthorization(code: string, state: string) {
    const config = this.config();
    const stateRow = await this.prisma.mailOAuthState.findUnique({ where: { id: state } });
    if (!stateRow) throw new BadRequestException('Cette demande de connexion Google a déjà été utilisée ou a expiré.');
    await this.prisma.mailOAuthState.delete({ where: { id: state } });
    if (stateRow.expiresAt.getTime() < Date.now()) throw new BadRequestException('La demande de connexion Google a expiré. Recommencez depuis les paramètres.');
    const platformAdmin = await this.prisma.user.findFirst({
      where: { id: stateRow.userId, isActive: true, isPlatformAdmin: true },
      select: { id: true },
    });
    const activeAdmin = platformAdmin ?? await this.prisma.companyMembership.findFirst({
      where: {
        companyId: stateRow.companyId,
        userId: stateRow.userId,
        role: 'COMPANY_ADMIN',
        user: { isActive: true },
      },
      select: { id: true },
    });
    if (!activeAdmin) throw new BadRequestException('L’utilisateur n’a plus le droit de connecter le compte e-mail de cette société.');
    if (!config.clientId || !config.clientSecret || !config.callbackUrl || !config.webUrl) throw new ServiceUnavailableException('La connexion Google n’est pas configurée sur le serveur.');
    encryptionKey();

    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: config.clientId,
        client_secret: config.clientSecret,
        redirect_uri: config.callbackUrl,
        grant_type: 'authorization_code',
      }),
    });
    const token = await tokenResponse.json().catch(() => ({})) as { access_token?: string; refresh_token?: string; error?: string };
    if (!tokenResponse.ok || !token.access_token) throw new BadRequestException('Google n’a pas validé la connexion. Recommencez l’autorisation depuis les paramètres.');

    const profileResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${token.access_token}` },
    });
    const profile = await profileResponse.json().catch(() => ({})) as { email?: string; verified_email?: boolean };
    if (!profileResponse.ok || !profile.email || profile.verified_email === false) throw new BadRequestException('Google n’a pas fourni une adresse e-mail vérifiée.');

    const previous = await this.prisma.companyEmailIntegration.findUnique({ where: { companyId: stateRow.companyId } });
    const refreshToken = token.refresh_token ?? (previous?.email.toLowerCase() === profile.email.toLowerCase() ? this.decrypt(previous.encryptedRefreshToken) : null);
    if (!refreshToken) throw new BadRequestException('Google n’a pas renvoyé de jeton de renouvellement. Révoquez l’accès de l’application dans Google puis reconnectez le compte.');
    await this.prisma.companyEmailIntegration.upsert({
      where: { companyId: stateRow.companyId },
      create: { companyId: stateRow.companyId, email: profile.email, encryptedRefreshToken: this.encrypt(refreshToken) },
      update: { email: profile.email, encryptedRefreshToken: this.encrypt(refreshToken), connectedAt: new Date() },
    });
    try {
      await this.prisma.auditLog.create({
        data: { companyId: stateRow.companyId, userId: stateRow.userId, action: 'MAIL_GOOGLE_CONNECTED', details: { email: profile.email, scope: GMAIL_SEND_SCOPE } },
      });
    } catch {
      // A temporary audit-log outage must not undo a completed Gmail connection.
    }
    return { webUrl: config.webUrl };
  }

  async cancelAuthorization(state?: string) {
    if (state) await this.prisma.mailOAuthState.deleteMany({ where: { id: state } });
  }

  async disconnect(companyId: string, userId: string) {
    const integration = await this.prisma.companyEmailIntegration.findUnique({ where: { companyId }, select: { email: true } });
    await this.prisma.companyEmailIntegration.deleteMany({ where: { companyId } });
    await this.prisma.mailOAuthState.deleteMany({ where: { companyId } });
    if (integration) {
      try {
        await this.prisma.auditLog.create({
          data: { companyId, userId, action: 'MAIL_GOOGLE_DISCONNECTED', details: { email: integration.email } },
        });
      } catch {
        // A temporary audit-log outage must not hide the completed disconnection.
      }
    }
    return { disconnected: true };
  }

  async sendTest(companyId: string) {
    await this.send(companyId, {
      to: MANAGING_PARTNER_EMAIL,
      subject: 'Test de connexion e-mail · Facture Client',
      text: 'Bonjour Monsieur l’Associé-Gérant,\n\nCeci est un test de la connexion Gmail configurée dans Facture Client. Les notifications des ordres de paiement pourront être envoyées lorsque cette connexion est active.\n\nCordialement,\nFacture Client',
      senderName: 'Facture Client',
      attachments: [],
    });
    return { sent: true, recipient: MANAGING_PARTNER_EMAIL };
  }

  async isConnected(companyId: string) {
    return Boolean(await this.prisma.companyEmailIntegration.findUnique({ where: { companyId }, select: { id: true } }));
  }

  async send(companyId: string, input: { to: string; subject: string; text: string; senderName: string; attachments: GmailAttachment[] }) {
    const integration = await this.prisma.companyEmailIntegration.findUnique({ where: { companyId } });
    if (!integration) throw new ServiceUnavailableException('Aucun compte Gmail n’est connecté pour cette société.');
    const { clientId, clientSecret } = this.config();
    if (!clientId || !clientSecret) throw new ServiceUnavailableException('La connexion Google n’est pas configurée sur le serveur.');

    const refresh = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: this.decrypt(integration.encryptedRefreshToken),
        grant_type: 'refresh_token',
      }),
    });
    const refreshed = await refresh.json().catch(() => ({})) as { access_token?: string };
    if (!refresh.ok || !refreshed.access_token) throw new ServiceUnavailableException('Google a refusé le renouvellement de l’autorisation Gmail. Reconnectez le compte depuis les paramètres.');

    const boundary = `facture-client-${randomBytes(18).toString('hex')}`;
    const subject = `=?UTF-8?B?${Buffer.from(input.subject).toString('base64')}?=`;
    const fromName = `=?UTF-8?B?${Buffer.from(input.senderName).toString('base64')}?=`;
    const sections = [
      `From: ${fromName} <${integration.email}>`,
      `To: ${input.to}`,
      `Subject: ${subject}`,
      'MIME-Version: 1.0',
      `Content-Type: multipart/mixed; boundary="${boundary}"`,
      '',
      `--${boundary}`,
      'Content-Type: text/plain; charset="UTF-8"',
      'Content-Transfer-Encoding: base64',
      '',
      base64Lines(input.text),
    ];
    for (const attachment of input.attachments) {
      const filename = encodeURIComponent(attachment.filename).replace(/'/g, '%27');
      sections.push(
        `--${boundary}`,
        `Content-Type: ${attachment.contentType}; name*=UTF-8''${filename}`,
        `Content-Disposition: attachment; filename*=UTF-8''${filename}`,
        'Content-Transfer-Encoding: base64',
        '',
        base64Lines(attachment.data),
      );
    }
    sections.push(`--${boundary}--`, '');
    const raw = Buffer.from(sections.join('\r\n')).toString('base64url');
    const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST',
      headers: { Authorization: `Bearer ${refreshed.access_token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ raw }),
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new ServiceUnavailableException(`Échec de l’envoi Gmail (HTTP ${response.status})${detail ? ` : ${detail.slice(0, 300)}` : ''}`);
    }
  }

  private encrypt(value: string) {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
    const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    return `${iv.toString('hex')}.${cipher.getAuthTag().toString('hex')}.${encrypted.toString('hex')}`;
  }

  private decrypt(value: string) {
    const [ivHex, tagHex, encryptedHex] = value.split('.');
    if (!ivHex || !tagHex || !encryptedHex) throw new ServiceUnavailableException('Le jeton Gmail enregistré est invalide. Reconnectez le compte.');
    try {
      const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(ivHex, 'hex'));
      decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
      return Buffer.concat([decipher.update(Buffer.from(encryptedHex, 'hex')), decipher.final()]).toString('utf8');
    } catch {
      throw new ServiceUnavailableException('Impossible de déchiffrer le jeton Gmail. Vérifiez la clé de chiffrement configurée sur Render.');
    }
  }
}
