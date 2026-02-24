import { IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator';

export class CreateInitiativeDto {
  @IsString()
  initiative_name!: string;

  @IsIn(['TAG', 'SEARCH', 'OTHER'])
  initiative_task_type!: 'TAG' | 'SEARCH' | 'OTHER';

  @IsInt()
  @Min(1)
  initiative_task_count_target!: number;

  @IsOptional()
  @IsString()
  initiative_insumo_url?: string;

  @IsOptional()
  @IsString()
  initiative_workplace_url?: string;

  @IsOptional()
  @IsString()
  initiative_notes?: string;

  @IsOptional()
  @IsIn(['DRAFT', 'ACTIVE', 'PAUSED', 'DONE', 'ARCHIVED'])
  initiative_status?: 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'DONE' | 'ARCHIVED';
}
