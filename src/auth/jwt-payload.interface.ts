import { UserRole } from '../common/interfaces/auth-user.interface';

export interface JwtPayload {
  sub: number;
  role: UserRole;
  leader_id?: number | null;
}


