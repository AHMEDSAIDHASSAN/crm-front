import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { CampaignPlatform } from '@prisma/client';
import { PrismaService } from '../config/prisma.service';
import { CreateCampaignDto } from './dto/create-campaign.dto';
import { UpdateCampaignDto } from './dto/update-campaign.dto';
import * as XLSX from 'xlsx';

@Injectable()
export class CampaignsService {
  constructor(private prisma: PrismaService) { }

  async create(createCampaignDto: CreateCampaignDto) {
    const dto = createCampaignDto;
    const platformLabel =
      dto.platform === 'other'
        ? dto.platformLabel?.trim() || null
        : null;

    const ext = dto.campaignIdExternal?.trim();

    return this.prisma.campaign.create({
      data: {
        name: dto.name,
        platform: dto.platform,
        platformLabel,
        platformIcon: dto.platformIcon?.trim() || null,
        campaignIdExternal: ext ? ext : null,
        status: dto.status ?? 'active',
        startDate: dto.startDate ? new Date(dto.startDate) : new Date(),
        endDate: dto.endDate ? new Date(dto.endDate) : null,
        budget:
          dto.budget != null && Number.isFinite(Number(dto.budget))
            ? Number(dto.budget)
            : null,
        leadSourceId: dto.leadSourceId ?? null,
        timeLimit: dto.timeLimit ?? null,
      },
    });
  }

  async findAll() {
    return this.prisma.campaign.findMany({
      include: {
        _count: {
          select: { leads: true },
        },
        leadSource: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: number) {
    const campaign = await this.prisma.campaign.findUnique({
      where: { id: BigInt(id) },
      include: {
        leadSource: true,
        leads: {
          take: 5,
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!campaign) {
      throw new NotFoundException(`Campaign with ID ${id} not found`);
    }

    return campaign;
  }

  async update(id: number, updateCampaignDto: UpdateCampaignDto) {
    const platformLabel =
      updateCampaignDto.platform === 'other'
        ? updateCampaignDto.platformLabel?.trim() || null
        : updateCampaignDto.platform
          ? null
          : undefined;

    try {
      return await this.prisma.campaign.update({
        where: { id: BigInt(id) },
        data: {
          ...updateCampaignDto,
          budget: updateCampaignDto.budget ? Number(updateCampaignDto.budget) : undefined,
          platformLabel,
          platformIcon:
            updateCampaignDto.platformIcon === undefined
              ? undefined
              : updateCampaignDto.platformIcon?.trim() || null,
        },
      });
    } catch (error) {
      throw new NotFoundException(`Campaign with ID ${id} not found`);
    }
  }

  /** Super admin only (controller): detach leads before delete (`Lead.campaignId` has no onDelete cascade). */
  async remove(id: number) {
    const bid = BigInt(id);
    try {
      return await this.prisma.$transaction(async (tx) => {
        await tx.lead.updateMany({
          where: { campaignId: bid },
          data: { campaignId: null },
        });
        const deleted = await tx.campaign.delete({
          where: { id: bid },
        });
        return deleted;
      });
    } catch {
      throw new NotFoundException(`Campaign with ID ${id} not found`);
    }
  }

  private parsePlatform(value: string | undefined | null): {
    platform: CampaignPlatform;
    platformLabel: string | null;
  } {
    const raw = (value || '').toLowerCase().trim();
    const normalized = raw.replace(/[\s-]+/g, '_');

    const directMap: Record<string, CampaignPlatform> = {
      facebook: 'facebook',
      instagram: 'instagram',
      meta: 'meta',
      dubizzle: 'dubizzle',
      property_finder: 'property_finder',
      propertyfinder: 'property_finder',
    };

    if (directMap[normalized]) {
      return { platform: directMap[normalized], platformLabel: null };
    }

    if (!raw) {
      return { platform: 'other', platformLabel: 'Other' };
    }

    return { platform: 'other', platformLabel: value!.trim() };
  }

  async importCampaigns(file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    const workbook = XLSX.read(file.buffer, { type: 'buffer' });
    const firstSheet = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[firstSheet];
    const rows: Record<string, any>[] = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

    if (!rows.length) {
      throw new BadRequestException('File is empty');
    }

    let imported = 0;
    let skipped = 0;

    for (const row of rows) {
      const name = String(row.name || row.Name || row.campaign_name || row.CampaignName || '').trim();
      if (!name) {
        skipped++;
        continue;
      }

      const platformRaw = String(
        row.platform || row.Platform || row.source || row.Source || row.channel || row.Channel || '',
      );
      const { platform, platformLabel } = this.parsePlatform(platformRaw);
      const campaignIdExternal = String(
        row.campaignIdExternal || row.campaign_id_external || row.external_id || row.ExternalId || '',
      ).trim();
      const budgetRaw = row.budget ?? row.Budget ?? '';
      const startDateRaw = row.startDate ?? row.start_date ?? row.StartDate ?? '';
      const endDateRaw = row.endDate ?? row.end_date ?? row.EndDate ?? '';
      const iconRaw = String(row.platformIcon || row.icon || row.Icon || '').trim();

      await this.prisma.campaign.create({
        data: {
          name,
          platform,
          platformLabel,
          platformIcon: iconRaw || null,
          campaignIdExternal: campaignIdExternal || null,
          budget: budgetRaw === '' ? null : Number(budgetRaw),
          startDate: startDateRaw ? new Date(startDateRaw) : null,
          endDate: endDateRaw ? new Date(endDateRaw) : null,
        },
      });
      imported++;
    }

    return {
      message: 'Campaign import completed',
      total: rows.length,
      imported,
      skipped,
    };
  }
}
