import { Injectable } from '@nestjs/common';
import { PrismaService } from '../config/prisma.service';
import { getReachableUserIds } from '../common/subordinates.helper';

@Injectable()
export class DashboardService {
    constructor(private prisma: PrismaService) { }

    async getStats(currentUserId?: number, currentRole?: string) {
        const leadWhere: any = {};
        const unitWhere: any = {};

        const reachable =
            currentUserId != null && currentRole
                ? await getReachableUserIds(this.prisma, Number(currentUserId), currentRole)
                : null;

        let meetingWhere: Record<string, unknown> = {};
        if (currentRole === 'super_admin') {
            meetingWhere = {};
        } else if (reachable === null) {
            meetingWhere = {};
        } else if (reachable.length === 0) {
            meetingWhere = { scheduledBy: { in: [] as bigint[] } };
        } else {
            meetingWhere = { scheduledBy: { in: reachable } };
        }

        // Role-based visibility filtering (same logic as LeadsService)
        if (currentRole && currentRole !== 'super_admin' && currentRole !== 'operation_manager') {
            const userId = BigInt(currentUserId);
            if (currentRole === 'sales') {
                leadWhere.assignedTo = userId;
                unitWhere.OR = [{ createdBy: userId }, { isPublished: true }];
            } else if (currentRole === 'tech_lead') {
                leadWhere.OR = [
                    { assignedTo: userId },
                    { team: { teamLeaderId: userId } },
                ];
                unitWhere.status = 'available';
            }
        } else {
            unitWhere.status = 'available';
        }

        const salesUserFilter =
            reachable === null
                ? undefined
                : ({ id: { in: reachable } } as const);

        const [totalLeads, activeUnits, totalMeetings, convertedLeads, totalTeams, activeTeams, totalUsers, activeUsers, unassignedLeads, campaignsCount, agentsCount] =
            await Promise.all([
                this.prisma.lead.count({ where: leadWhere }),
                this.prisma.unit.count({ where: unitWhere }),
                this.prisma.meeting.count({ where: meetingWhere }),
                this.prisma.lead.count({ where: { ...leadWhere, status: 'purchased' } }),
                this.prisma.team.count(),
                this.prisma.team.count({ where: { status: 'active' } }),
                this.prisma.user.count(),
                this.prisma.user.count({ where: { status: 'active' } }),
                this.prisma.lead.count({ where: { ...leadWhere, assignedTo: null } }),
                this.prisma.campaign.count({ where: { status: 'active' } }),
                this.prisma.user.count({
                    where: {
                        status: 'active',
                        role: { name: 'sales' },
                        ...(salesUserFilter ?? {}),
                    },
                }),
            ]);

        const conversionRate = totalLeads > 0
            ? ((convertedLeads / totalLeads) * 100).toFixed(1)
            : '0';

        // Get recent lead activity
        const recentLeads = await this.prisma.lead.findMany({
            where: leadWhere,
            take: 5,
            orderBy: { createdAt: 'desc' },
            include: {
                assignedUser: {
                    select: {
                        firstName: true,
                        lastName: true,
                    }
                }
            }
        });

        // Sales fleet — aligned with sira-dashboard KPI + performance list (scoped)
        const fleetUsers = await this.prisma.user.findMany({
            where: {
                status: 'active',
                role: { name: 'sales' },
                ...(salesUserFilter ?? {}),
            },
            select: {
                id: true,
                firstName: true,
                lastName: true,
                _count: { select: { assignedLeads: true } },
            },
            take: 20,
        });
        fleetUsers.sort((a, b) => b._count.assignedLeads - a._count.assignedLeads);
        const fleetSlice = fleetUsers.slice(0, 8);
        const fleetIds = fleetSlice.map((u) => u.id);
        const purchasedByAgent =
            fleetIds.length > 0
                ? await this.prisma.lead.groupBy({
                      by: ['assignedTo'],
                      where: { assignedTo: { in: fleetIds }, status: 'purchased' },
                      _count: { id: true },
                  })
                : [];
        const purchasedMap = new Map<string, number>();
        for (const row of purchasedByAgent) {
            if (row.assignedTo != null) purchasedMap.set(String(row.assignedTo), row._count.id);
        }
        const agentFleet = fleetSlice.map((u) => {
            const load = u._count.assignedLeads;
            const won = purchasedMap.get(String(u.id)) ?? 0;
            const conversionPct = load > 0 ? Math.round((won / load) * 100) : 0;
            return {
                id: u.id.toString(),
                name: `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() || '—',
                load,
                conversionPct,
            };
        });

        const kpis = {
            agents: agentsCount,
            campaigns: campaignsCount,
            leads: totalLeads,
            meetings: totalMeetings,
        };

        // Top performer = user who scheduled the most meetings (same visibility scope as meeting totals)
        let topPerformer = null;
        const topPerformerRoles = ['super_admin', 'operation_manager', 'sales_manager', 'tech_lead', 'sales'];
        if (!currentRole || topPerformerRoles.includes(currentRole)) {
            const topSchedulers = await this.prisma.meeting.groupBy({
                by: ['scheduledBy'],
                where: meetingWhere as any,
                _count: { id: true },
                orderBy: { _count: { id: 'desc' } },
                take: 1,
            });

            if (topSchedulers.length > 0) {
                const user = await this.prisma.user.findUnique({
                    where: { id: topSchedulers[0].scheduledBy },
                    select: { firstName: true, lastName: true },
                });
                if (user) {
                    topPerformer = {
                        name: `${user.firstName} ${user.lastName}`.trim(),
                        meetingCount: topSchedulers[0]._count.id,
                    };
                }
            }
        }

        return {
            stats: [
                { label: 'Total Leads', value: totalLeads.toLocaleString(), change: '+0%', icon: 'Users', color: 'bg-blue-500' },
                { label: 'Active Units', value: activeUnits.toLocaleString(), change: '+0%', icon: 'Home', color: 'bg-secondary' },
                { label: 'Meetings', value: totalMeetings.toLocaleString(), change: '+0%', icon: 'Calendar', color: 'bg-emerald-500' },
                { label: 'Total Teams', value: totalTeams.toLocaleString(), change: '+0%', icon: 'Users', color: 'bg-indigo-500' },
                { label: 'Conversion', value: `${conversionRate}%`, change: '+0%', icon: 'TrendingUp', color: 'bg-purple-500' },
            ],
            summary: {
                totalLeads,
                activeUnits,
                totalMeetings,
                convertedLeads,
                conversionRate: Number(conversionRate),
                teams: {
                    total: totalTeams,
                    active: activeTeams,
                },
                users: {
                    total: totalUsers,
                    active: activeUsers,
                },
                unassignedLeads,
            },
            recentLeads: recentLeads.map(l => ({
                id: l.id.toString(),
                firstName: l.firstName || '',
                lastName: l.lastName || '',
                name: `${l.firstName || ''} ${l.lastName || ''}`.trim() || 'Anonymous',
                status: l.status,
                createdAt: l.createdAt,
                assignedTo: l.assignedUser ? `${l.assignedUser.firstName} ${l.assignedUser.lastName}` : 'Unassigned'
            })),
            topPerformer,
            kpis,
            agentFleet,
        };
    }
}
