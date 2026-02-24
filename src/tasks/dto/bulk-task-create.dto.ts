import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, ValidateNested } from 'class-validator';
import { TaskCreateDto } from './task-create.dto';

export class BulkTaskCreateDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => TaskCreateDto)
  data!: TaskCreateDto[];
}
