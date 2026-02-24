import { Type } from 'class-transformer';
import { IsInt, IsString, Min } from 'class-validator';

export class UpsertSessionItemDto {
  @IsString()
  initiative_id!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  tasks_done!: number;
}
