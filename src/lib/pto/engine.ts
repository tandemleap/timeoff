export type {
  EmployeeRecord,
  HoursHistoryItem,
  OpeningBalance,
  PTOResult,
  PTOSegment,
} from "@/types/employee";

import type {
  EmployeeRecord,
  HoursHistoryItem,
  PTOResult,
  PTOSegment,
} from "@/types/employee";

// ---------------------------------------------------------------------------
// CONSTANTS
// ---------------------------------------------------------------------------

export const FULL_TIME_ANNUAL_HOURS = 2080;
export const PERSONAL_TIME_HOURS = 30;
export const SICK_LEAVE_HOURS = 40;
export const WAITING_PERIOD_DAYS = 90;

export const MS_PER_DAY = 1000 * 60 * 60 * 24;
export const MS_PER_WEEK = 7 * 24 * 3600 * 1000;

/**
 * Vacation schedule: [minimumYearsOfService, vacationHours]
 * Evaluated from highest tier to lowest; first match wins.
 */
export const VACATION_SCHEDULE: [number, number][] = [
  [0,  80],
  [5,  120],
  [6,  128],
  [7,  136],
  [8,  144],
  [9,  152],
  [10, 160],
  [11, 168],
  [12, 176],
  [13, 184],
  [14, 192],
  [15, 200],
  [16, 208],
  [17, 216],
  [18, 224],
];

// ---------------------------------------------------------------------------
// VACATION LOOKUP
// ---------------------------------------------------------------------------

/**
 * Returns the full-time vacation entitlement (hours/year) for a given number
 * of completed years of service.
 */
export function getVacationHours(yearsOfService: number): number {
  for (let i = VACATION_SCHEDULE.length - 1; i >= 0; i--) {
    const [minYears, vacationHours] = VACATION_SCHEDULE[i];
    if (yearsOfService >= minYears) {
      return vacationHours;
    }
  }
  throw new Error(
    `No vacation tier found for yearsOfService=${yearsOfService}. ` +
    `Check that VACATION_SCHEDULE includes a [0, ...] entry.`
  );
}

// ---------------------------------------------------------------------------
// ACCRUAL RATE
// ---------------------------------------------------------------------------

export function getAccrualRate(yearsOfService: number): {
  accrualRate: number;
  totalAnnualPTO: number;
  vacationHours: number;
  personalHours: number;
  sickHours: number;
} {
  const vacationHours  = getVacationHours(yearsOfService);
  const personalHours  = PERSONAL_TIME_HOURS;
  const sickHours      = SICK_LEAVE_HOURS;
  const totalAnnualPTO = personalHours + sickHours + vacationHours;
  const accrualRate    = totalAnnualPTO / FULL_TIME_ANNUAL_HOURS;

  return { accrualRate, totalAnnualPTO, vacationHours, personalHours, sickHours };
}

// ---------------------------------------------------------------------------
// PRIMARY CALCULATION
// ---------------------------------------------------------------------------

export function calculatePTOAccrual(
  hoursWorked: number,
  yearsOfService: number
): {
  hoursWorked: number;
  yearsOfService: number;
  ptoEarned: number;
  accrualRate: number;
  totalAnnualPTO: number;
  vacationHours: number;
  personalHours: number;
  sickHours: number;
} {
  const rateBreakdown = getAccrualRate(yearsOfService);
  const ptoEarned     = hoursWorked * rateBreakdown.accrualRate;

  return {
    hoursWorked,
    yearsOfService,
    ptoEarned,
    ...rateBreakdown,
  };
}

// ---------------------------------------------------------------------------
// WAITING PERIOD HELPER
// ---------------------------------------------------------------------------

export function isPTOEligible(
  hireDate: Date | string,
  asOfDate?: Date | string
): {
  eligible: boolean;
  waitingPeriodDays: number;
  daysEmployed: number;
  daysRemaining: number;
} {
  const hire = new Date(hireDate);
  const asOf = new Date(asOfDate ?? new Date());

  if (isNaN(hire.getTime())) throw new Error(`Invalid hireDate: ${hireDate}`);
  if (isNaN(asOf.getTime())) throw new Error(`Invalid asOfDate: ${asOfDate}`);

  const daysEmployed  = Math.floor((asOf.getTime() - hire.getTime()) / MS_PER_DAY);
  const daysRemaining = Math.max(0, WAITING_PERIOD_DAYS - daysEmployed);
  const eligible      = daysEmployed >= WAITING_PERIOD_DAYS;

  return { eligible, waitingPeriodDays: WAITING_PERIOD_DAYS, daysEmployed, daysRemaining };
}

// ---------------------------------------------------------------------------
// DATE UTILITIES
// ---------------------------------------------------------------------------

/**
 * Returns completed whole years between two dates.
 */
export function completedYears(hireDate: Date, asOf: Date): number {
  let years = asOf.getFullYear() - hireDate.getFullYear();
  const monthDiff = asOf.getMonth() - hireDate.getMonth();
  const dayDiff   = asOf.getDate()  - hireDate.getDate();
  if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) years--;
  return Math.max(0, years);
}

/**
 * Returns a new Date exactly `years` whole years after `baseDate`.
 */
export function addYears(baseDate: Date, years: number): Date {
  const d = new Date(baseDate);
  d.setFullYear(d.getFullYear() + years);
  return d;
}

// ---------------------------------------------------------------------------
// ACTIVE HOURS LOOKUP
// ---------------------------------------------------------------------------

/**
 * Returns the avgHoursPerWeek in effect at a given point in time.
 * The first history entry is applied retroactively for any date before it.
 * Returns 0 if hoursHistory is empty.
 */
export function getActiveHoursPerWeek(
  hoursHistory: HoursHistoryItem[],
  atDate: Date
): number {
  if (!hoursHistory || hoursHistory.length === 0) return 0;

  let active = hoursHistory[0];
  for (const entry of hoursHistory) {
    if (new Date(entry.effectiveDate) <= atDate) {
      active = entry;
    }
  }
  return active.avgHoursPerWeek;
}

// ---------------------------------------------------------------------------
// SEGMENTATION
// ---------------------------------------------------------------------------

/**
 * Builds the list of boundary dates that split an employee's timeline into
 * constant-rate segments.
 *
 * - hireDate is used for vacation tier anniversaries (years 5–18)
 * - accrualStart is the beginning of the accrual window (may differ from hireDate)
 * - hoursHistory effective dates strictly between accrualStart and asOfDate
 */
export function buildSegmentBoundaries(
  hireDate: Date,
  accrualStart: Date,
  hoursHistory: HoursHistoryItem[],
  asOfDate: Date
): Date[] {
  const set = new Map<number, Date>();

  function addBoundary(d: Date) {
    set.set(d.getTime(), d);
  }

  addBoundary(new Date(accrualStart));
  addBoundary(new Date(asOfDate));

  // Hours-history change dates strictly between accrualStart and asOfDate
  for (const entry of hoursHistory) {
    const d = new Date(entry.effectiveDate);
    if (d > accrualStart && d < asOfDate) addBoundary(d);
  }

  // Vacation-tier anniversary dates measured from hireDate (years 5–18)
  const tierChangeYears = VACATION_SCHEDULE.slice(1).map(([y]) => y);
  for (const y of tierChangeYears) {
    const anniversary = addYears(hireDate, y);
    if (anniversary > accrualStart && anniversary < asOfDate) addBoundary(anniversary);
  }

  return Array.from(set.values()).sort((a, b) => a.getTime() - b.getTime());
}

// ---------------------------------------------------------------------------
// CORE ACCRUAL COMPUTATION
// ---------------------------------------------------------------------------

export function computeEmployeePTO(
  employee: EmployeeRecord,
  asOfDate?: Date | string
): PTOResult {
  const hire = new Date(employee.hireDate);
  const asOf = new Date(asOfDate ?? new Date());

  if (isNaN(hire.getTime())) throw new Error(`Invalid employee hireDate: ${employee.hireDate}`);
  if (isNaN(asOf.getTime())) throw new Error(`Invalid asOfDate: ${asOfDate}`);
  if (asOf < hire)           throw new Error("asOfDate cannot be before hireDate.");

  // Eligibility check always uses hireDate.
  const eligibility = isPTOEligible(hire, asOf);

  const ob           = employee.openingBalance;
  const accrualStart = ob ? new Date(ob.asOfDate) : hire;
  const openingHours = ob ? ob.hours : 0;

  if (asOf < accrualStart) {
    return {
      employeeId:          employee.id,
      employeeName:        employee.name,
      hireDate:            employee.hireDate,
      asOfDate:            asOf.toISOString().slice(0, 10),
      openingBalance:      ob ?? null,
      accruedSinceOpening: 0,
      ptoUsed:             employee.ptoUsed,
      balance:             Math.max(0, openingHours - employee.ptoUsed),
      eligible:            eligibility.eligible,
      daysUntilEligible:   eligibility.daysRemaining,
      segments:            [],
    };
  }

  const boundaries = buildSegmentBoundaries(hire, accrualStart, employee.hoursHistory, asOf);

  let accruedSinceOpening = 0;
  const segments: PTOSegment[] = [];

  for (let i = 0; i < boundaries.length - 1; i++) {
    const start = boundaries[i];
    const end   = boundaries[i + 1];

    const midpoint        = new Date((start.getTime() + end.getTime()) / 2);
    const avgHoursPerWeek = getActiveHoursPerWeek(employee.hoursHistory, midpoint);
    const yearsOfService  = completedYears(hire, start);
    const weeks           = (end.getTime() - start.getTime()) / MS_PER_WEEK;
    const hoursWorked     = weeks * avgHoursPerWeek;
    const accrual         = calculatePTOAccrual(hoursWorked, yearsOfService);

    accruedSinceOpening += accrual.ptoEarned;

    segments.push({
      start:           start.toISOString().slice(0, 10),
      end:             end.toISOString().slice(0, 10),
      weeks:           parseFloat(weeks.toFixed(4)),
      avgHoursPerWeek,
      yearsOfService,
      hoursWorked:     parseFloat(hoursWorked.toFixed(4)),
      accrualRate:     accrual.accrualRate,
      ptoEarned:       parseFloat(accrual.ptoEarned.toFixed(4)),
    });
  }

  const balance = Math.max(0, openingHours + accruedSinceOpening - employee.ptoUsed);

  return {
    employeeId:          employee.id,
    employeeName:        employee.name,
    hireDate:            employee.hireDate,
    asOfDate:            asOf.toISOString().slice(0, 10),
    openingBalance:      ob ?? null,
    accruedSinceOpening: parseFloat(accruedSinceOpening.toFixed(4)),
    ptoUsed:             employee.ptoUsed,
    balance:             parseFloat(balance.toFixed(4)),
    eligible:            eligibility.eligible,
    daysUntilEligible:   eligibility.daysRemaining,
    segments,
  };
}
