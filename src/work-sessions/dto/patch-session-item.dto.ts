import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Min } from 'class-validator';

export class PatchSessionItemDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  tasks_done?: number;

  @IsOptional()
  @IsString()
  notes?: string;
}
