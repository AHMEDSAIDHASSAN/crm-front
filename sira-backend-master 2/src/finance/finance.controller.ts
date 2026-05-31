import { Body, Controller, Get, Param, Patch, Post, Request, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles, RolesGuard } from '../auth/guards/roles.guard';
import { FinanceService } from './finance.service';
import { CreateSalesDeductionDto } from './dto/create-deduction.dto';
import { CreateSalesCommissionDto } from './dto/create-commission.dto';

@ApiTags('Finance')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('finance')
export class FinanceController {
  constructor(private readonly finance: FinanceService) {}

  @Get('sales-overview')
  @Roles('super_admin', 'hr')
  @ApiOperation({
    summary: 'Sales team financial overview — salary, deductions, commissions',
  })
  overview() {
    return this.finance.getSalesOverview();
  }

  @Post('deductions')
  @Roles('super_admin', 'hr')
  @ApiOperation({ summary: 'Add a salary deduction for a sales employee' })
  createDeduction(@Body() dto: CreateSalesDeductionDto, @Request() req: any) {
    return this.finance.createDeduction(dto, Number(req.user.userId));
  }

  @Post('commissions')
  @Roles('super_admin', 'hr')
  @ApiOperation({ summary: 'Register a new commission (pending collection until marked)' })
  createCommission(@Body() dto: CreateSalesCommissionDto, @Request() req: any) {
    return this.finance.createCommission(
      {
        userId: dto.userId,
        title: dto.title,
        saleDate: dto.saleDate,
        dueNote: dto.dueNote,
        amount: dto.amount,
      },
      Number(req.user.userId),
    );
  }

  @Patch('commissions/:id/collect')
  @Roles('super_admin', 'hr')
  @ApiOperation({
    summary: 'Mark commission as collected (company received from developer — employee entitled)',
  })
  collectCommission(@Param('id') id: string, @Request() req: any) {
    return this.finance.markCommissionCollected(+id, Number(req.user.userId));
  }
}
