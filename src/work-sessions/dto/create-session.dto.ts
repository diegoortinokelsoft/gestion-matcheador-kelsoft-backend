import { Type } from 'class-transformer';
import { IsInt, Matches, Min } from 'class-validator';
import { DATE_DDMMYYYY_REGEX } from '../types/work-session.types';

export class CreateSessionDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  user_id!: number;

  @Matches(DATE_DDMMYYYY_REGEX, {
    message: 'date must be in format dd/mm/yyyy',
  })
  date!: string;
}
