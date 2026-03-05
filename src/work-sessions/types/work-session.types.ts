export const DATE_DDMMYYYY_REGEX = /^\d{2}\/\d{2}\/\d{4}$/;
export const DATETIME_DDMMYYYY_HHMM_REGEX = /^\d{2}\/\d{2}\/\d{4}\s\d{2}:\d{2}$/;

export type WorkSessionStatus = 'DRAFT' | 'FINAL' | 'VOID';
export type WorkTaskType = 'TAG' | 'SEARCH' | 'OTHER';

export interface WorkSessionRecord extends Record<string, unknown> {
  session_id: string;
  session_date: string;
  user_id: number;
  user_name?: string;
  user_team?: string;
  session_status?: WorkSessionStatus | string;
  closed_at?: string;
  closed_by?: number | string;
  created_at?: string;
  updated_at?: string;
  updated_by?: number | string;
}

export interface WorkSessionItemRecord extends Record<string, unknown> {
  item_id: string;
  session_id: string;
  session_date?: string;
  user_id?: number;
  initiative_id?: string;
  initiative_name?: string;
  task_type?: WorkTaskType | string;
  tasks_done_count?: number;
  notes?: string;
  created_at?: string;
  updated_at?: string;
  updated_by?: number | string;
}
