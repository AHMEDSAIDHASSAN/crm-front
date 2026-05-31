import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../config/prisma.service';

const SALES_ROLE = 'sales';

@Injectable()
export class FinanceService {
  constructor(private prisma: PrismaService) {}

  private async assertSalesUser(userId: number) {
    const user = await this.prisma.user.findUnique({
      where: { id: BigInt(userId) },
      include: { role: { select: { name: true } } },
    });
    if (!user) throw new NotFoundException(`User #${userId} not found`);
    if (user.role.name !== SALES_ROLE) {
      throw new BadRequestException('Finance records apply to sales team members only');
    }
    return user;
  }

  /** Sales roster with basic salary, all deductions, commissions, and totals. */
  async getSalesOverview() {
    const salesUsers = await this.prisma.user.findMany({
      where: { role: { name: SALES_ROLE }, status: 'active' },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        salary: true,
        title: true,
        team: { select: { id: true, name: true } },
      },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
    });

    const ids = salesUsers.map((u) => u.id);
    if (ids.length === 0) return { employees: [] };

    const [deductions, commissions] = await Promise.all([
      this.prisma.salesSalaryDeduction.findMany({
        where: { userId: { in: ids } },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.salesCommission.findMany({
        where: { userId: { in: ids } },
        orderBy: { saleDate: 'desc' },
      }),
    ]);

    const dedByUser = new Map<string, typeof deductions>();
    const comByUser = new Map<string, typeof commissions>();
    for (const d of deductions) {
      const k = d.userId.toString();
      if (!dedByUser.has(k)) dedByUser.set(k, []);
      dedByUser.get(k)!.push(d);
    }
    for (const c of commissions) {
      const k = c.userId.toString();
      if (!comByUser.has(k)) comByUser.set(k, []);
      comByUser.get(k)!.push(c);
    }

    return {
      employees: salesUsers.map((u) => {
        const uid = u.id.toString();
        const dlist = dedByUser.get(uid) ?? [];
        const clist = comByUser.get(uid) ?? [];
        const deductionsTotal = dlist.reduce((s, d) => s + Number(d.amount), 0);
        const basicSalary = Number(u.salary ?? 0);
        const pendingCommissions = clist.filter((c) => c.status === 'pending_collection');
        const collectedCommissions = clist.filter((c) => c.status === 'collected');
        return {
          id: u.id,
          firstName: u.firstName,
          lastName: u.lastName,
          email: u.email,
          phone: u.phone,
          title: u.title,
          team: u.team,
          basicSalary,
          deductions: dlist.map((d) => ({
            id: d.id,
            amount: Number(d.amount),
            reason: d.reason,
            createdAt: d.createdAt,
          })),
          deductionsTotal,
          netAfterDeductions: Math.max(0, basicSalary - deductionsTotal),
          commissions: clist.map((c) => ({
            id: c.id,
            title: c.title,
            amount: c.amount != null ? Number(c.amount) : null,
            saleDate: c.saleDate,
            dueNote: c.dueNote,
            status: c.status,
            collectedAt: c.collectedAt,
            createdAt: c.createdAt,
          })),
          commissionsPendingCount: pendingCommissions.length,
          commissionsCollectedCount: collectedCommissions.length,
        };
      }),
    };
  }

  async createDeduction(dto: { userId: number; amount: number; reason: string }, actorId: number) {
    await this.assertSalesUser(dto.userId);
    return this.prisma.salesSalaryDeduction.create({
      data: {
        userId: BigInt(dto.userId),
        amount: dto.amount,
        reason: dto.reason.trim(),
        createdById: BigInt(actorId),
      },
    });
  }

  async createCommission(
    dto: {
      userId: number;
      title: string;
      saleDate: string;
      dueNote?: string;
      amount?: number;
    },
    actorId: number,
  ) {
    await this.assertSalesUser(dto.userId);
    const saleDate = new Date(dto.saleDate);
    if (Number.isNaN(saleDate.getTime())) {
      throw new BadRequestException('Invalid sale date');
    }
    return this.prisma.salesCommission.create({
      data: {
        userId: BigInt(dto.userId),
        title: dto.title.trim(),
        saleDate,
        dueNote: dto.dueNote?.trim() || null,
        amount: dto.amount != null ? dto.amount : null,
        createdById: BigInt(actorId),
      },
    });
  }

  async markCommissionCollected(id: number, _actorId: number) {
    const row = await this.prisma.salesCommission.findUnique({
      where: { id: BigInt(id) },
    });
    if (!row) throw new NotFoundException(`Commission #${id} not found`);
    if (row.status === 'collected') {
      throw new BadRequestException('Commission is already marked as collected');
    }
    return this.prisma.salesCommission.update({
      where: { id: BigInt(id) },
      data: {
        status: 'collected',
        collectedAt: new Date(),
      },
    });
  }
}
