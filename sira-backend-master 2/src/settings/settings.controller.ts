import { Controller, Get, Post, Body, Patch, Param, Delete, BadRequestException, UseGuards, Request } from '@nestjs/common';
import { SettingsService } from './settings.service';
import { CreateSettingDto } from './dto/create-setting.dto';
import { UpdateSettingDto } from './dto/update-setting.dto';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { WhatsappNotifyService } from '../whatsapp-notify/whatsapp-notify.service';

@ApiTags('Settings')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('settings')
export class SettingsController {
  constructor(
    private readonly settingsService: SettingsService,
    private readonly whatsappNotify: WhatsappNotifyService,
  ) { }

  // ── WhatsApp Gateway ──────────────────────────────────────────────────────

  @Get('whatsapp/config')
  @ApiOperation({ summary: 'Get WhatsApp gateway config (token masked)' })
  getWhatsappConfig() {
    return this.whatsappNotify.getConfig();
  }

  @Post('whatsapp/config')
  @ApiOperation({ summary: 'Save WhatsApp gateway credentials (super_admin only)' })
  async saveWhatsappConfig(
    @Body() body: { phoneNumberId: string; accessToken: string },
    @Request() req: any,
  ) {
    if (req.user?.role !== 'super_admin') throw new BadRequestException('Only super_admin can update WhatsApp config');
    await this.whatsappNotify.saveCredentials(body.phoneNumberId.trim(), body.accessToken.trim());
    return { success: true };
  }

  @Post('whatsapp/test')
  @ApiOperation({ summary: 'Send a test WhatsApp message to verify gateway' })
  async testWhatsapp(
    @Body() body: { phone: string; message?: string },
    @Request() req: any,
  ) {
    if (req.user?.role !== 'super_admin') throw new BadRequestException('Only super_admin can test WhatsApp');
    const msg = body.message?.trim() || 'مرحباً! هذه رسالة اختبار من نظام SIRA CRM. البوابة تعمل بنجاح ✅';
    const sent = await this.whatsappNotify.sendText(body.phone, msg);
    return { success: sent };
  }

  /**
   * Ensures `:id` is a positive integer. Prevents `/settings/key` matching `:id` with value `key`
   * (Number NaN / bad Prisma where) and any other non-numeric segment from reaching Prisma.
   */
  private parseNumericSettingIdParam(param: unknown): number {
    const raw = String(param ?? '').trim();
    if (!raw) {
      throw new BadRequestException('Missing setting id');
    }
    if (raw === 'key' || raw.toLowerCase() === 'key') {
      throw new BadRequestException(
        'Use GET /settings/key/:key with the actual setting key. Numeric id routes use /settings/:id only.',
      );
    }
    const n = Number.parseInt(raw, 10);
    if (!Number.isInteger(n) || n < 1 || String(n) !== raw) {
      throw new BadRequestException('Invalid setting id: expected a positive integer');
    }
    return n;
  }

  @Post()
  @ApiOperation({ summary: 'Create a new setting' })
  create(@Body() createSettingDto: CreateSettingDto) {
    return this.settingsService.create(createSettingDto);
  }

  @Get()
  @ApiOperation({ summary: 'Get all settings' })
  findAll() {
    return this.settingsService.findAll();
  }

  /** Avoid `GET /settings/key` being captured by `:id` (would pass id="key" → NaN → Prisma error). */
  @Get('key')
  @ApiOperation({ summary: 'Reject incomplete key URL' })
  findByKeyMissing() {
    throw new BadRequestException('Missing setting key. Use GET /settings/key/:key (e.g. /settings/key/my_setting).');
  }

  @Get('key/:key')
  @ApiOperation({ summary: 'Get a setting by its unique key' })
  findByKey(@Param('key') key: string) {
    return this.settingsService.findByKey(key);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a setting by ID' })
  findOne(@Param('id') id: string) {
    return this.settingsService.findOne(this.parseNumericSettingIdParam(id));
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a setting' })
  update(@Param('id') id: string, @Body() updateSettingDto: UpdateSettingDto) {
    return this.settingsService.update(this.parseNumericSettingIdParam(id), updateSettingDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a setting' })
  remove(@Param('id') id: string) {
    return this.settingsService.remove(this.parseNumericSettingIdParam(id));
  }
}
