export type UserRole = 'ADMIN' | 'LEADER' | 'USER';

export interface AuthUser {
  sub: number;
  user_id: number;
  role: UserRole;
  leader_id?: number | null;
}
