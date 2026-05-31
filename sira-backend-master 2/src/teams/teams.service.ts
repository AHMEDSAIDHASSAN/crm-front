import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../config/prisma.service';
import { getVisibleTeamIds } from '../common/subordinates.helper';
import { CreateTeamDto } from './dto/create-team.dto';
import { UpdateTeamDto } from './dto/update-team.dto';

@Injectable()
export class TeamsService {
  constructor(private prisma: PrismaService) { }

  private async mapAssignedLeadCountsByTeam(teamIds: bigint[]): Promise<Map<string, number>> {
    const counts = new Map<string, number>();
    if (teamIds.length === 0) return counts;

    const teamUsers = await this.prisma.user.findMany({
      where: { teamId: { in: teamIds } },
      select: { id: true, teamId: true },
    });
    if (teamUsers.length === 0) return counts;

    const userToTeam = new Map<string, string>();
    const userIds: bigint[] = [];
    for (const u of teamUsers) {
      if (u.teamId == null) continue;
      const uid = String(u.id);
      userIds.push(u.id);
      userToTeam.set(uid, String(u.teamId));
    }
    if (userIds.length === 0) return counts;

    const grouped = await this.prisma.lead.groupBy({
      by: ['assignedTo'],
      where: { assignedTo: { in: userIds } },
      _count: { id: true },
    });
    for (const g of grouped) {
      if (g.assignedTo == null) continue;
      const teamKey = userToTeam.get(String(g.assignedTo));
      if (!teamKey) continue;
      counts.set(teamKey, (counts.get(teamKey) ?? 0) + Number(g._count.id || 0));
    }
    return counts;
  }

  create(createTeamDto: CreateTeamDto) {
    return this.prisma.team.create({
      data: createTeamDto,
      include: {
        teamLeader: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });
  }

  findAll(viewerId: number, viewerRole: string) {
    return this.findAllScoped(viewerId, viewerRole);
  }

  private async findAllScoped(viewerId: number, viewerRole: string) {
    const visible = await getVisibleTeamIds(this.prisma, viewerId, viewerRole);
    const where = visible === null ? {} : { id: { in: visible } };
    const rows = await this.prisma.team.findMany({
      where,
      include: {
        teamLeader: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
        _count: {
          select: {
            members: true,
            leads: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    const ids = rows.map((t) => BigInt(t.id));
    const assignedLeadCounts = await this.mapAssignedLeadCountsByTeam(ids);
    return rows.map((t) => ({
      ...t,
      _count: {
        ...t._count,
        // Count only leads currently assigned to users in this team.
        leads: assignedLeadCounts.get(String(t.id)) ?? 0,
      },
    }));
  }

  private readonly memberLeadSelect = {
    id: true,
    firstName: true,
    lastName: true,
    phone: true,
    email: true,
    status: true,
    priority: true,
    assignedAt: true,
    updatedAt: true,
  } as const;

  private async loadTeamWithDetails(teamId: bigint) {
    const team = await this.prisma.team.findUnique({
      where: { id: teamId },
      include: {
        teamLeader: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            role: true,
            assignedLeads: {
              where: { teamId: teamId },
              orderBy: { updatedAt: 'desc' },
              select: this.memberLeadSelect,
            },
          },
        },
        members: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            role: true,
            title: true,
            status: true,
            assignedLeads: {
              where: { teamId: teamId },
              orderBy: { updatedAt: 'desc' },
              select: this.memberLeadSelect,
            },
          },
        },
        _count: {
          select: {
            leads: true,
          },
        },
      },
    });
    if (!team) {
      throw new NotFoundException(`Team with ID ${teamId} not found`);
    }
    const assignedLeadCount = await this.prisma.lead.count({
      where: { assignedUser: { teamId } },
    });
    team._count = {
      ...team._count,
      leads: assignedLeadCount,
    };
    return team;
  }

  async findOne(id: number, viewerId: number, viewerRole: string) {
    const teamId = BigInt(id);
    const visible = await getVisibleTeamIds(this.prisma, viewerId, viewerRole);
    if (visible !== null && !visible.includes(teamId)) {
      throw new ForbiddenException('You cannot view this team');
    }
    return this.loadTeamWithDetails(teamId);
  }

  async update(id: number, updateTeamDto: UpdateTeamDto) {
    await this.loadTeamWithDetails(BigInt(id));

    return this.prisma.team.update({
      where: { id },
      data: updateTeamDto,
      include: {
        teamLeader: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });
  }

  async remove(id: number) {
    await this.loadTeamWithDetails(BigInt(id));

    return this.prisma.team.delete({
      where: { id },
    });
  }
}
