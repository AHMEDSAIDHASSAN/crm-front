import { IsBoolean, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';

export class PublishUnitDto {
  @ApiProperty({ description: 'Whether the unit listing is published externally' })
  @Transform(({ value }) => value === true || value === 'true' || value === 1 || value === '1')
  @IsBoolean()
  isPublished: boolean;

  @ApiPropertyOptional({
    description:
      'Published link payload. Supports plain URL or JSON string like {"places":[{"name":"Facebook","link":"https://..."}]}',
    example:
      '{"places":[{"name":"Facebook","link":"https://facebook.com/..."}]}',
  })
  @IsOptional()
  @IsString()
  publishedLink?: string;
}
