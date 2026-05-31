import { IsArray, IsNumber } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class BulkUnassignLeadsDto {
    @ApiProperty({ example: [1, 2, 3], description: 'Lead IDs to clear assignee from (no status change to rotation)' })
    @IsArray()
    @IsNumber({}, { each: true })
    leadIds: number[];
}
