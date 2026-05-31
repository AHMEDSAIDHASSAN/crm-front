import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../config/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateUnitDto } from './dto/create-unit.dto';
import { UpdateUnitDto } from './dto/update-unit.dto';
import { PublishUnitDto } from './dto/publish-unit.dto';
import { UNIT_FULL_ACCESS_ROLES } from '../constants/roles';
import { Prisma } from '@prisma/client';

const publisherSelect = {
  id: true,
  firstName: true,
  lastName: true,
  phone: true,
  role: { select: { name: true } },
} as const;

@Injectable()
export class UnitsService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
  ) {}

  private normalizeSearchValue(v: unknown): string {
    return String(v ?? '').toLowerCase().replace(/[^a-z0-9\u0600-\u06FF]/g, '');
  }

  /** Sales may only read units they created or that are published. */
  private assertSalesCanViewUnit(
    unit: { createdBy: bigint; isPublished: boolean },
    viewerRole: string,
    viewerUserId: number,
  ) {
    if (String(viewerRole || '').trim().toLowerCase() !== 'sales') return;
    if (Number(unit.createdBy) !== viewerUserId && !unit.isPublished) {
      throw new ForbiddenException('You cannot view this unit');
    }
  }

  /** Sales may only edit/delete units they uploaded. */
  private assertSalesCanMutateUnit(unit: { createdBy: bigint }, viewerRole: string, viewerUserId: number) {
    if (String(viewerRole || '').trim().toLowerCase() !== 'sales') return;
    if (Number(unit.createdBy) !== viewerUserId) {
      throw new ForbiddenException('You can only edit or delete units you created');
    }
  }

  private readonly APPROVAL_PENDING = 'pending_operation';
  private readonly APPROVAL_APPROVED = 'approved_for_marketing';
  private readonly APPROVAL_REJECTED = 'rejected_by_operation';

  /** Owner PII: creator + ops/managers only — not peer sales browsing published inventory. */
  private viewerCanSeeUnitOwnerPii(
    viewerRole: string | undefined,
    viewerUserId: number | undefined,
    createdBy: bigint | number | null | undefined,
  ): boolean {
    const r = String(viewerRole ?? '')
      .trim()
      .toLowerCase();
    if (viewerUserId == null || !Number.isFinite(Number(viewerUserId))) return false;
    if (['super_admin', 'operation_manager', 'sales_manager', 'tech_lead'].includes(r)) return true;
    if (r === 'sales' && createdBy != null && Number(createdBy) === Number(viewerUserId)) return true;
    return false;
  }

  private extractApprovalStatus(raw: string | null | undefined, isPublished?: boolean): string {
    if (isPublished) return this.APPROVAL_APPROVED;
    if (!raw) return this.APPROVAL_PENDING;
    try {
      const parsed = JSON.parse(raw);
      const wf = (parsed as any)?.workflow;
      if (
        wf === this.APPROVAL_PENDING ||
        wf === this.APPROVAL_APPROVED ||
        wf === this.APPROVAL_REJECTED
      ) {
        return wf;
      }
    } catch {
      // ignore non-workflow publishedLink payload
    }
    return this.APPROVAL_PENDING;
  }

  private buildApprovalPayload(status: string, note?: string) {
    return JSON.stringify({
      workflow: status,
      note: note?.trim() || null,
      updatedAt: new Date().toISOString(),
    });
  }

  /**
   * Accepts either:
   * - plain URL string
   * - JSON string: { places: [{ name, link }, ...] }
   */
  private normalizePublishedLink(raw: string | undefined, isPublished: boolean): string | null {
    const trimmed = raw?.trim() || '';
    if (!isPublished) return null;
    if (!trimmed) return null;

    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && typeof parsed === 'object' && Array.isArray((parsed as any).places)) {
        const places = (parsed as any).places
          .map((p: any) => ({
            name: typeof p?.name === 'string' ? p.name.trim() : '',
            link: typeof p?.link === 'string' ? p.link.trim() : '',
          }))
          .filter((p: { name: string; link: string }) => p.name && p.link);

        if (places.length === 0) return null;
        return JSON.stringify({ places });
      }
    } catch (err) {
      if (err instanceof BadRequestException) {
        throw err;
      }
      // Not JSON => treat as legacy plain URL/text
    }

    if (trimmed.length < 8) {
      throw new BadRequestException('publishedLink is too short');
    }
    return trimmed;
  }

  private getCodePrefixFromUnitType(unitType?: string): string {
    const t = (unitType ?? '').trim().toLowerCase();
    if (t === 's' || t === 'shallea' || t === 'chalet') return 'S';
    if (
      t === 'd' ||
      t === 'department' ||
      t === 'apartment' ||
      t === 'adpartment' ||
      t === 'appartment' ||
      t === 'شقة' ||
      t === 'شقه'
    ) return 'A';
    if (t === 'st' || t === 'studio') return 'T';
    if (t === 'c' || t === 'commercial') return 'C';
    if (t === 'ph' || t === 'penthouse') return 'P';
    if (t === 'v' || t === 'villa') return 'V';
    return 'V';
  }

  /** Unique code, max 100 chars — sequential by prefix: V-1000, A-1000, S-1000, ... */
  private async allocateUnitCode(proposed?: string, unitType?: string): Promise<string> {
    const trimmed = proposed?.trim();
    if (trimmed) {
      if (trimmed.length > 100) {
        throw new BadRequestException('Unit code must be at most 100 characters');
      }
      const taken = await this.prisma.unit.findUnique({ where: { code: trimmed } });
      if (taken) {
        throw new BadRequestException(`Unit code "${trimmed}" is already in use`);
      }
      return trimmed;
    }

    const prefix = this.getCodePrefixFromUnitType(unitType);

    for (let i = 0; i < 50; i++) {
      // Generate a random number from 1000 to 99999
      const randomNum = Math.floor(Math.random() * 99000) + 1000;
      const candidate = `${prefix}-${randomNum}`;
      
      const exists = await this.prisma.unit.findUnique({
        where: { code: candidate },
      });

      if (!exists) {
        return candidate;
      }
    }

    throw new BadRequestException('Could not allocate a unique unit code; please try again');
  }

  async create(dto: CreateUnitDto, userId: number, requesterRole?: string) {
    const normalizeRole = (v: string | null | undefined) =>
      String(v || '')
        .trim()
        .toLowerCase()
        .replace(/[\s-]+/g, '_');
    let creatorRole = normalizeRole(requesterRole);
    if (!creatorRole) {
      const creator = await this.prisma.user.findUnique({
        where: { id: BigInt(userId) },
        select: { roleId: true },
      });
      const creatorRoleRow =
        creator?.roleId != null
          ? await this.prisma.role.findUnique({
              where: { id: creator.roleId },
              select: { name: true },
            })
          : null;
      creatorRole = normalizeRole(creatorRoleRow?.name);
    }
    const needsOperationApproval = creatorRole === 'sales';

    let unit: any = null;
    let code = '';
    const isManualCode = !!dto.code?.trim();
    const autoPrefix = this.getCodePrefixFromUnitType(dto.unitType);
    const lockName = `unit_code_${autoPrefix}`;
    for (let attempt = 0; attempt < 5; attempt++) {
      let lockAcquired = false;
      try {
        if (!isManualCode) {
          const lockRows = await this.prisma.$queryRawUnsafe<
            Array<{ l: number | bigint | null }>
          >('SELECT GET_LOCK(?, 10) AS l', lockName);
          const got = Number(lockRows?.[0]?.l ?? 0);
          if (got !== 1) {
            throw new BadRequestException('Could not secure unit-code generator lock; please retry');
          }
          lockAcquired = true;
        }

        code = await this.allocateUnitCode(dto.code, dto.unitType);
        unit = await this.prisma.unit.create({
          data: {
            code,
            description: dto.description,
            address: dto.address?.trim() || null,
            projectName: dto.projectName ?? null,
            location: dto.location ?? null,
            floor: dto.floor != null ? dto.floor : null,
            price: dto.price != null ? dto.price : null,
            monthlyInstallment: dto.monthlyInstallment != null ? dto.monthlyInstallment : null,
            deliveryDate: dto.deliveryDate ? new Date(dto.deliveryDate) : null,
            bedrooms: dto.bedrooms ?? null,
            bathrooms: dto.bathrooms ?? null,
            area: dto.area != null ? dto.area : null,
            unitType: dto.unitType ?? null,
            ownerName: dto.ownerName?.trim() || null,
            ownerPhone: dto.ownerPhone?.trim() || null,
            driveMediaLink: dto.driveMediaLink?.trim() || null,
            amenities:
              dto.amenities == null
                ? undefined
                : dto.amenities.length > 0
                  ? dto.amenities
                  : null,
            externalLinks:
              dto.externalLinks == null
                ? undefined
                : dto.externalLinks.length > 0
                  ? dto.externalLinks
                  : null,
            status: dto.status ?? 'available',
            // Sales units start in operation approval queue.
            // Super admin / other non-sales units are directly approved for marketing publish.
            publishedLink: needsOperationApproval
              ? this.buildApprovalPayload(this.APPROVAL_PENDING)
              : this.buildApprovalPayload(this.APPROVAL_APPROVED),
            createdBy: BigInt(userId),
          } as any,
          include: {
            creator: { select: publisherSelect },
            publishedBy: { select: publisherSelect },
          } as any,
        });
        break;
      } catch (err: any) {
        const codeConflict = err?.code === 'P2002';
        if (!codeConflict || isManualCode) throw err;
      } finally {
        if (lockAcquired) {
          await this.prisma.$queryRawUnsafe('SELECT RELEASE_LOCK(?)', lockName);
        }
      }
    }
    if (!unit) {
      throw new BadRequestException('Could not create unit with a unique code; please retry');
    }

    const notifyRoles = needsOperationApproval
      ? ['operation_manager', 'super_admin']
      : ['marketing', 'super_admin'];
    const notifyUsers = await this.prisma.user.findMany({
      where: { role: { name: { in: notifyRoles as any } } },
      select: { id: true },
    } as any);
    for (const mu of notifyUsers) {
      if (String(mu.id) !== String(userId)) {
        await this.notifications.createAndEmit({
          userId: Number(mu.id),
          type: 'unit_created' as any,
          title: needsOperationApproval
            ? `New unit ${code} needs operation approval`
            : `New unit ${code} needs publishing`,
          message: needsOperationApproval
            ? `A new unit (${code}) was added by sales and is waiting for operation approval.`
            : `A new unit (${code}) has been added and is waiting to be published.`,
          relatedEntityType: 'unit',
          relatedEntityId: Number(unit.id),
        });
      }
    }

    return {
      ...unit,
      approvalStatus: this.extractApprovalStatus(unit.publishedLink as any, unit.isPublished),
    };
  }

  async getNextCodePreview(unitType?: string) {
    const code = await this.allocateUnitCode(undefined, unitType);
    return { code };
  }

  async findAll(
    viewerUserId?: number,
    viewerRole?: string,
    filters?: { q?: string; salesId?: string; teamId?: string; publishedOnly?: boolean },
  ) {
    const role = String(viewerRole ?? '').trim().toLowerCase();
    const whereClauses: Prisma.UnitWhereInput[] = [];

    if (filters?.publishedOnly === true) {
      whereClauses.push({ isPublished: true });
    } else if (role === 'sales' && viewerUserId != null && Number.isFinite(viewerUserId)) {
      whereClauses.push({
        OR: [{ createdBy: BigInt(viewerUserId) }, { isPublished: true }],
      });
    }

    const q = filters?.q?.trim();

    const salesIdNum = Number(filters?.salesId);
    if (Number.isFinite(salesIdNum) && salesIdNum > 0) {
      whereClauses.push({ createdBy: BigInt(salesIdNum) });
    }

    const teamIdNum = Number(filters?.teamId);
    if (Number.isFinite(teamIdNum) && teamIdNum > 0) {
      whereClauses.push({
        creator: {
          is: { teamId: BigInt(teamIdNum) },
        },
      });
    }

    const where = whereClauses.length > 0 ? { AND: whereClauses } : undefined;

    const list = await this.prisma.unit.findMany({
      where,
      include: {
        creator: { select: publisherSelect },
        publishedBy: { select: publisherSelect },
      } as any,
      orderBy: { createdAt: 'desc' },
    });
    const rows = list.map((u: any) => {
      const canSeeOwner = this.viewerCanSeeUnitOwnerPii(role, viewerUserId, u.createdBy);
      const row = {
        ...u,
        approvalStatus: this.extractApprovalStatus(u.publishedLink, u.isPublished),
      };
      if (!canSeeOwner) {
        delete row.ownerName;
        delete row.ownerPhone;
      }
      return row;
    });

    if (!q) return rows;

    const qRaw = q.toLowerCase();
    const qNorm = this.normalizeSearchValue(q);
    return rows.filter((u: any) => {
      const fields = [u.code, u.description, u.projectName, u.location, u.address]
        .map((v) => String(v ?? ''));
      const rawHaystack = fields.join(' ').toLowerCase();
      if (rawHaystack.includes(qRaw)) return true;
      if (!qNorm) return false;
      return fields.some((v) => this.normalizeSearchValue(v).includes(qNorm));
    });
  }

  async findOne(id: number, viewerUserId?: number, viewerRole?: string) {
    const unit = await this.prisma.unit.findUnique({
      where: { id: BigInt(id) },
      include: {
        creator: { select: publisherSelect },
        publishedBy: { select: publisherSelect },
      } as any,
    });

    if (!unit) {
      throw new NotFoundException(`Unit with ID ${id} not found`);
    }

    if (viewerUserId != null && viewerRole != null) {
      this.assertSalesCanViewUnit(unit, viewerRole, viewerUserId);
    }

    const canSeeOwner = this.viewerCanSeeUnitOwnerPii(viewerRole, viewerUserId, (unit as any).createdBy);
    const result = {
      ...unit,
      approvalStatus: this.extractApprovalStatus((unit as any).publishedLink, (unit as any).isPublished),
    };

    if (!canSeeOwner) {
      delete (result as any).ownerName;
      delete (result as any).ownerPhone;
    }

    return result;
  }

  async update(id: number, updateUnitDto: UpdateUnitDto, roleName: string, viewerUserId?: number) {
    const normalizedRole = String(roleName || '').trim().toLowerCase();
    if (!UNIT_FULL_ACCESS_ROLES.includes(normalizedRole)) {
      throw new ForbiddenException('You cannot edit unit inventory with your role');
    }

    const existing = await this.prisma.unit.findUnique({
      where: { id: BigInt(id) },
      select: { id: true, createdBy: true, code: true, isPublished: true, publishedLink: true },
    });
    if (!existing) {
      throw new NotFoundException(`Unit with ID ${id} not found`);
    }
    if (viewerUserId != null) {
      this.assertSalesCanMutateUnit(existing, normalizedRole, viewerUserId);
    }

    const {
      price,
      area,
      monthlyInstallment,
      deliveryDate,
      driveMediaLink,
      ...rest
    } = updateUnitDto as UpdateUnitDto & Record<string, unknown>;

    const data: Record<string, unknown> = { ...rest };

    if (price !== undefined) {
      data.price = price === null ? null : Number(price);
    }
    if (area !== undefined) {
      data.area = area === null ? null : Number(area);
    }
    if (monthlyInstallment !== undefined) {
      data.monthlyInstallment =
        monthlyInstallment === null ? null : Number(monthlyInstallment);
    }
    if (deliveryDate !== undefined) {
      data.deliveryDate =
        deliveryDate === null || deliveryDate === ''
          ? null
          : new Date(deliveryDate as string);
    }
    if (driveMediaLink !== undefined) {
      data.driveMediaLink =
        driveMediaLink === null || driveMediaLink === ''
          ? null
          : String(driveMediaLink).trim();
    }
    if (updateUnitDto.ownerName !== undefined) {
      data.ownerName = updateUnitDto.ownerName?.trim() || null;
    }
    if (updateUnitDto.ownerPhone !== undefined) {
      data.ownerPhone = updateUnitDto.ownerPhone?.trim() || null;
    }

    delete data.isPublished;
    delete data.publishedLink;
    delete data.publishedAt;
    delete data.publishedById;

    const existingApproval = this.extractApprovalStatus(
      (existing as any).publishedLink as string | null | undefined,
      (existing as any).isPublished as boolean | undefined,
    );
    const salesResubmittingRejected =
      normalizedRole === 'sales' &&
      existingApproval === this.APPROVAL_REJECTED &&
      !(existing as any).isPublished;
    if (salesResubmittingRejected) {
      // When sales edits a rejected unit, treat save as re-submission for operation review.
      data.publishedLink = this.buildApprovalPayload(this.APPROVAL_PENDING);
      data.publishedAt = null;
      data.publishedById = null;
      data.isPublished = false;
    }

    const updated = await this.prisma.unit.update({
      where: { id: BigInt(id) },
      data: data as any,
      include: {
        creator: { select: publisherSelect },
        publishedBy: { select: publisherSelect },
      } as any,
    });

    if (salesResubmittingRejected) {
      const notifyUsers = await this.prisma.user.findMany({
        where: { role: { name: { in: ['operation_manager', 'super_admin'] as any } } },
        select: { id: true },
      } as any);
      for (const u of notifyUsers) {
        if (viewerUserId != null && String(u.id) === String(viewerUserId)) continue;
        await this.notifications.createAndEmit({
          userId: Number(u.id),
          type: 'unit_created' as any,
          title: `Unit ${existing.code} resubmitted for approval`,
          message: `Sales updated and resubmitted unit ${existing.code}. It is waiting for operation approval.`,
          relatedEntityType: 'unit',
          relatedEntityId: Number(existing.id),
        });
      }
    }
    return {
      ...updated,
      approvalStatus: this.extractApprovalStatus((updated as any).publishedLink, updated.isPublished),
    };
  }

  async reviewApproval(
    id: number,
    decision: 'approve' | 'reject',
    reviewerUserId: number,
    reviewerRole: string,
    note?: string,
  ) {
    const normalizedRole = String(reviewerRole || '').trim().toLowerCase();
    if (normalizedRole !== 'operation_manager' && normalizedRole !== 'super_admin') {
      throw new ForbiddenException('Only operation can approve or reject units');
    }

    const unit = await this.prisma.unit.findUnique({
      where: { id: BigInt(id) },
      include: {
        creator: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            role: { select: { name: true } },
          },
        },
      } as any,
    });
    if (!unit) throw new NotFoundException(`Unit with ID ${id} not found`);

    const creatorRole = String((unit as any)?.creator?.role?.name || '').toLowerCase();
    if (creatorRole !== 'sales') {
      throw new BadRequestException('Only units submitted by sales require operation approval');
    }
    if (unit.isPublished) {
      throw new BadRequestException('Unit is already published');
    }
    if (decision === 'reject' && !String(note ?? '').trim()) {
      throw new BadRequestException('Rejection reason is required');
    }

    const nextWorkflow =
      decision === 'approve' ? this.APPROVAL_APPROVED : this.APPROVAL_REJECTED;

    const updated = await this.prisma.unit.update({
      where: { id: BigInt(id) },
      data: {
        publishedLink: this.buildApprovalPayload(nextWorkflow, note),
      } as any,
      include: {
        creator: { select: publisherSelect },
        publishedBy: { select: publisherSelect },
      } as any,
    });

    if ((unit as any).creator?.id) {
      await this.notifications.createAndEmit({
        userId: Number((unit as any).creator.id),
        type: 'unit_created' as any,
        title:
          decision === 'approve'
            ? `Your unit ${unit.code} was approved`
            : `Your unit ${unit.code} was rejected`,
        message:
          decision === 'approve'
            ? `Operation approved unit ${unit.code}. It is now waiting for marketing publishing.`
            : `Operation rejected unit ${unit.code}.${note ? ` Note: ${note}` : ''}`,
        relatedEntityType: 'unit',
        relatedEntityId: Number(unit.id),
      });
    }

    if (decision === 'approve') {
      const marketingUsers = await this.prisma.user.findMany({
        where: { role: { name: { in: ['marketing', 'super_admin'] } } },
        select: { id: true },
      } as any);
      for (const mk of marketingUsers) {
        if (String(mk.id) === String(reviewerUserId)) continue;
        await this.notifications.createAndEmit({
          userId: Number(mk.id),
          type: 'unit_created' as any,
          title: `Unit ${unit.code} approved and ready to publish`,
          message: `Operation approved unit ${unit.code}. Please publish and add listing links.`,
          relatedEntityType: 'unit',
          relatedEntityId: Number(unit.id),
        });
      }
    }

    return {
      ...updated,
      approvalStatus: this.extractApprovalStatus((updated as any).publishedLink, updated.isPublished),
    };
  }

  async publish(id: number, dto: PublishUnitDto, userId: number) {
    const link = this.normalizePublishedLink(dto.publishedLink, dto.isPublished);

    const unit = await this.prisma.unit.findUnique({
      where: { id: BigInt(id) },
      include: {
        creator: {
          select: {
            id: true,
            role: { select: { name: true } },
          },
        },
      } as any,
    });
    if (!unit) throw new NotFoundException(`Unit with ID ${id} not found`);

    const creatorRole = String((unit as any).creator?.role?.name || '').toLowerCase();
    const approvalStatus = this.extractApprovalStatus((unit as any).publishedLink, unit.isPublished);
    if (dto.isPublished && creatorRole === 'sales' && approvalStatus !== this.APPROVAL_APPROVED) {
      throw new ForbiddenException('Unit must be approved by operation before marketing can publish it');
    }

    const result = await this.prisma.unit.update({
      where: { id: BigInt(id) },
      data: {
        isPublished: dto.isPublished,
        publishedLink: dto.isPublished ? link : null,
        publishedAt: dto.isPublished ? new Date() : null,
        publishedById: dto.isPublished ? BigInt(userId) : null,
      } as any,
      include: {
        creator: { select: publisherSelect },
        publishedBy: { select: publisherSelect },
      } as any,
    });

    if (dto.isPublished && (unit as any).createdBy) {
      await this.notifications.createAndEmit({
        userId: Number((unit as any).createdBy),
        type: 'unit_published' as any,
        title: `Your unit ${(unit as any).code} has been published`,
        message: `Unit ${(unit as any).code} is now live in the inventory.`,
        relatedEntityType: 'unit',
        relatedEntityId: id,
      });
    }

    return {
      ...result,
      approvalStatus: this.extractApprovalStatus((result as any).publishedLink, result.isPublished),
    };
  }

  async remove(id: number, roleName: string, viewerUserId?: number) {
    const normalizedRole = String(roleName || '').trim().toLowerCase();
    if (!UNIT_FULL_ACCESS_ROLES.includes(normalizedRole)) {
      throw new ForbiddenException('You cannot delete units with your role');
    }
    const existing = await this.prisma.unit.findUnique({
      where: { id: BigInt(id) },
      select: { id: true, createdBy: true },
    });
    if (!existing) {
      throw new NotFoundException(`Unit with ID ${id} not found`);
    }
    if (viewerUserId != null) {
      this.assertSalesCanMutateUnit(existing, normalizedRole, viewerUserId);
    }
    return this.prisma.unit.delete({
      where: { id: BigInt(id) },
    });
  }
}
