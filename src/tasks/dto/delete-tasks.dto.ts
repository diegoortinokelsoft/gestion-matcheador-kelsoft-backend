import { IsArray, ArrayMinSize, IsString } from 'class-validator';

export class DeleteTasksDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  task_ids!: string[];
}
