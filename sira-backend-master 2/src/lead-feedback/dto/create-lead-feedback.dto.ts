import { IsInt, IsEnum, IsString, IsOptional, IsDateString, IsIn, IsNotEmpty } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { LeadStatus } from '@prisma/client';

export class CreateLeadFeedbackDto {
    @ApiProperty()
    @IsInt()
    leadId: number;

    @ApiProperty()
    @IsInt()
    userId: number;

    @ApiProperty()
    @IsIn(['new_lead', 'cold_call', 'follow_up', 'qualified', 'no_answer', 'wrong_number', 'not_interested', 'purchased', 'assigned', 'switched_off', 'meeting_cancelled', 'closed', 'lost', 'interested', 'contacted', 'converted'])
    feedbackType: string;

    @ApiProperty()
    @IsString()
    @IsNotEmpty({ message: 'Feedback description is required' })
    description: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    nextAction?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsDateString()
    nextActionDate?: string;

    @ApiPropertyOptional({ description: 'Call duration in seconds' })
    @IsOptional()
    @IsInt()
    callDuration?: number;
}
