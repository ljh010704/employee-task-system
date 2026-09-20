export type UserRole = 'admin' | 'employee';
export type TaskStatus = 'todo' | 'in_progress' | 'review' | 'done';
export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';

export interface Profile {
  id: string;
  email?: string;
  full_name: string;
  role: UserRole;
  created_at: string;
}

export interface Task {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  creator_id: string | null;
  assignee_id: string | null;
  due_date: string | null;
  is_daily?: boolean;
  daily_completed_today?: boolean;
  daily_status_today?: TaskStatus;
  created_at: string;
  updated_at: string;
}

export interface TaskLog {
  id: string;
  task_id: string;
  operator_id: string;
  action: string;
  comment: string | null;
  created_at: string;
}

export interface DailyCompletion {
  task_id: string;
  completion_date: string;
  status: TaskStatus;
  operator_id: string;
  comment: string | null;
  created_at: string;
  updated_at: string;
}
