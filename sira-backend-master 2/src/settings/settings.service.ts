import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../config/prisma.service';
import { CreateSettingDto } from './dto/create-setting.dto';
import { UpdateSettingDto } from './dto/update-setting.dto';

@Injectable()
export class SettingsService {
  constructor(private prisma: PrismaService) { }

  /** Safe positive Int id for Prisma `where: { id }` — never pass NaN/undefined. */
  private assertSettingIntId(id: unknown): number {
    const n = typeof id === 'number' ? id : Number(id);
    if (!Number.isInteger(n) || n < 1 || !Number.isFinite(n)) {
      throw new BadRequestException('Invalid setting id');
    }
    return n;
  }

  async create(createSettingDto: CreateSettingDto) {
    return this.prisma.systemSetting.create({
      data: createSettingDto,
    });
  }

  async findAll() {
    return this.prisma.systemSetting.findMany();
  }

  async findByKey(key: string) {
    const k = String(key ?? '').trim();
    if (!k) {
      throw new BadRequestException('Missing setting key');
    }
    const setting = await this.prisma.systemSetting.findUnique({
      where: { settingKey: k },
    });

    if (!setting) {
      throw new NotFoundException(`Setting with key ${key} not found`);
    }

    return setting;
  }

  async findOne(id: number) {
    const safeId = this.assertSettingIntId(id);
    const setting = await this.prisma.systemSetting.findUnique({
      where: { id: safeId },
    });

    if (!setting) {
      throw new NotFoundException(`Setting with ID ${safeId} not found`);
    }

    return setting;
  }

  async update(id: number, updateSettingDto: UpdateSettingDto) {
    const safeId = this.assertSettingIntId(id);
    try {
      return await this.prisma.systemSetting.update({
        where: { id: safeId },
        data: updateSettingDto,
      });
    } catch (error) {
      throw new NotFoundException(`Setting with ID ${safeId} not found`);
    }
  }

  async remove(id: number) {
    const safeId = this.assertSettingIntId(id);
    try {
      return await this.prisma.systemSetting.delete({
        where: { id: safeId },
      });
    } catch (error) {
      throw new NotFoundException(`Setting with ID ${safeId} not found`);
    }
  }
}
