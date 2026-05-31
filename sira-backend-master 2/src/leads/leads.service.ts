import { Injectable, NotFoundException, BadRequestException, ForbiddenException, Logger, ConflictException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { LeadAssignmentExpireAction, LeadPriority, LeadStatus, LeadType, Prisma } from '@prisma/client';
import { assertCanAccessUser, getVisibleTeamIds } from '../common/subordinates.helper';
import { normalizeRoleSlug } from '../common/role-slug.util';
import * as XLSX from 'xlsx';
import { PrismaService } from '../config/prisma.service';
import { CreateLeadDto, LEAD_INBOUND_PLATFORM_VALUES } from './dto/create-lead.dto';
import { UpdateLeadDto } from './dto/update-lead.dto';
import { GetLeadsDto } from './dto/get-leads.dto';
import { createPaginatedResponse } from '../common/pagination.interface';
import { isLegacyXlsBuffer, mergeWorkbookSheetsToRecords } from '../common/excel-merge-workbook';
import { NotificationsService } from '../notifications/notifications.service';
import { WhatsappNotifyService } from '../whatsapp-notify/whatsapp-notify.service';

@Injectable()
export class LeadsService {
  private readonly logger = new Logger(LeadsService.name);

  /** Large Excel imports: bulk INSERT batches (MySQL packet / placeholders). */
  private static readonly BATCH_IMPORT_CREATE_MANY_CHUNK = 800;
  /** Hard cap rows per sheet (parses full sheet into memory — raise if infra allows). */
  private static readonly BATCH_IMPORT_MAX_ROWS = 350_000;
  /** Existing-phone scan pagination (avoid one massive findMany query). */
  private static readonly EXISTING_PHONES_PAGE_SIZE = 25_000;
  constructor(
    private prisma: PrismaService,
    private notificationsService: NotificationsService,
    private whatsappNotify: WhatsappNotifyService,
  ) { }

  /** Ensures the viewer may scope leads to this team (same rules as team listings). */
  private async assertCanFilterLeadsByTeam(viewerId: number, viewerRole: string, teamIdStr: string): Promise<void> {
    const tid = BigInt(teamIdStr);
    const role = normalizeRoleSlug(viewerRole);
    if (role === 'super_admin' || role === 'operation_manager') return;

    if (role === 'sales') {
      const me = await this.prisma.user.findUnique({
        where: { id: BigInt(viewerId) },
        select: { teamId: true },
      });
      if (!me?.teamId || me.teamId !== tid) {
        throw new ForbiddenException('You cannot filter leads by this team');
      }
      return;
    }

    const visible = await getVisibleTeamIds(this.prisma, viewerId, viewerRole);
    if (visible === null) return;
    if (!visible.includes(tid)) {
      throw new ForbiddenException('You cannot filter leads by this team');
    }
  }

  /** Standardizes phone numbers to detect duplicates across imports.
   * Strips prefix (0020, 20) and leading zero to compare core digits.
   */
  private normalizePhoneDigits(phone: string): string {
    let digits = String(phone ?? '').replace(/\D/g, '');
    if (digits.startsWith('0020')) digits = digits.substring(4);
    else if (digits.startsWith('20')) digits = digits.substring(2);
    if (digits.startsWith('0')) digits = digits.substring(1);
    return digits;
  }

  private truncateLeadField(value: string | null | undefined, maxLen: number): string | null {
    if (value == null || value === '') return null;
    return value.length <= maxLen ? value : value.slice(0, maxLen);
  }

  private priorityFromMappedCell(rawPriority: string): LeadPriority {
    const s = rawPriority.toLowerCase();
    if (s.includes('high') || s.includes('urgent')) return LeadPriority.high;
    if (s.includes('low')) return LeadPriority.low;
    return LeadPriority.medium;
  }

  /** Walk all lead phones once in pages — builds normalized-digit set used for CRM duplicate skips. */
  private async loadExistingNormalizedPhoneSet(): Promise<Set<string>> {
    const normalized = new Set<string>();
    let cursor: bigint | undefined;
    for (; ;) {
      const batch = await this.prisma.lead.findMany({
        select: { id: true, phone: true },
        take: LeadsService.EXISTING_PHONES_PAGE_SIZE,
        orderBy: { id: 'asc' },
        ...(cursor !== undefined ? { cursor: { id: cursor }, skip: 1 } : {}),
      });
      if (batch.length === 0) break;
      for (const row of batch) {
        const d = this.normalizePhoneDigits(row.phone);
        if (d.length >= 5) normalized.add(d);
      }
      cursor = batch[batch.length - 1].id;
      if (batch.length < LeadsService.EXISTING_PHONES_PAGE_SIZE) break;
    }
    return normalized;
  }

  /** Bulk-insert prepared rows with chunking + rare row-level fallback when a chunk fails. */
  private async bulkInsertImportedLeads(rows: Prisma.LeadCreateManyInput[]): Promise<{
    inserted: number;
    fallbackFailed: number;
  }> {
    if (rows.length === 0) return { inserted: 0, fallbackFailed: 0 };

    let inserted = 0;
    let fallbackFailed = 0;
    const chunkSize = LeadsService.BATCH_IMPORT_CREATE_MANY_CHUNK;
    const totalChunks = Math.ceil(rows.length / chunkSize);

    for (let offset = 0, chunkIdx = 0; offset < rows.length; offset += chunkSize, chunkIdx++) {
      const slice = rows.slice(offset, offset + chunkSize);
      try {
        const result = await this.prisma.lead.createMany({ data: slice });
        inserted += result.count;
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        this.logger.warn(
          `createMany chunk ${chunkIdx + 1}/${totalChunks} (${slice.length} rows) failed: ${msg}; retrying row-by-row.`,
        );
        for (const row of slice) {
          try {
            await this.prisma.lead.create({ data: row });
            inserted++;
          } catch (rowErr: unknown) {
            fallbackFailed++;
            const rm = rowErr instanceof Error ? rowErr.message : String(rowErr);
            this.logger.warn(`Skipped single lead insert (phone ${row.phone}): ${rm}`);
          }
        }
      }

      const done = Math.min(offset + slice.length, rows.length);
      if (done >= rows.length || (chunkIdx + 1) % 25 === 0 || chunkIdx === 0) {
        this.logger.log(`Bulk import progress: ${done}/${rows.length} rows flushed`);
      }
    }

    return { inserted, fallbackFailed };
  }

  async create(createLeadDto: CreateLeadDto, currentUserId?: number, currentRole?: string) {
    const r = normalizeRoleSlug(currentRole);
    const canManualCreate = r === 'super_admin' || r === 'operation_manager';
    if (!canManualCreate) {
      throw new ForbiddenException('Only super admin and operation manager can add leads manually');
    }

    const payload = { ...createLeadDto };

    // Validate assignment only if assignedTo is provided (and not super_admin create)
    if (payload.assignedTo) {
      await this.validateAssignment(
        currentUserId,
        r,
        payload.assignedTo,
        payload.assignmentMode || 'standard',
      );
    }

    const lead = await this.prisma.lead.create({
      data: {
        ...payload,
        assignedAt: payload.assignedTo ? new Date() : null,
      },
      include: {
        leadSource: true,
        campaign: true,
        assignedUser: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
        team: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    // Create initial assignment record only if lead is assigned (not for super_admin unassigned leads)
    if (payload.assignedTo) {
      await this.prisma.leadAssignment.create({
        data: {
          leadId: lead.id,
          assignedTo: payload.assignedTo,
          assignedBy: currentUserId ? BigInt(currentUserId) : null,
          assignmentType: 'initial',
        },
      });

      const leadName = [lead.firstName, lead.lastName].filter(Boolean).join(' ') || 'New lead';
      this.notificationsService.createAndEmit({
        userId: payload.assignedTo,
        type: 'lead_assigned',
        title: 'New Lead Assigned',
        message: `Lead "${leadName}" has been assigned to you.`,
        relatedEntityType: 'lead',
        relatedEntityId: lead.id,
      }).catch((err) => this.logger.error(`Failed to emit lead assignment notification: ${err.message}`));
    }

    return lead;
  }

  async findAll(query: GetLeadsDto, currentUserId?: number, currentRole?: string) {
    const role = normalizeRoleSlug(currentRole);
    const {
      page = 1,
      limit = 10,
      search,
      assignmentMode,
      priority,
      type,
      status,
      dateFrom,
      dateTo,
      assignedTo,
      previouslyAssignedTo,
      assigneePresence,
      excludeRotation,
      campaignId,
      dataBatchId,
      inboundPlatform,
      batchKind,
      importSource,
      teamId,
    } = query;
    const skip = (page - 1) * limit;

    if (teamId) {
      if (currentUserId == null || !currentRole) {
        throw new BadRequestException('teamId filter requires authentication');
      }
      await this.assertCanFilterLeadsByTeam(currentUserId, currentRole, teamId);
    }

    // Keep backend filter contracts aligned with frontend filter flow.
    const platformInboundAllowed = new Set(['dubizzle', 'bayut', 'aqarmap', 'property_finder_egypt']);
    if (type === 'platform' && inboundPlatform && !platformInboundAllowed.has(inboundPlatform)) {
      throw new BadRequestException(
        'For platform leads, inboundPlatform must be one of: dubizzle, bayut, aqarmap, property_finder_egypt.',
      );
    }
    if ((type === 'cold_call' || type === 'platform') && batchKind) {
      throw new BadRequestException('batchKind is only valid for campaign leads.');
    }
    if (type === 'cold_call' && inboundPlatform && inboundPlatform !== 'cold_call') {
      throw new BadRequestException('For cold call leads, inboundPlatform must be cold_call when provided.');
    }

    const where: any = {};

    if (importSource === 'manual') {
      where.AND = [
        ...(Array.isArray(where.AND) ? where.AND : []),
        {
          OR: [{ dataBatch: { is: { dataSource: 'manual' } } }, { dataBatchId: null }],
        },
      ];
      if (batchKind) {
        // For manual campaign leads, project/resale is represented by inboundPlatform.
        const kindPlatform = batchKind === 'ads' ? 'ads' : 'resale';
        where.AND = [
          ...(Array.isArray(where.AND) ? where.AND : []),
          { inboundPlatform: kindPlatform },
        ];
      }
    } else if (importSource === 'batches') {
      // Imported batches only (exclude manual/no-batch leads).
      if (batchKind) {
        where.dataBatch = { is: { dataSource: batchKind } };
      } else {
        where.dataBatch = { is: { dataSource: { not: 'manual' } } };
      }
    } else if (batchKind) {
      // Source = all: include both imported-batch and manual for the selected project/resale kind.
      const kindPlatform = batchKind === 'ads' ? 'ads' : 'resale';
      where.AND = [
        ...(Array.isArray(where.AND) ? where.AND : []),
        {
          OR: [
            { dataBatch: { is: { dataSource: batchKind } } },
            {
              AND: [
                { inboundPlatform: kindPlatform },
                {
                  OR: [{ dataBatch: { is: { dataSource: 'manual' } } }, { dataBatchId: null }],
                },
              ],
            },
          ],
        },
      ];
    }

    // Search: name (single field or first+last), phone (raw or digits-only), email.
    // No `mode: 'insensitive'` — MySQL does not support it in Prisma (PostgreSQL-only).
    if (search) {
      const q = search.trim();
      const searchOR: Record<string, unknown>[] = [
        { firstName: { contains: q } },
        { lastName: { contains: q } },
        { phone: { contains: q } },
        { email: { contains: q } },
      ];

      const digitsOnly = q.replace(/\D/g, '');
      if (digitsOnly.length >= 3) {
        searchOR.push({ phone: { contains: digitsOnly } });
      }

      const parts = q.split(/\s+/).filter(Boolean);
      if (parts.length >= 2) {
        const first = parts[0]!;
        const last = parts[parts.length - 1]!;
        searchOR.push({
          AND: [{ firstName: { contains: first } }, { lastName: { contains: last } }],
        });
        searchOR.push({
          AND: [{ firstName: { contains: last } }, { lastName: { contains: first } }],
        });
      }

      where.OR = searchOR;
    }

    // Assignment Mode filter
    if (assignmentMode) {
      where.assignmentMode = assignmentMode;
    }

    // Priority filter
    if (priority) {
      where.priority = priority;
    }

    // Lead type filter (cold_call / campaign / primary)
    if (type) {
      where.type = type;
    }

    if (inboundPlatform) {
      where.inboundPlatform = inboundPlatform;
    }

    if (campaignId) {
      where.campaignId = BigInt(campaignId);
    }

    if (dataBatchId) {
      where.dataBatchId = BigInt(Number(dataBatchId));
    }

    if (status) {
      where.status = status;
    }

    // Date range filter (createdAt)
    if (dateFrom || dateTo) {
      where.createdAt = {};
      if (dateFrom) where.createdAt.gte = new Date(dateFrom);
      if (dateTo) {
        const d = new Date(dateTo);
        d.setHours(23, 59, 59, 999);
        where.createdAt.lte = d;
      }
    }

    if (previouslyAssignedTo) {
      if (currentUserId == null || !currentRole) {
        throw new BadRequestException('previouslyAssignedTo filter requires authentication');
      }
      const prevId = Number(previouslyAssignedTo);
      await assertCanAccessUser(this.prisma, currentUserId, currentRole, prevId);
      const prevBig = BigInt(prevId);
      const existingAnd = Array.isArray(where.AND) ? where.AND : [];
      where.AND = [
        ...existingAnd,
        {
          OR: [{ assignedTo: null }, { assignedTo: { not: prevBig } }],
        },
        {
          assignments: {
            some: { assignedTo: prevBig },
          },
        },
      ];
    } else if (assignedTo) {
      if (currentUserId == null || !currentRole) {
        throw new BadRequestException('assignedTo filter requires authentication');
      }
      const assigneeId = Number(assignedTo);
      await assertCanAccessUser(this.prisma, currentUserId, currentRole, assigneeId);
      where.assignedTo = BigInt(assigneeId);
    } else if (
      role &&
      role !== 'super_admin' &&
      role !== 'operation_manager' &&
      role !== 'sales_manager' &&
      !(role === 'sales' && status === 'rotation')
    ) {
      const userId = BigInt(currentUserId!);

      const roleFilter: any = {};
      if (role === 'sales') {
        roleFilter.assignedTo = userId;
      } else if (role === 'tech_lead') {
        roleFilter.OR = [
          { assignedTo: userId },
          { team: { teamLeaderId: userId } },
          { assignedUser: { team: { teamLeaderId: userId } } },
        ];
      } else {
        throw new ForbiddenException('You do not have permission to view leads');
      }

      if (roleFilter.assignedTo) {
        where.assignedTo = roleFilter.assignedTo;
      } else if (roleFilter.OR) {
        if (where.OR) {
          const searchOR = [...where.OR];
          delete where.OR;
          where.AND = [{ OR: searchOR }, { OR: roleFilter.OR }];
        } else {
          where.OR = roleFilter.OR;
        }
      }
    }

    // Optional: only leads with an owner vs pool (no assignee). Ignored when filtering by a specific user id.
    // Use nullable-relation filters (Prisma UserNullableScalarRelationFilter: is / isNot), not BigInt { not: null }.
    if (assigneePresence && (assigneePresence === 'assigned' || assigneePresence === 'unassigned') && !assignedTo) {
      if (role === 'sales' && assigneePresence === 'unassigned') {
        return createPaginatedResponse([], 0, page, limit);
      }

      const cond =
        assigneePresence === 'assigned'
          ? { NOT: { assignedUser: { is: null } } }
          : { assignedUser: null };

      if (typeof where.assignedTo === 'bigint') {
        /* specific assignee filter already set */
      } else if (previouslyAssignedTo && Array.isArray(where.AND)) {
        where.AND.push(cond);
      } else if (where.OR != null && where.assignedTo === undefined) {
        const orPart = where.OR;
        delete where.OR;
        const existingAnd = Array.isArray(where.AND) ? where.AND : where.AND != null ? [where.AND] : [];
        where.AND = [...existingAnd, { OR: orPart }, cond];
      } else if (where.AND) {
        const andArr = Array.isArray(where.AND) ? where.AND : [where.AND];
        where.AND = [...andArr, cond];
      } else {
        Object.assign(where, cond);
      }
    }

    // "All leads" UI hides rotation pool unless user opens Rotation tab (excludeRotation=true, no status).
    if (excludeRotation && status == null) {
      const notRotation = { status: { not: 'rotation' as const } };
      if (Object.keys(where).length === 0) {
        Object.assign(where, notRotation);
      } else if (Array.isArray(where.AND)) {
        where.AND = [...where.AND, notRotation];
      } else if (where.AND != null) {
        where.AND = [where.AND, notRotation];
      } else {
        const snapshot = { ...where };
        for (const k of Object.keys(where)) delete where[k];
        where.AND = [snapshot, notRotation];
      }
    }

    if (teamId) {
      const tid = BigInt(teamId);
      const teamScope = {
        OR: [{ teamId: tid }, { assignedUser: { teamId: tid } }],
      };
      if (Object.keys(where).length === 0) {
        Object.assign(where, teamScope);
      } else {
        const snapshot = { ...where };
        for (const k of Object.keys(where)) delete (where as Record<string, unknown>)[k];
        where.AND = [snapshot, teamScope];
      }
    }

    const [leads, total] = await Promise.all([
      this.prisma.lead.findMany({
        skip,
        take: limit,
        where,
        include: {
          leadSource: true,
          campaign: true,
          assignedUser: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
            },
          },
          team: {
            select: {
              id: true,
              name: true,
              teamLeaderId: true,
            },
          },
          dataBatch: {
            select: {
              id: true,
              batchName: true,
              dataSource: true,
            },
          },
          _count: {
            select: {
              feedbacks: true,
              callLogs: true,
              meetings: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.lead.count({ where }),
    ]);

    return createPaginatedResponse(leads, total, page, limit);
  }

  async findOne(id: number, currentUserId?: number, currentRole?: string) {
    const role = normalizeRoleSlug(currentRole);
    const lead = await this.prisma.lead.findUnique({
      where: { id: BigInt(id) },
      include: {
        leadSource: true,
        campaign: true,
        dataBatch: true,
        assignedUser: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            roleId: true,
            teamId: true,
            role: {
              select: {
                name: true,
              },
            },
            team: {
              select: {
                id: true,
                name: true,
                teamLeaderId: true,
                teamLeader: {
                  select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                  },
                },
              },
            },
          },
        },
        rotatedFrom: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            role: {
              select: {
                name: true,
              },
            },
          },
        },
        team: {
          select: {
            id: true,
            name: true,
            teamLeaderId: true,
            teamLeader: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
              },
            },
          },
        },
        feedbacks: {
          orderBy: { createdAt: 'desc' },
          take: 40,
          include: {
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                role: {
                  select: {
                    name: true,
                  },
                },
              },
            },
          },
        },
        callLogs: {
          orderBy: { createdAt: 'desc' },
          take: 40,
          include: {
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                role: {
                  select: {
                    name: true,
                  },
                },
              },
            },
          },
        },
        meetings: {
          orderBy: { meetingDate: 'desc' },
          take: 40,
          include: {
            scheduler: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                role: {
                  select: {
                    name: true,
                  },
                },
              },
            },
          },
        },
        assignments: {
          orderBy: { assignedAt: 'desc' },
          take: 40,
          include: {
            assignedUser: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                role: {
                  select: {
                    name: true,
                  },
                },
              },
            },
            assigner: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                role: {
                  select: {
                    name: true,
                  },
                },
              },
            },
          },
        },
        autoRetractions: {
          orderBy: { retractedAt: 'desc' },
          take: 20,
          include: {
            previousUser: {
              select: { id: true, firstName: true, lastName: true, role: { select: { name: true } } },
            },
            reassignedUser: {
              select: { id: true, firstName: true, lastName: true, role: { select: { name: true } } },
            },
          },
        },
      },
    });

    if (!lead) {
      throw new NotFoundException(`Lead with ID ${id} not found`);
    }

    // Authorization check for single lead view
    if (role && role !== 'super_admin' && role !== 'operation_manager' && role !== 'sales_manager') {
      const userId = BigInt(currentUserId!);
      const isAssignedToUser = lead.assignedTo === userId;
      const idEq = (a: unknown) => a != null && BigInt(String(a)) === userId;
      const isTeamLeaderForLead =
        idEq((lead as any).team?.teamLeader?.id) ||
        idEq((lead as any).team?.teamLeaderId) ||
        idEq((lead as any).assignedUser?.team?.teamLeader?.id) ||
        idEq((lead as any).assignedUser?.team?.teamLeaderId);
      const isRotation = lead.status === 'rotation';

      // Exception: any sales can view rotation pool leads
      if (!isRotation && role === 'sales' && !isAssignedToUser) {
        throw new ForbiddenException('You do not have permission to view this lead');
      } else if (role === 'tech_lead' && !isAssignedToUser && !isTeamLeaderForLead) {
        /** List access uses OR(team leader on lead/assignee team). Assignee may lack `team` in DB; mirror profile rule via hierarchy. */
        const assigneeIdRaw = lead.assignedTo ?? lead.assignedUser?.id;
        const assigneeId =
          assigneeIdRaw != null && assigneeIdRaw !== undefined ? Number(assigneeIdRaw) : NaN;
        if (Number.isFinite(assigneeId)) {
          try {
            await assertCanAccessUser(this.prisma, currentUserId!, role, assigneeId);
          } catch {
            throw new ForbiddenException('You do not have permission to view this lead');
          }
        } else {
          throw new ForbiddenException('You do not have permission to view this lead');
        }
      } else if (role !== 'sales' && role !== 'tech_lead') {
        throw new ForbiddenException('You do not have permission to view this lead');
      }
    }

    // Sales should only see logs linked to their own user.
    if (role === 'sales' && currentUserId != null) {
      const userIdStr = String(currentUserId);
      (lead as any).assignments = ((lead as any).assignments ?? []).filter((a: any) => {
        const assignedTo = a?.assignedTo != null ? String(a.assignedTo) : null;
        const assignedBy = a?.assignedBy != null ? String(a.assignedBy) : null;
        const assignedUserId = a?.assignedUser?.id != null ? String(a.assignedUser.id) : null;
        const assignerId = a?.assigner?.id != null ? String(a.assigner.id) : null;
        return assignedTo === userIdStr || assignedBy === userIdStr || assignedUserId === userIdStr || assignerId === userIdStr;
      });
      (lead as any).meetings = ((lead as any).meetings ?? []).filter((m: any) => {
        const scheduledBy = m?.scheduledBy != null ? String(m.scheduledBy) : null;
        const schedulerId = m?.scheduler?.id != null ? String(m.scheduler.id) : null;
        return scheduledBy === userIdStr || schedulerId === userIdStr;
      });
      (lead as any).feedbacks = ((lead as any).feedbacks ?? []).filter((f: any) => {
        const feedbackUserId = f?.userId != null ? String(f.userId) : null;
        const userId = f?.user?.id != null ? String(f.user.id) : null;
        return feedbackUserId === userIdStr || userId === userIdStr;
      });
      (lead as any).callLogs = ((lead as any).callLogs ?? []).filter((c: any) => {
        const callUserId = c?.userId != null ? String(c.userId) : null;
        const userId = c?.user?.id != null ? String(c.user.id) : null;
        return callUserId === userIdStr || userId === userIdStr;
      });
    }

    return lead;
  }

  /**
   * Same DB row: when a lead was in the rotation pool (unassigned + rotation) and gets an assignee,
   * reset pipeline to `new_lead` and clear rotation metadata so the new sales user does not keep seeing "rotation".
   */
  private isUnassignedRotationPoolLead(existing: {
    status?: unknown;
    assignedTo?: bigint | null;
  } | null): boolean {
    if (!existing || existing.assignedTo != null) return false;
    const st = String(existing.status ?? '')
      .trim()
      .toLowerCase();
    return st === 'rotation';
  }

  private mergeLeavingRotationPoolOnAssign(
    assignPatch: Record<string, unknown>,
    existing: { status?: unknown; assignedTo?: bigint | null; rotatedFromId?: bigint | null } | null,
  ): Record<string, unknown> {
    if (!this.isUnassignedRotationPoolLead(existing)) return assignPatch;
    return {
      ...assignPatch,
      status: LeadStatus.new_lead,
      rotatedFromId: null,
      rotatedAt: null,
    };
  }

  private async validateAssignment(
    assignerId: number | undefined,
    assignerRole: string | undefined,
    assigneeId: number | BigInt,
    mode: string,
  ) {
    if (!assignerRole) return;
    assignerRole = normalizeRoleSlug(assignerRole);

    const assignee = await this.prisma.user.findUnique({
      where: { id: BigInt(assigneeId.toString()) },
      include: { role: true },
    });

    if (!assignee) {
      throw new NotFoundException(`Assignee with ID ${assigneeId} not found`);
    }

    const assigneeRole = assignee.role.name;

    // Standard flow: Super Admin -> Operation Manager -> Sales
    if (mode === 'standard') {
      if (assignerRole === 'super_admin' && assigneeRole !== 'operation_manager') {
        throw new BadRequestException('Super Admin can only assign to Operation Manager');
      }
      if (assignerRole === 'operation_manager' && assigneeRole !== 'sales') {
        throw new BadRequestException('Operation Manager can only assign to Sales');
      }
      if (assignerRole === 'sales_manager' || assignerRole === 'tech_lead' || assignerRole === 'sales') {
        throw new BadRequestException(
          'Standard flow is only: Super Admin -> Operation Manager -> Sales',
        );
      }
    } else if (mode === 'customize') {
      if ((assignerRole === 'super_admin' || assignerRole === 'operation_manager') && assigneeRole !== 'sales') {
        throw new BadRequestException('In customize mode you can only assign directly to Sales');
      }
      if (assignerRole !== 'operation_manager' && assignerRole !== 'super_admin') {
        throw new BadRequestException('Only Super Admin or Operation Manager can use customize (assign to Sales direct)');
      }
    } else {
      throw new BadRequestException(`Unknown assignment mode: ${mode}`);
    }
  }

  private async resolveTemporaryAssignmentPayload(
    currentUserId: number | undefined,
    currentRole: string | undefined,
    primaryAssigneeId: number,
    opts: {
      assignmentDurationHours?: number;
      assignmentExpireAction?: LeadAssignmentExpireAction;
      backupAssignUserId?: number;
    },
  ): Promise<{
    assignmentExpiresAt: Date | null;
    assignmentExpireAction: LeadAssignmentExpireAction | null;
    assignmentBackupUserId: bigint | null;
  }> {
    const hoursRaw = opts.assignmentDurationHours;
    if (hoursRaw === undefined || hoursRaw === null || Number(hoursRaw) <= 0) {
      return {
        assignmentExpiresAt: null,
        assignmentExpireAction: null,
        assignmentBackupUserId: null,
      };
    }

    const hours = Number(hoursRaw);
    if (!opts.assignmentExpireAction) {
      throw new BadRequestException(
        'assignmentExpireAction is required when assignmentDurationHours is greater than 0',
      );
    }

    if (opts.assignmentExpireAction === LeadAssignmentExpireAction.backup_sales) {
      if (opts.backupAssignUserId == null) {
        throw new BadRequestException(
          'backupAssignUserId is required when assignmentExpireAction is backup_sales',
        );
      }
      if (Number(opts.backupAssignUserId) === Number(primaryAssigneeId)) {
        throw new BadRequestException('Backup assignee must be different from the primary assignee');
      }
      const backup = await this.prisma.user.findUnique({
        where: { id: BigInt(opts.backupAssignUserId) },
        include: { role: true },
      });
      if (!backup) {
        throw new NotFoundException(`Backup assignee with ID ${opts.backupAssignUserId} not found`);
      }
      if (backup.role.name !== 'sales') {
        throw new BadRequestException('Backup assignee must be a Sales user');
      }
      if (backup.status !== 'active') {
        throw new BadRequestException('Backup assignee must be active');
      }
      if (currentUserId != null && currentRole) {
        await assertCanAccessUser(this.prisma, currentUserId, currentRole, opts.backupAssignUserId);
      }
      const assignmentExpiresAt = new Date();
      assignmentExpiresAt.setTime(assignmentExpiresAt.getTime() + hours * 3600 * 1000);
      return {
        assignmentExpiresAt,
        assignmentExpireAction: opts.assignmentExpireAction,
        assignmentBackupUserId: BigInt(opts.backupAssignUserId),
      };
    }

    const assignmentExpiresAt = new Date();
    assignmentExpiresAt.setTime(assignmentExpiresAt.getTime() + hours * 3600 * 1000);
    return {
      assignmentExpiresAt,
      assignmentExpireAction: opts.assignmentExpireAction,
      assignmentBackupUserId: null,
    };
  }

  async update(id: number, updateLeadDto: UpdateLeadDto, currentUserId?: number, currentRole?: string) {
    await this.findOne(id, currentUserId, currentRole);

    const {
      assignedTo,
      assignmentDurationHours,
      assignmentExpireAction,
      backupAssignUserId,
      ...rest
    } = updateLeadDto as any;

    const existingLead = await this.prisma.lead.findUnique({
      where: { id: BigInt(id) },
      select: { assignedTo: true, assignmentMode: true, status: true, rotatedFromId: true },
    });

    const isNewAssignment =
      updateLeadDto.assignedTo &&
      existingLead!.assignedTo?.toString() !== updateLeadDto.assignedTo.toString();

    if (isNewAssignment) {
      await this.validateAssignment(
        currentUserId,
        currentRole,
        updateLeadDto.assignedTo,
        updateLeadDto.assignmentMode || (existingLead!.assignmentMode as string) || 'standard',
      );
    }

    const updateData: any = { ...rest };
    if (assignedTo != null) updateData.assignedTo = BigInt(Number(assignedTo));
    if (isNewAssignment) updateData.assignedAt = new Date();
    Object.keys(updateData).forEach((k) => updateData[k] === undefined && delete updateData[k]);

    if (isNewAssignment || assignmentDurationHours !== undefined) {
      const primaryId = isNewAssignment
        ? Number(updateLeadDto.assignedTo)
        : existingLead!.assignedTo != null
          ? Number(existingLead!.assignedTo)
          : null;

      if (
        primaryId == null &&
        assignmentDurationHours != null &&
        Number(assignmentDurationHours) > 0
      ) {
        throw new BadRequestException('Cannot set a temporary assignment on an unassigned lead');
      }

      if (primaryId != null || (assignmentDurationHours !== undefined && Number(assignmentDurationHours) <= 0)) {
        const temp = await this.resolveTemporaryAssignmentPayload(
          currentUserId,
          currentRole,
          primaryId ?? 0,
          {
            assignmentDurationHours,
            assignmentExpireAction,
            backupAssignUserId,
          },
        );
        Object.assign(updateData, temp);
      }
    }

    if (isNewAssignment) {
      Object.assign(
        updateData,
        this.mergeLeavingRotationPoolOnAssign({}, existingLead) as Record<string, unknown>,
      );
      // Keep current lead status on transfer — no pipeline reset on sales handoff.
    }

    const lead = await this.prisma.lead.update({
      where: { id: BigInt(id) },
      data: updateData,
      include: {
        leadSource: true,
        campaign: true,
        assignedUser: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
        team: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    // Create assignment record if it's a new assignment
    if (isNewAssignment) {
      await this.prisma.leadAssignment.create({
        data: {
          leadId: BigInt(id),
          assignedTo: BigInt(updateLeadDto.assignedTo),
          assignedBy: currentUserId ? BigInt(currentUserId) : null,
          assignmentType: 'manual',
        },
      });

      const leadName = [lead.firstName, lead.lastName].filter(Boolean).join(' ') || 'A lead';
      this.notificationsService.createAndEmit({
        userId: updateLeadDto.assignedTo,
        type: 'lead_assigned',
        title: 'Lead Assigned to You',
        message: `Lead "${leadName}" has been assigned to you.`,
        relatedEntityType: 'lead',
        relatedEntityId: lead.id,
      }).catch((err) => this.logger.error(`Failed to emit lead assignment notification: ${err.message}`));

      // WhatsApp notification to new assignee
      this.prisma.user.findUnique({
        where: { id: BigInt(updateLeadDto.assignedTo) },
        select: { firstName: true, phone: true },
      }).then((assignee) => {
        if (assignee) {
          this.whatsappNotify.sendLeadAssignmentAlert(assignee.phone, assignee.firstName, 1);
        }
      }).catch(() => undefined);

      // WhatsApp notification to previous assignee (lead transferred away from them)
      if (existingLead?.assignedTo != null) {
        this.prisma.user.findUnique({
          where: { id: existingLead.assignedTo },
          select: { firstName: true, phone: true },
        }).then((prev) => {
          if (prev) {
            this.whatsappNotify.sendLeadTransferredAlert(prev.phone, prev.firstName, 1);
          }
        }).catch(() => undefined);
      }
    }

    return lead;
  }

  async bulkUpdate(bulkAssignLeadsDto: any, currentUserId?: number, currentRole?: string) {
    const {
      leadIds,
      assignedTo,
      assignmentMode,
      assignmentDurationHours,
      assignmentExpireAction,
      backupAssignUserId,
    } = bulkAssignLeadsDto;

    await this.validateAssignment(
      currentUserId,
      currentRole,
      assignedTo,
      assignmentMode || 'standard',
    );

    const temp = await this.resolveTemporaryAssignmentPayload(
      currentUserId,
      currentRole,
      Number(assignedTo),
      { assignmentDurationHours, assignmentExpireAction, backupAssignUserId },
    );

    const updateData = {
      assignedTo: BigInt(assignedTo),
      assignmentMode: assignmentMode || 'standard',
      assignedAt: new Date(),
      ...temp,
    };

    const updatedLeads = await this.prisma.$transaction(async (tx) => {
      const results = await Promise.all(
        leadIds.map(async (id: number) => {
          const existing = await tx.lead.findUnique({
            where: { id: BigInt(id) },
            select: { status: true, assignedTo: true, rotatedFromId: true },
          });
          // Keep current lead status on transfer — only reset when leaving the rotation pool.
          const data = this.mergeLeavingRotationPoolOnAssign(
            { ...updateData } as Record<string, unknown>,
            existing,
          ) as any;
          const updatedLead = await tx.lead.update({
            where: { id: BigInt(id) },
            data,
            select: { id: true, firstName: true, lastName: true },
          });

          await tx.leadAssignment.create({
            data: {
              leadId: BigInt(id),
              assignedTo: BigInt(assignedTo),
              assignedBy: currentUserId ? BigInt(currentUserId) : null,
              assignmentType: 'manual',
            },
          });

          return updatedLead;
        }),
      );

      return results;
    });

    const leadNames = updatedLeads
      .map((l: any) => [l.firstName, l.lastName].filter(Boolean).join(' ').trim())
      .filter(Boolean);
    const n = leadIds.length;
    let message: string;
    if (leadNames.length === 0) {
      message = n === 1 ? 'A new lead has been assigned to you.' : `${n} leads have been assigned to you.`;
    } else if (leadNames.length === 1) {
      message = `Lead "${leadNames[0]}" has been assigned to you.`;
    } else if (leadNames.length === 2) {
      message = `Leads "${leadNames[0]}" and "${leadNames[1]}" have been assigned to you.`;
    } else {
      message = `${n} leads have been assigned to you.`;
    }

    this.notificationsService.createAndEmit({
      userId: assignedTo,
      type: 'lead_assigned',
      title: n === 1 ? 'Lead Assigned to You' : 'Leads Assigned to You',
      message,
      relatedEntityType: 'lead',
    }).catch((err) => this.logger.error(`Failed to emit bulk assignment notification: ${err.message}`));

    // WhatsApp notification to sales rep
    this.prisma.user.findUnique({
      where: { id: BigInt(assignedTo) },
      select: { firstName: true, phone: true },
    }).then((assignee) => {
      if (assignee) {
        this.whatsappNotify.sendLeadAssignmentAlert(assignee.phone, assignee.firstName, n);
      }
    }).catch(() => undefined);

    return updatedLeads;
  }

  /** Unassign leads and set status to rotation (pool for reassignment). */
  async bulkSendToRotation(
    leadIds: number[],
    currentUserId?: number,
    currentRole?: string,
    opts?: { force?: boolean },
  ) {
    const allowed = ['super_admin', 'operation_manager', 'sales_manager', 'tech_lead'];
    const roleNorm = normalizeRoleSlug(currentRole);
    if (!roleNorm || !allowed.includes(roleNorm)) {
      throw new ForbiddenException('You are not allowed to move leads to the rotation pool');
    }
    if (!leadIds?.length) {
      throw new BadRequestException('leadIds is required');
    }

    const ids = [...new Set(leadIds.map((id) => BigInt(id)))];
    const leads = await this.prisma.lead.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        assignedUser: { select: { id: true, firstName: true, lastName: true, phone: true } },
        _count: { select: { meetings: true, feedbacks: true } },
      },
    });
    const found = new Set(leads.map((l) => l.id.toString()));
    const missing = ids.filter((id) => !found.has(id.toString())).map((id) => id.toString());
    if (missing.length) {
      throw new BadRequestException(`Unknown lead id(s): ${missing.join(', ')}`);
    }
    const blockedLeads = leads.filter((l) => l._count.meetings > 0 || l._count.feedbacks > 0);
    if (blockedLeads.length && opts?.force !== true) {
      throw new ConflictException({
        message:
          'Some leads have engagement history (meetings/feedback). Confirm if you still want to send them to rotation.',
        code: 'ROTATION_CONFIRM_REQUIRED',
        blockedLeads: blockedLeads.map((l) => ({
          id: l.id.toString(),
          name: [l.firstName, l.lastName].filter(Boolean).join(' ').trim() || `Lead ${l.id.toString()}`,
          assignedSales:
            l.assignedUser != null
              ? {
                id: l.assignedUser.id.toString(),
                name:
                  [l.assignedUser.firstName, l.assignedUser.lastName]
                    .filter(Boolean)
                    .join(' ')
                    .trim() || `User ${l.assignedUser.id.toString()}`,
              }
              : null,
          meetingsCount: l._count.meetings,
          feedbacksCount: l._count.feedbacks,
        })),
      });
    }

    const leadById = new Map(leads.map((l) => [l.id.toString(), l]));
    const rotatedAt = new Date();
    const actorId = currentUserId != null ? BigInt(currentUserId) : null;
    const updated = await this.prisma.$transaction(async (tx) => {
      const rows = [] as any[];
      for (const rawId of leadIds) {
        const id = BigInt(rawId);
        const row = leadById.get(id.toString());
        const previousAssigneeId = row?.assignedUser?.id ?? null;
        const auditAssignedTo = previousAssigneeId ?? actorId;
        if (auditAssignedTo != null) {
          await tx.leadAssignment.create({
            data: {
              leadId: id,
              assignedTo: auditAssignedTo,
              assignedBy: actorId,
              assignmentType: 'rotation',
              reason: 'Moved to rotation pool',
              assignedAt: rotatedAt,
            },
          });
        }
        const updatedLead = await tx.lead.update({
          where: { id },
          data: {
            rotatedFromId: previousAssigneeId,
            rotatedAt,
            assignedTo: null,
            assignedAt: null,
            status: 'rotation',
            assignmentExpiresAt: null,
            assignmentExpireAction: null,
            assignmentBackupUserId: null,
          },
        });
        rows.push(updatedLead);
      }
      return rows;
    });

    // WhatsApp notifications grouped by previous assignee
    const retractedByUser = new Map<string, { firstName: string; phone: string | null; count: number }>();
    for (const lead of leads) {
      if (lead.assignedUser?.id != null) {
        const uid = lead.assignedUser.id.toString();
        const existing = retractedByUser.get(uid);
        if (existing) {
          existing.count++;
        } else {
          retractedByUser.set(uid, {
            firstName: lead.assignedUser.firstName ?? '',
            phone: (lead.assignedUser as any).phone ?? null,
            count: 1,
          });
        }
      }
    }
    for (const info of retractedByUser.values()) {
      this.whatsappNotify.sendLeadRetractedAlert(info.phone, info.firstName, info.count).catch(() => undefined);
    }

    return {
      updatedCount: updated.length,
      forced: opts?.force === true,
      blockedCount: blockedLeads.length,
    };
  }

  /** Clear assignee only (leads appear under “not assigned” / no owner). Does not set status to rotation. */
  async bulkClearAssignment(leadIds: number[], currentRole?: string) {
    const allowed = ['super_admin', 'operation_manager', 'sales_manager', 'tech_lead'];
    const roleNorm = normalizeRoleSlug(currentRole);
    if (!roleNorm || !allowed.includes(roleNorm)) {
      throw new ForbiddenException('You are not allowed to clear lead assignments');
    }
    if (!leadIds?.length) {
      throw new BadRequestException('leadIds is required');
    }
    const ids = [...new Set(leadIds.map((id) => BigInt(id)))];

    // Fetch previous assignees before clearing
    const beforeClear = await this.prisma.lead.findMany({
      where: { id: { in: ids }, assignedTo: { not: null } },
      select: { assignedUser: { select: { id: true, firstName: true, phone: true } } },
    });
    const clearedByUser = new Map<string, { firstName: string; phone: string | null; count: number }>();
    for (const lead of beforeClear) {
      if (lead.assignedUser?.id != null) {
        const uid = lead.assignedUser.id.toString();
        const existing = clearedByUser.get(uid);
        if (existing) {
          existing.count++;
        } else {
          clearedByUser.set(uid, {
            firstName: lead.assignedUser.firstName ?? '',
            phone: lead.assignedUser.phone ?? null,
            count: 1,
          });
        }
      }
    }

    const result = await this.prisma.lead.updateMany({
      where: { id: { in: ids } },
      data: {
        assignedTo: null,
        assignedAt: null,
        assignmentExpiresAt: null,
        assignmentExpireAction: null,
        assignmentBackupUserId: null,
      },
    });

    for (const info of clearedByUser.values()) {
      this.whatsappNotify.sendLeadRetractedAlert(info.phone, info.firstName, info.count).catch(() => undefined);
    }

    return { updatedCount: result.count };
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async processExpiredTemporaryAssignments() {
    const now = new Date();
    const expired = await this.prisma.lead.findMany({
      where: {
        assignmentExpiresAt: { lte: now },
        assignmentExpireAction: { not: null },
        /** Only leads that still have an owner; avoids re-processing inconsistent rows */
        assignedTo: { not: null },
      },
      select: {
        id: true,
        assignedTo: true,
        assignmentExpireAction: true,
        assignmentBackupUserId: true,
      },
    });

    for (const lead of expired) {
      try {
        await this.prisma.$transaction(async (tx) => {
          if (lead.assignmentExpireAction === LeadAssignmentExpireAction.rotation) {
            const meetingCount = await tx.meeting.count({ where: { leadId: lead.id } });
            if (meetingCount > 0) {
              await tx.lead.update({
                where: { id: lead.id },
                data: {
                  assignmentExpiresAt: null,
                  assignmentExpireAction: null,
                  assignmentBackupUserId: null,
                },
              });
              this.logger.log(
                `Skipped auto-rotation for lead ${lead.id}: ${meetingCount} meeting(s) exist (engagement). Cleared expiry; assignee kept.`,
              );
              return;
            }
            await tx.lead.update({
              where: { id: lead.id },
              data: {
                rotatedFromId: lead.assignedTo,
                rotatedAt: new Date(),
                assignedTo: null,
                assignedAt: null,
                status: 'rotation',
                assignmentExpiresAt: null,
                assignmentExpireAction: null,
                assignmentBackupUserId: null,
              },
            });
            await tx.leadAssignment.create({
              data: {
                leadId: lead.id,
                assignedTo: lead.assignedTo,
                assignedBy: null,
                assignmentType: 'rotation',
                reason: 'Automatically moved to rotation after assignment expiry',
              },
            });
            return;
          }

          if (
            lead.assignmentExpireAction === LeadAssignmentExpireAction.backup_sales &&
            lead.assignmentBackupUserId
          ) {
            const backupId = lead.assignmentBackupUserId;
            await tx.lead.update({
              where: { id: lead.id },
              data: {
                assignedTo: backupId,
                assignedAt: new Date(),
                assignmentExpiresAt: null,
                assignmentExpireAction: null,
                assignmentBackupUserId: null,
              },
            });
            await tx.leadAssignment.create({
              data: {
                leadId: lead.id,
                assignedTo: backupId,
                assignedBy: null,
                assignmentType: 'manual',
                reason: 'Time-limited assignment expired; reassigned to backup sales',
              },
            });
            return;
          }

          await tx.lead.update({
            where: { id: lead.id },
            data: {
              assignmentExpiresAt: null,
              assignmentExpireAction: null,
              assignmentBackupUserId: null,
            },
          });
        });
      } catch (e: any) {
        this.logger.error(
          `processExpiredTemporaryAssignments failed for lead ${lead.id}: ${e?.message ?? e}`,
        );
      }
    }

    /** Clear expiry metadata on unassigned leads (e.g. manual unassign left flags behind). */
    await this.prisma.lead.updateMany({
      where: {
        assignmentExpiresAt: { lte: now },
        assignmentExpireAction: { not: null },
        assignedTo: null,
      },
      data: {
        assignmentExpiresAt: null,
        assignmentExpireAction: null,
        assignmentBackupUserId: null,
      },
    });
  }

  /** Upload an image to Meta WhatsApp media API once; the returned media_id can be reused for all broadcast messages. */
  async uploadWhatsappMedia(file: Express.Multer.File, currentUserId?: number, currentRole?: string) {
    const role = normalizeRoleSlug(currentRole);
    const allowed = ['super_admin', 'operation_manager', 'sales_manager', 'tech_lead', 'sales'];
    if (!allowed.includes(role ?? '')) throw new ForbiddenException('Not allowed');
    if (!file?.buffer) throw new BadRequestException('No image file provided');
    const mediaId = await this.whatsappNotify.uploadMedia(file.buffer, file.mimetype || 'image/jpeg');
    if (!mediaId) return { success: false, reason: 'upload_failed' };
    return { success: true, mediaId };
  }

  /** Send a WhatsApp message (text or image+caption) to a lead's phone. */
  async sendWhatsappToLead(leadId: number, message: string, currentUserId?: number, currentRole?: string, mediaId?: string) {
    const role = normalizeRoleSlug(currentRole);
    const lead = await this.prisma.lead.findUnique({
      where: { id: BigInt(leadId) },
      select: { id: true, phone: true, firstName: true, lastName: true, assignedTo: true },
    });
    if (!lead) throw new NotFoundException(`Lead ${leadId} not found`);

    const isManager = ['super_admin', 'operation_manager', 'sales_manager', 'tech_lead'].includes(role ?? '');
    const isOwner = currentUserId != null && lead.assignedTo != null && String(lead.assignedTo) === String(currentUserId);
    if (!isManager && !isOwner) throw new ForbiddenException('You can only send WhatsApp to your own leads');

    if (!lead.phone) return { success: false, reason: 'no_phone' };

    const sent = mediaId
      ? await this.whatsappNotify.sendImage(lead.phone, mediaId, message || undefined)
      : await this.whatsappNotify.sendText(lead.phone, message);

    return { success: sent, leadId, phone: lead.phone };
  }

  async remove(id: number, currentUserId?: number, currentRole?: string) {
    const r = normalizeRoleSlug(currentRole);
    const isManager = r === 'super_admin' || r === 'operation_manager';
    if (!isManager) {
      throw new ForbiddenException('Only managers can delete leads');
    }
    const lead = await this.findOne(id, currentUserId, currentRole);
    const leadPhone = String((lead as any)?.phone || '').trim();
    return this.prisma.$transaction(async (tx) => {
      if (leadPhone) {
        // Unit preview linkage is phone-based (no FK to leads). Detach it when a lead is deleted.
        await tx.unitPreview.updateMany({
          where: { clientPhone: leadPhone },
          data: { clientPhone: null },
        });
      }
      return tx.lead.delete({
        where: { id: BigInt(id) },
      });
    });
  }

  async batchImport(
    batchId: number,
    file: any,
    mapping?: string,
    dryRun: boolean = false,
    inboundPlatformQuery?: string,
  ) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    try {
      // 1. Verify batch exists
      const batch = await this.prisma.dataBatch.findUnique({
        where: { id: BigInt(batchId) },
      });

      if (!batch) {
        throw new NotFoundException(`Data batch with ID ${batchId} not found`);
      }

      const batchRow = batch as { campaignId?: bigint | null };
      const isCampaignImport = batchRow.campaignId != null;
      const campaignIdForLead = isCampaignImport ? batchRow.campaignId : null;

      // Parse mapping if provided
      let manualMapping: Record<string, string> = {};
      if (mapping) {
        try {
          manualMapping = JSON.parse(mapping);
        } catch (e) {
          this.logger.error(`Failed to parse manual mapping: ${mapping}`);
        }
      }

      const workbook = XLSX.read(file.buffer, { type: 'buffer' });
      if (!workbook.SheetNames?.length) {
        throw new BadRequestException('Workbook has no sheets');
      }

      const merged = mergeWorkbookSheetsToRecords(workbook);
      const data: Record<string, unknown>[] = merged.records;

      if (data.length === 0) {
        throw new BadRequestException('File is empty (no data rows across all sheets)');
      }
      if (data.length > LeadsService.BATCH_IMPORT_MAX_ROWS) {
        throw new BadRequestException(
          `Too many rows (${data.length}). Maximum supported per file is ${LeadsService.BATCH_IMPORT_MAX_ROWS}. Split into multiple uploads.`,
        );
      }

      const sheetHint =
        workbook.SheetNames.length > 1 ? ` (${workbook.SheetNames.length} sheets merged)` : '';
      this.logger.log(`Batch import parsed ${data.length} data rows${sheetHint} (dryRun=${dryRun})`);

      if (isLegacyXlsBuffer(file.buffer)) {
        this.logger.warn(
          'Workbook appears to be legacy Excel 97–2003 (.xls). Excel stores at most 65,536 rows per worksheet. One sheet cannot exceed that; Save As modern .xlsx for a single sheet of 100k+ rows or split rows across Sheet1 / Sheet2 (same columns).',
        );
      }

      const existingNormalized = await this.loadExistingNormalizedPhoneSet();
      this.logger.log(
        `Loaded ${existingNormalized.size} distinct normalized CRM phone digits for duplicate detection`,
      );

      const seenInFile = new Set<string>();
      let skippedDuplicate = 0;
      let failed = 0;

      const getValue = (row: Record<string, unknown>, schemaField: string, ...fallbackKeys: string[]) => {
        if (manualMapping[schemaField] && row[manualMapping[schemaField]] !== undefined && row[manualMapping[schemaField]] !== '') {
          return row[manualMapping[schemaField]];
        }
        const keysLower =
          fallbackKeys.length > 0 ? fallbackKeys.map((k) => k.toLowerCase()) : [schemaField.toLowerCase()];
        const foundKey = Object.keys(row).find((rk) => {
          const cleanedRk = rk.toLowerCase().replace(/[^a-z0-9]/g, '');
          return keysLower.some((kl) => cleanedRk.includes(kl));
        });
        return foundKey ? row[foundKey] : null;
      };

      const toInsert: Prisma.LeadCreateManyInput[] = [];
      const batchIdBn = BigInt(batchId);

      const allowedInbound = LEAD_INBOUND_PLATFORM_VALUES as readonly string[];
      const inboundRaw =
        typeof inboundPlatformQuery === 'string' ? inboundPlatformQuery.trim().toLowerCase() : '';
      const inboundParsed = inboundRaw && allowedInbound.includes(inboundRaw) ? inboundRaw : '';
      if (String(inboundPlatformQuery ?? '').trim() !== '' && !inboundParsed) {
        throw new BadRequestException(`Invalid inboundPlatform: ${inboundPlatformQuery}`);
      }

      const dataSourceNorm = String(batch.dataSource ?? '').trim().toLowerCase();
      if (dataSourceNorm === 'resale' && inboundParsed !== 'resale') {
        throw new BadRequestException(
          'This batch is tagged as resale; the import request must use inboundPlatform=resale.',
        );
      }
      const platformMarketplace = new Set(['dubizzle', 'bayut', 'aqarmap', 'property_finder_egypt', 'resale']);

      let resolvedType: LeadType;
      let resolvedCampaignId: bigint | undefined;
      let resolvedInbound: string | undefined;

      if (isCampaignImport && campaignIdForLead != null) {
        resolvedType = LeadType.campaign;
        resolvedCampaignId = campaignIdForLead;
        resolvedInbound = inboundParsed || undefined;
      } else if (dataSourceNorm === 'ads') {
        /** Bulk «Ads · Project» — marketing campaign channel, not a listing platform. */
        resolvedType = LeadType.campaign;
        resolvedCampaignId = undefined;
        resolvedInbound = inboundParsed === 'ads' ? 'ads' : inboundParsed || 'ads';
      } else if (dataSourceNorm === 'resale') {
        /** Bulk «Ads · Resale» — resale marketing campaign imports. */
        resolvedType = LeadType.campaign;
        resolvedCampaignId = undefined;
        resolvedInbound = 'resale';
      } else {
        resolvedCampaignId = undefined;
        if (inboundParsed === 'ads') {
          resolvedType = LeadType.campaign;
          resolvedInbound = 'ads';
        } else if (inboundParsed && platformMarketplace.has(inboundParsed)) {
          resolvedType = LeadType.platform;
          resolvedInbound = inboundParsed;
        } else {
          resolvedType = LeadType.cold_call;
          resolvedInbound = inboundParsed === 'cold_call' ? 'cold_call' : undefined;
        }
      }

      for (const row of data) {
        try {
          const phoneRaw = String(getValue(row, 'phone', 'phone', 'mobile', 'tel', 'whatsapp', 'primary') ?? '').trim();
          if (!phoneRaw) {
            failed++;
            continue;
          }

          const phoneStored = this.truncateLeadField(phoneRaw, 20);
          if (!phoneStored) {
            failed++;
            continue;
          }

          const digits = this.normalizePhoneDigits(phoneStored);
          if (digits.length < 5) {
            failed++;
            continue;
          }

          if (seenInFile.has(digits)) {
            skippedDuplicate++;
            continue;
          }
          if (existingNormalized.has(digits)) {
            skippedDuplicate++;
            continue;
          }

          const fullName = String(getValue(row, 'name', 'fullname', 'name', 'full', 'first', 'label') ?? '').trim();
          const email = this.truncateLeadField(String(getValue(row, 'email', 'email', 'mail') ?? '').trim(), 255);
          const notesRaw = String(getValue(row, 'notes', 'note', 'address', 'comment', 'description') ?? '').trim();
          const notes = notesRaw === '' ? null : notesRaw;
          const rawPriority = String(getValue(row, 'priority', 'priority', 'importance') ?? '').toLowerCase();

          let firstName = fullName || null;
          let lastName: string | null = null;
          if (fullName.includes(' ')) {
            const parts = fullName.split(/\s+/);
            firstName = parts[0] || null;
            lastName = parts.slice(1).join(' ') || null;
          }

          const record: Prisma.LeadCreateManyInput = {
            firstName: this.truncateLeadField(firstName, 100),
            lastName: this.truncateLeadField(lastName, 100),
            phone: phoneStored,
            email,
            notes,
            priority: this.priorityFromMappedCell(rawPriority),
            dataBatchId: batchIdBn,
            type: resolvedType,
            status: LeadStatus.new_lead,
            ...(resolvedCampaignId != null ? { campaignId: resolvedCampaignId } : {}),
            ...(resolvedInbound ? { inboundPlatform: resolvedInbound } : {}),
          };

          toInsert.push(record);
          seenInFile.add(digits);
          existingNormalized.add(digits);
        } catch (error: unknown) {
          const message = error instanceof Error ? error.message : String(error);
          this.logger.error(`Failed parsing import row: ${JSON.stringify(row)}. ${message}`);
          failed++;
        }
      }

      const wouldInsert = toInsert.length;
      let imported = dryRun ? wouldInsert : 0;

      if (!dryRun && wouldInsert > 0) {
        const { inserted, fallbackFailed } = await this.bulkInsertImportedLeads(toInsert);
        imported = inserted;
        failed += fallbackFailed;
        if (fallbackFailed > 0) {
          this.logger.warn(`Bulk import finished with ${fallbackFailed} row-level insert failure(s)`);
        }
      }

      if (!dryRun) {
        try {
          await this.prisma.dataBatch.update({
            where: { id: BigInt(batchId) },
            data: {
              importedCount: imported,
              skippedDuplicateCount: skippedDuplicate,
              failedImportCount: failed,
            },
          });
        } catch (e: any) {
          this.logger.warn(
            `Could not save import stats on data batch ${batchId}: ${e?.message ?? e}`,
          );
        }
      }

      return {
        message: dryRun ? 'Dry run completed' : 'Batch import completed',
        dryRun,
        total: data.length,
        imported,
        skipped: skippedDuplicate,
        failed,
      };
    } catch (error) {
      throw new BadRequestException(`Failed to parse file: ${error.message}`);
    }
  }
}
