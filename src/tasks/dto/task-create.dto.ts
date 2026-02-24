import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, IsUrl, Min } from 'class-validator';

export class TaskCreateDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  user_id!: number;

  @IsString()
  task_name!: string;

  @IsOptional()
  @IsString()
  task_link?: string;

  @IsOptional()
  @IsString()
  task_notes?: string;
}
