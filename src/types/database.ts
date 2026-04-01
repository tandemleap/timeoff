export type Employee = {
  id: string;
  user_id: string;           // FK → auth.users.id
  name: string;
  hire_date: string;         // ISO date
  opening_balance_date: string | null;
  opening_balance_hours: number | null;
  created_at: string;
  updated_at: string;
};

export type HoursHistoryEntry = {
  id: string;
  employee_id: string;
  effective_date: string;    // ISO date
  avg_hours_per_week: number;
  created_at: string;
};

export type PTOUsageRecord = {
  id: string;
  employee_id: string;
  usage_date: string;        // ISO date
  hours_used: number;
  note: string | null;
  created_at: string;
};
