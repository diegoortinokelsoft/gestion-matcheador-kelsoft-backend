import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator';

export class CreateWorkSessionDto {
  @IsString()
  user_id!: string;

  @IsString()
  session_date!: string;

  @IsOptional()
  @IsIn(['OPEN', 'CLOSED'])
  session_status?: 'OPEN' | 'CLOSED';

  @IsOptional()
  @IsString()
  user_name?: string;

  @IsOptional()
  @IsString()
  user_team?: string;

  @IsOptional()
  @IsString()
  user_leader?: string;

  @IsOptional()
  @IsIn(['TASKS', 'HOURS', 'NONE'])
  goal_mode?: 'TASKS' | 'HOURS' | 'NONE';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  goal_target_total?: number;
}
