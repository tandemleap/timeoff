export type OpeningBalance = {
  asOfDate: string;
  hours: number;
};

export type HoursHistoryItem = {
  effectiveDate: string;
  avgHoursPerWeek: number;
};

export type EmployeeRecord = {
  id: string;
  name: string;
  hireDate: string;
  openingBalance: OpeningBalance | null;
  hoursHistory: HoursHistoryItem[];
  ptoUsed: number;
};

export type PTOSegment = {
  start: string;
  end: string;
  weeks: number;
  avgHoursPerWeek: number;
  yearsOfService: number;
  hoursWorked: number;
  accrualRate: number;
  ptoEarned: number;
};

export type PTOResult = {
  employeeId: string;
  employeeName: string;
  hireDate: string;
  asOfDate: string;
  openingBalance: OpeningBalance | null;
  accruedSinceOpening: number;
  ptoUsed: number;
  balance: number;
  eligible: boolean;
  daysUntilEligible: number;
  segments: PTOSegment[];
};
