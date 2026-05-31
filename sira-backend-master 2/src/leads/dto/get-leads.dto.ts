import { IsOptional, IsEnum, IsString, IsDateString, Matches, IsInt, Min, IsIn } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { AssignmentMode, LeadPriority, LeadType, LeadStatus } from '@prisma/client';
import { Type, Transform } from 'class-transformer';
import { LEAD_INBOUND_PLATFORM_VALUES } from './create-lead.dto';

const INBOUND_PLATFORM_SET = new Set<string>(LEAD_INBOUND_PLATFORM_VALUES);

/** Shape for GET /leads filters (also used by UsersService calling LeadsService.findAll). */
export class GetLeadsDto {
    @ApiPropertyOptional({ minimum: 1, default: 1 })
    @IsOptional()
    @IsInt()
    @Min(1)
    @Type(() => Number)
    page?: number = 1;

    @ApiPropertyOptional({ minimum: 1, default: 10 })
    @IsOptional()
    @IsInt()
    @Min(1)
    @Type(() => Number)
    limit?: number = 10;

    @ApiPropertyOptional({ enum: AssignmentMode })
    @IsOptional()
    @IsEnum(AssignmentMode)
    assignmentMode?: AssignmentMode;

    @ApiPropertyOptional({ enum: LeadPriority })
    @IsOptional()
    @IsEnum(LeadPriority)
    priority?: LeadPriority;

    @ApiPropertyOptional({ enum: LeadType })
    @IsOptional()
    @IsEnum(LeadType)
    type?: LeadType;

    @ApiPropertyOptional({ description: 'Filter by marketing campaign id (numeric)' })
    @IsOptional()
    @Transform(({ value }) =>
        value === undefined || value === null || value === '' ? undefined : String(value),
    )
    @IsString()
    @Matches(/^\d+$/, { message: 'campaignId must be a numeric id' })
    campaignId?: string;

    @ApiPropertyOptional({ description: 'Filter by import data batch id (numeric)' })
    @IsOptional()
    @Transform(({ value }) =>
        value === undefined || value === null || value === '' ? undefined : String(value),
    )
    @IsString()
    @Matches(/^\d+$/, { message: 'dataBatchId must be a numeric id' })
    dataBatchId?: string;

    @ApiPropertyOptional({
        description:
            'Leads for this team: `Lead.teamId` matches, or current assignee belongs to the team',
    })
    @IsOptional()
    @Transform(({ value }) =>
        value === undefined || value === null || value === '' ? undefined : String(value),
    )
    @IsString()
    @Matches(/^\d+$/, { message: 'teamId must be a numeric id' })
    teamId?: string;

    @ApiPropertyOptional({ enum: LeadStatus })
    @IsOptional()
    @Transform(({ value }) => {
        if (value === undefined || value === null || value === '') return undefined;
        const raw = String(value).trim().toLowerCase();
        const aliases: Record<string, string> = {
            switch_off: 'switched_off',
            switchedoff: 'switched_off',
            meeting_canceled: 'meeting_cancelled',
        };
        return aliases[raw] ?? raw;
    })
    @IsEnum(LeadStatus)
    status?: LeadStatus;

    @ApiPropertyOptional({ description: 'Filter leads created on or after this date (ISO)' })
    @IsOptional()
    @IsDateString()
    dateFrom?: string;

    @ApiPropertyOptional({ description: 'Filter leads created on or before this date (ISO)' })
    @IsOptional()
    @IsDateString()
    dateTo?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    search?: string;

    @ApiPropertyOptional({ description: 'Filter by assigned user id (managers / TL / self only)' })
    @IsOptional()
    @Transform(({ value }) =>
        value === undefined || value === null || value === '' ? undefined : String(value),
    )
    @IsString()
    @Matches(/^\d+$/, { message: 'assignedTo must be a numeric user id' })
    assignedTo?: string;

    @ApiPropertyOptional({
        description:
            'Leads that were assigned to this user in the past (assignment history) but are no longer assigned to them',
    })
    @IsOptional()
    @Transform(({ value }) =>
        value === undefined || value === null || value === '' ? undefined : String(value),
    )
    @IsString()
    @Matches(/^\d+$/, { message: 'previouslyAssignedTo must be a numeric user id' })
    previouslyAssignedTo?: string;

    @ApiPropertyOptional({ enum: ['assigned', 'unassigned'], description: 'Filter by whether the lead has an owner (assignedTo)' })
    @IsOptional()
    @IsIn(['assigned', 'unassigned'])
    assigneePresence?: 'assigned' | 'unassigned';

    /** When true and `status` is not set, omit leads in the rotation pool (status rotation). */
    @ApiPropertyOptional()
    @IsOptional()
    excludeRotation?: boolean;

    @ApiPropertyOptional({
        enum: LEAD_INBOUND_PLATFORM_VALUES,
        description: 'Filter leads created via manual injection channel',
    })
    @IsOptional()
    @IsIn([...LEAD_INBOUND_PLATFORM_VALUES])
    inboundPlatform?: (typeof LEAD_INBOUND_PLATFORM_VALUES)[number];

    @ApiPropertyOptional({
        enum: ['ads', 'resale'],
        description: 'Filter leads by data batch kind (ads=Project, resale=Resale)',
    })
    @IsOptional()
    @IsIn(['ads', 'resale'])
    batchKind?: 'ads' | 'resale';

    @ApiPropertyOptional({
        enum: ['manual', 'batches'],
        description: 'Filter by import source mode (manual entries vs imported batches)',
    })
    @IsOptional()
    @IsIn(['manual', 'batches'])
    importSource?: 'manual' | 'batches';
}

function pickQueryString(raw: Record<string, unknown>, key: string): string | undefined {
    const v = raw[key];
    if (v === undefined || v === null) return undefined;
    const s = Array.isArray(v) ? String(v[0]) : String(v);
    return s === '' ? undefined : s;
}

function digitsOnly(s: string | undefined): string | undefined {
    return s != null && /^\d+$/.test(s) ? s : undefined;
}

/**
 * Build list filters from raw Express query. Used by GET /leads so the global ValidationPipe
 * never validates the whole query as a class (avoids "property assignedTo should not exist").
 */
export function parseLeadsListQuery(raw: Record<string, unknown>): GetLeadsDto {
    const page = Math.max(1, parseInt(pickQueryString(raw, 'page') ?? '1', 10) || 1);
    const limit = Math.max(1, parseInt(pickQueryString(raw, 'limit') ?? '10', 10) || 10);
    const assignmentModeStr = pickQueryString(raw, 'assignmentMode');
    const priorityStr = pickQueryString(raw, 'priority');
    const typeStr = pickQueryString(raw, 'type');
    const statusStr = pickQueryString(raw, 'status');
    const statusAliases: Record<string, string> = {
        switch_off: 'switched_off',
        switchedoff: 'switched_off',
        meeting_canceled: 'meeting_cancelled',
    };
    const assignmentModes = new Set<string>(Object.values(AssignmentMode));
    const priorities = new Set<string>(Object.values(LeadPriority));
    const types = new Set<string>(Object.values(LeadType));
    const statuses = new Set<string>(Object.values(LeadStatus));
    const presenceStr = pickQueryString(raw, 'assigneePresence');
    const assigneePresence =
        presenceStr === 'assigned' || presenceStr === 'unassigned' ? (presenceStr as 'assigned' | 'unassigned') : undefined;
    const excludeRotStr = pickQueryString(raw, 'excludeRotation');
    const excludeRotation = excludeRotStr === 'true' || excludeRotStr === '1';
    const inboundPlatformStr = pickQueryString(raw, 'inboundPlatform');
    const inboundPlatform =
        inboundPlatformStr && INBOUND_PLATFORM_SET.has(inboundPlatformStr)
            ? (inboundPlatformStr as (typeof LEAD_INBOUND_PLATFORM_VALUES)[number])
            : undefined;

    const batchKindStr = pickQueryString(raw, 'batchKind');
    const batchKind =
        batchKindStr === 'ads' || batchKindStr === 'resale' ? (batchKindStr as 'ads' | 'resale') : undefined;
    const importSourceStr = pickQueryString(raw, 'importSource');
    const importSource =
        importSourceStr === 'manual' || importSourceStr === 'batches'
            ? (importSourceStr as 'manual' | 'batches')
            : undefined;

    return {
        page,
        limit,
        assignmentMode:
            assignmentModeStr && assignmentModes.has(assignmentModeStr)
                ? (assignmentModeStr as AssignmentMode)
                : undefined,
        priority: priorityStr && priorities.has(priorityStr) ? (priorityStr as LeadPriority) : undefined,
        type: typeStr && types.has(typeStr) ? (typeStr as LeadType) : undefined,
        status:
            statusStr && statuses.has(statusAliases[statusStr] ?? statusStr)
                ? ((statusAliases[statusStr] ?? statusStr) as LeadStatus)
                : undefined,
        dateFrom: pickQueryString(raw, 'dateFrom'),
        dateTo: pickQueryString(raw, 'dateTo'),
        search: pickQueryString(raw, 'search'),
        assignedTo: digitsOnly(pickQueryString(raw, 'assignedTo')),
        previouslyAssignedTo: digitsOnly(pickQueryString(raw, 'previouslyAssignedTo')),
        assigneePresence,
        excludeRotation: excludeRotation || undefined,
        campaignId: digitsOnly(pickQueryString(raw, 'campaignId')),
        dataBatchId: digitsOnly(pickQueryString(raw, 'dataBatchId')),
        teamId: digitsOnly(pickQueryString(raw, 'teamId')),
        inboundPlatform,
        batchKind,
        importSource,
    };
}
