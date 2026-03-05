import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, IsString, Min } from 'class-validator';

export class GenerateDailyWorkSessionsDto {
  @IsString()
  session_date!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  leader_id?: number;

  @IsOptional()
  @IsString()
  team_id?: string;

  @IsOptional()
  @IsBoolean()
  seed_items?: boolean;

  @IsOptional()
  @IsBoolean()
  allow_closed?: boolean;
}
