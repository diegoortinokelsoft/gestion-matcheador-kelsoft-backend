import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { WorkTaskType } from '../types/work-session.types';

export class CreateItemDto {
  @IsString()
  initiative_id!: string;

  @IsString()
  initiative_name!: string;

  @IsIn(['TAG', 'SEARCH', 'OTHER'])
  task_type!: WorkTaskType;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  tasks_done_count!: number;

  @IsOptional()
  @IsString()
  notes?: string;
}
