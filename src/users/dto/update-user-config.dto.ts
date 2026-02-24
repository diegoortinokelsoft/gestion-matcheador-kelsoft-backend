import { IsDefined, IsIn, IsOptional, IsString } from 'class-validator';

export class UpdateUserConfigDto {
  @IsString()
  namespace!: string;

  @IsString()
  key!: string;

  @IsDefined()
  value!: unknown;

  @IsOptional()
  @IsIn(['user', 'org'])
  scope?: 'user' | 'org';
}
