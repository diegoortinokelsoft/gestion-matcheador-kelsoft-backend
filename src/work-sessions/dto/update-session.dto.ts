import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { WorkSessionStatus } from '../types/work-session.types';

export class UpdateSessionDto {
  @IsOptional()
  @IsString()
  user_name?: string;

  @IsOptional()
  @IsString()
  user_team?: string;

  @IsOptional()
  @IsIn(['DRAFT', 'FINAL', 'VOID'])
  session_status?: WorkSessionStatus;

  @IsOptional()
  @IsString()
  closed_at?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  closed_by?: number;
}
