import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../config/prisma.service';

@Injectable()
export class WhatsappNotifyService {
  private readonly logger = new Logger(WhatsappNotifyService.name);

  constructor(private prisma: PrismaService) {}

  /** Read credential from DB first, fall back to env var. */
  private async getCredential(dbKey: string, envKey: string): Promise<string | undefined> {
    try {
      const row = await this.prisma.systemSetting.findUnique({ where: { settingKey: dbKey } });
      if (row?.settingValue?.trim()) return row.settingValue.trim();
    } catch { /* ignore DB errors — fall back to env */ }
    return process.env[envKey];
  }

  private async getPhoneNumberId(): Promise<string | undefined> {
    return this.getCredential('WHATSAPP_PHONE_NUMBER_ID', 'WHATSAPP_PHONE_NUMBER_ID');
  }

  private async getAccessToken(): Promise<string | undefined> {
    return this.getCredential('WHATSAPP_ACCESS_TOKEN', 'WHATSAPP_ACCESS_TOKEN');
  }

  /** Save WhatsApp credentials to SystemSetting table. */
  async saveCredentials(phoneNumberId: string, accessToken: string): Promise<void> {
    await Promise.all([
      this.prisma.systemSetting.upsert({
        where: { settingKey: 'WHATSAPP_PHONE_NUMBER_ID' },
        update: { settingValue: phoneNumberId },
        create: { settingKey: 'WHATSAPP_PHONE_NUMBER_ID', settingValue: phoneNumberId, dataType: 'string', description: 'Meta WhatsApp Business Phone Number ID' },
      }),
      this.prisma.systemSetting.upsert({
        where: { settingKey: 'WHATSAPP_ACCESS_TOKEN' },
        update: { settingValue: accessToken },
        create: { settingKey: 'WHATSAPP_ACCESS_TOKEN', settingValue: accessToken, dataType: 'string', description: 'Meta WhatsApp Business Access Token' },
      }),
    ]);
  }

  /** Get current config (token is masked). */
  async getConfig(): Promise<{ phoneNumberId: string | null; hasToken: boolean; configured: boolean }> {
    const phoneNumberId = await this.getPhoneNumberId();
    const token = await this.getAccessToken();
    return {
      phoneNumberId: phoneNumberId ?? null,
      hasToken: Boolean(token),
      configured: Boolean(phoneNumberId && token),
    };
  }

  /** Normalize any Egyptian/international phone to WhatsApp format (no +, no 00). */
  private normalizePhone(raw: string): string | null {
    let p = raw.replace(/\s+/g, '').replace(/-/g, '');
    if (p.startsWith('00')) p = p.slice(2);
    if (p.startsWith('+')) p = p.slice(1);
    // Egyptian local number → add country code
    if (p.startsWith('01') && p.length === 11) p = '2' + p;
    // Must be digits only and reasonable length
    if (!/^\d{10,15}$/.test(p)) return null;
    return p;
  }

  /**
   * Upload an image file to Meta's WhatsApp media API once.
   * Returns a media_id that can be reused for multiple messages in the same session.
   */
  async uploadMedia(buffer: Buffer, mimeType: string): Promise<string | null> {
    const [pid, token] = await Promise.all([this.getPhoneNumberId(), this.getAccessToken()]);
    if (!pid || !token) { this.logger.warn('WhatsApp not configured'); return null; }
    const url = `https://graph.facebook.com/v21.0/${pid}/media`;
    try {
      const form = new (globalThis.FormData)();
      form.append('messaging_product', 'whatsapp');
      form.append('type', mimeType);
      form.append('file', new (globalThis.Blob)([buffer as unknown as ArrayBuffer], { type: mimeType }), 'image.jpg');
      const res = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form as any });
      const data = await res.json() as any;
      if (!res.ok || data?.error) { this.logger.error(`WhatsApp media upload failed: ${data?.error?.message ?? res.statusText}`); return null; }
      this.logger.log(`WhatsApp media uploaded: ${data.id}`);
      return String(data.id);
    } catch (err: any) { this.logger.error(`WhatsApp media upload error: ${err?.message}`); return null; }
  }

  async sendImage(phone: string, mediaId: string, caption?: string): Promise<boolean> {
    const [pid, token] = await Promise.all([this.getPhoneNumberId(), this.getAccessToken()]);
    if (!pid || !token) return false;
    const to = this.normalizePhone(phone);
    if (!to) return false;
    try {
      const res = await fetch(`https://graph.facebook.com/v21.0/${pid}/messages`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ messaging_product: 'whatsapp', to, type: 'image', image: { id: mediaId, ...(caption ? { caption } : {}) } }),
      });
      const data = await res.json() as any;
      if (!res.ok || data?.error) { this.logger.error(`WhatsApp image send failed for ${to}: ${data?.error?.message}`); return false; }
      return true;
    } catch (err: any) { this.logger.error(`WhatsApp image send error: ${err?.message}`); return false; }
  }

  async sendText(phone: string, body: string): Promise<boolean> {
    const [pid, token] = await Promise.all([this.getPhoneNumberId(), this.getAccessToken()]);
    if (!pid || !token) { this.logger.warn('WhatsApp not configured'); return false; }
    const to = this.normalizePhone(phone);
    if (!to) { this.logger.warn(`Invalid phone "${phone}"`); return false; }
    try {
      const res = await fetch(`https://graph.facebook.com/v21.0/${pid}/messages`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ messaging_product: 'whatsapp', to, type: 'text', text: { body } }),
      });
      const data = await res.json() as any;
      if (!res.ok || data?.error) { this.logger.error(`WhatsApp send failed for ${to}: ${data?.error?.message}`); return false; }
      this.logger.log(`WhatsApp sent to ${to}`);
      return true;
    } catch (err: any) { this.logger.error(`WhatsApp send error: ${err?.message}`); return false; }
  }

  async sendLeadAssignmentAlert(phone: string | null | undefined, firstName: string, leadCount: number): Promise<void> {
    if (!phone) return;
    const body = leadCount === 1
      ? `مرحباً ${firstName}،\nتم تعيين ليد جديد لك في نظام SIRA CRM.\nافتح التطبيق الآن لمتابعة الليد.`
      : `مرحباً ${firstName}،\nتم تعيين ${leadCount} ليدز جديدة لك في نظام SIRA CRM.\nافتح التطبيق الآن لمتابعتهم.`;
    await this.sendText(phone, body);
  }

  async sendLeadTransferredAlert(phone: string | null | undefined, firstName: string, leadCount: number): Promise<void> {
    if (!phone) { this.logger.warn(`sendLeadTransferredAlert: no phone for user "${firstName}"`); return; }
    this.logger.log(`sendLeadTransferredAlert → phone="${phone}" user="${firstName}" count=${leadCount}`);
    const body = leadCount === 1
      ? `مرحباً ${firstName}،\nتم تحويل ليد منك إلى مندوب آخر في نظام SIRA CRM.`
      : `مرحباً ${firstName}،\nتم تحويل ${leadCount} ليدز منك إلى مندوب آخر في نظام SIRA CRM.`;
    await this.sendText(phone, body);
  }

  async sendLeadRetractedAlert(phone: string | null | undefined, firstName: string, leadCount: number): Promise<void> {
    if (!phone) { this.logger.warn(`sendLeadRetractedAlert: no phone for user "${firstName}"`); return; }
    this.logger.log(`sendLeadRetractedAlert → phone="${phone}" user="${firstName}" count=${leadCount}`);
    const body = leadCount === 1
      ? `مرحباً ${firstName}،\nتم سحب ليد منك في نظام SIRA CRM.`
      : `مرحباً ${firstName}،\nتم سحب ${leadCount} ليدز منك في نظام SIRA CRM.`;
    await this.sendText(phone, body);
  }
}
