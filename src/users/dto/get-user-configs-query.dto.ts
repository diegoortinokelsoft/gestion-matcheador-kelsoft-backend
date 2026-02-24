import { IsOptional, IsString } from 'class-validator';

export class GetUserConfigsQueryDto {
  @IsOptional()
  @IsString()
  namespace?: string;
}
