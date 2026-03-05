import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { WorkTaskType } from '../types/work-session.types';

export class UpdateItemDto {
  @IsOptional()
  @IsString()
  initiative_name?: string;

  @IsOptional()
  @IsIn(['TAG', 'SEARCH', 'OTHER'])
  task_type?: WorkTaskType;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  tasks_done_count?: number;

  @IsOptional()
  @IsString()
  notes?: string;
}
