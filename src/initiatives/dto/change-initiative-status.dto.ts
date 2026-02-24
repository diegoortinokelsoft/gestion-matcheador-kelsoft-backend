import { IsIn } from 'class-validator';

export class ChangeInitiativeStatusDto {
  @IsIn(['DRAFT', 'ACTIVE', 'PAUSED', 'DONE', 'ARCHIVED'])
  status!: 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'DONE' | 'ARCHIVED';
}
