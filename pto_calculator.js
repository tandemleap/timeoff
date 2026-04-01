/**
 * PTO Calculator for LTE (Limited Term, Part-Time) Employees
 *
 * PURPOSE:
 *   This module calculates PTO accrual for LTE employees who do not officially
 *   qualify for PTO under the County policy. The system is proportional and
 *   transparent: PTO is earned based on actual hours worked, not front-loaded.
 *
 * CORE ASSUMPTIONS:
 *   - Full-time baseline = 40 hours/week = 2,080 hours/year
 *   - 1 work day = 8 hours
 *   - PTO accrues on every hour worked (including during the 90-day waiting period)
 *   - PTO cannot be USED until 90 days of employment have passed
 *   - PTO balance cannot go negative (default behavior)
 *
 * FULL-TIME PTO COMPONENTS (per year):
 *   - Personal Time:  30 hours  (fixed, does not change with tenure)
 *   - Sick Leave:     40 hours  (fixed, does not change with tenure)
 *   - Vacation:       variable  (increases with years of service — see VACATION_SCHEDULE)
 *
 * ACCRUAL FORMULA:
 *   Accrual Rate = Total Annual PTO / 2080
 *   PTO Earned   = Hours Worked × Accrual Rate
 */

// ---------------------------------------------------------------------------
// CONSTANTS — Adjust these values if the underlying policy changes
// ---------------------------------------------------------------------------

/** Full-time annual hours. Used as the denominator in all accrual rate calculations. */
const FULL_TIME_ANNUAL_HOURS = 2080;

/** Fixed personal time component (hours/year, full-time equivalent). */
const PERSONAL_TIME_HOURS = 30;

/** Fixed sick leave component (hours/year, full-time equivalent). */
const SICK_LEAVE_HOURS = 40;

/**
 * Waiting period in days before PTO may be USED.
 * PTO still accrues during this period — it just cannot be drawn down.
 */
const WAITING_PERIOD_DAYS = 90;

/**
 * VACATION SCHEDULE
 *
 * Maps the START of a tenure band (in years) to the full-time vacation
 * entitlement for that band (in hours/year).
 *
 * Derivation:
 *   - 1 work day = 8 hours
 *   - 0–4  years: 10 days = 80 hours
 *   - 5    years: 15 days = 120 hours
 *   - 6    years: 16 days = 128 hours
 *   - 7    years: 17 days = 136 hours
 *   - 8    years: 18 days = 144 hours
 *   - 9    years: 19 days = 152 hours
 *   - 10+  years: 20 days = 160 hours, continuing to a max of 224 hours
 *
 * NOTE: The schedule below covers through 27 years based on 8-hour increments.
 * Extend the array if your policy goes further.
 *
 * Format: [minimumYearsOfService, vacationHours]
 * Rules are evaluated from HIGHEST tenure to LOWEST; the first match wins.
 */
const VACATION_SCHEDULE = [
  // [minYears, vacationHours]
  [0,  80],   // 0–4 years:  10 days
  [5,  120],  // 5 years:    15 days
  [6,  128],  // 6 years:    16 days
  [7,  136],  // 7 years:    17 days
  [8,  144],  // 8 years:    18 days
  [9,  152],  // 9 years:    19 days
  [10, 160],  // 10 years:   20 days
  [11, 168],  // 11 years:   21 days
  [12, 176],  // 12 years:   22 days
  [13, 184],  // 13 years:   23 days
  [14, 192],  // 14 years:   24 days
  [15, 200],  // 15 years:   25 days
  [16, 208],  // 16 years:   26 days
  [17, 216],  // 17 years:   27 days
  [18, 224],  // 18+ years:  28 days (MAX)
];

// ---------------------------------------------------------------------------
// VACATION LOOKUP
// ---------------------------------------------------------------------------

/**
 * Returns the full-time vacation entitlement (hours/year) for a given number
 * of completed years of service.
 *
 * @param {number} yearsOfService - Completed full years of employment (integer or float).
 * @returns {number} Vacation hours (full-time equivalent) for this tenure band.
 *
 * @example
 *   getVacationHours(0)   // → 80  (0–4 year band)
 *   getVacationHours(4.9) // → 80  (still in 0–4 year band)
 *   getVacationHours(5)   // → 120
 *   getVacationHours(18)  // → 224 (maximum)
 */
function getVacationHours(yearsOfService) {
  if (typeof yearsOfService !== "number" || yearsOfService < 0) {
    throw new Error(
      `yearsOfService must be a non-negative number. Received: ${yearsOfService}`
    );
  }

  // Walk the schedule from highest tier to lowest; return the first match.
  for (let i = VACATION_SCHEDULE.length - 1; i >= 0; i--) {
    const [minYears, vacationHours] = VACATION_SCHEDULE[i];
    if (yearsOfService >= minYears) {
      return vacationHours;
    }
  }

  // Should never reach here given the schedule starts at 0 years.
  throw new Error(
    `No vacation tier found for yearsOfService=${yearsOfService}. ` +
    `Check that VACATION_SCHEDULE includes a [0, ...] entry.`
  );
}

// ---------------------------------------------------------------------------
// ACCRUAL RATE CALCULATION
// ---------------------------------------------------------------------------

/**
 * Calculates the PTO accrual rate (hours of PTO earned per hour worked)
 * for a given years-of-service value.
 *
 * Formula:
 *   totalAnnualPTO  = PERSONAL_TIME_HOURS + SICK_LEAVE_HOURS + vacationHours
 *   accrualRate     = totalAnnualPTO / FULL_TIME_ANNUAL_HOURS
 *
 * @param {number} yearsOfService - Completed full years of employment.
 * @returns {{ accrualRate: number, totalAnnualPTO: number, vacationHours: number,
 *             personalHours: number, sickHours: number }}
 *   A breakdown of every value that feeds into the rate so calculations are
 *   fully traceable.
 *
 * @example
 *   getAccrualRate(0)
 *   // → { accrualRate: 0.072115..., totalAnnualPTO: 150, vacationHours: 80,
 *   //     personalHours: 30, sickHours: 40 }
 *
 *   getAccrualRate(5)
 *   // → { accrualRate: 0.091346..., totalAnnualPTO: 190, vacationHours: 120,
 *   //     personalHours: 30, sickHours: 40 }
 */
function getAccrualRate(yearsOfService) {
  const vacationHours  = getVacationHours(yearsOfService);
  const personalHours  = PERSONAL_TIME_HOURS;
  const sickHours      = SICK_LEAVE_HOURS;
  const totalAnnualPTO = personalHours + sickHours + vacationHours;
  const accrualRate    = totalAnnualPTO / FULL_TIME_ANNUAL_HOURS;

  return {
    accrualRate,      // hours of PTO earned per hour worked
    totalAnnualPTO,   // full-time equivalent PTO for this tenure band
    vacationHours,    // vacation component
    personalHours,    // personal time component (fixed)
    sickHours,        // sick leave component (fixed)
  };
}

// ---------------------------------------------------------------------------
// PRIMARY CALCULATION FUNCTION
// ---------------------------------------------------------------------------

/**
 * Calculates PTO accrued for a given number of hours worked at a given tenure.
 *
 * This is the main entry point for the accrual engine.
 *
 * @param {number} hoursWorked    - Actual hours worked during the period.
 * @param {number} yearsOfService - Completed full years of employment at the
 *                                  START of this period (or a blended value).
 * @returns {{
 *   hoursWorked:    number,
 *   yearsOfService: number,
 *   accrualRate:    number,
 *   ptoEarned:      number,
 *   totalAnnualPTO: number,
 *   vacationHours:  number,
 *   personalHours:  number,
 *   sickHours:      number,
 * }}
 *   Full breakdown of inputs, rate, and result.
 *
 * @throws {Error} If hoursWorked or yearsOfService are invalid.
 *
 * @example
 *   calculatePTOAccrual(100, 0)
 *   // → { hoursWorked: 100, yearsOfService: 0, accrualRate: 0.072115...,
 *   //     ptoEarned: 7.2115..., totalAnnualPTO: 150, ... }
 *
 *   calculatePTOAccrual(100, 5)
 *   // → { hoursWorked: 100, yearsOfService: 5, accrualRate: 0.091346...,
 *   //     ptoEarned: 9.1346..., totalAnnualPTO: 190, ... }
 */
function calculatePTOAccrual(hoursWorked, yearsOfService) {
  if (typeof hoursWorked !== "number" || hoursWorked < 0) {
    throw new Error(
      `hoursWorked must be a non-negative number. Received: ${hoursWorked}`
    );
  }

  // getAccrualRate validates yearsOfService internally.
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

/**
 * Determines whether an employee has completed the waiting period and is
 * therefore eligible to USE (draw down) accrued PTO.
 *
 * NOTE: This does NOT affect accrual — PTO accrues from day one.
 *       This only gates whether the employee can spend their balance.
 *
 * @param {Date|string} hireDate - The employee's hire date.
 * @param {Date|string} [asOfDate=new Date()] - The date to evaluate eligibility.
 * @returns {{ eligible: boolean, waitingPeriodDays: number, daysEmployed: number,
 *             daysRemaining: number }}
 *
 * @example
 *   isPTOEligible("2026-01-01", "2026-04-01")
 *   // → { eligible: false, waitingPeriodDays: 90, daysEmployed: 90, daysRemaining: 0 }
 *   //   (Exactly 90 days — still needs to COMPLETE the 90th day, so eligible on day 91)
 */
function isPTOEligible(hireDate, asOfDate = new Date()) {
  const hire  = new Date(hireDate);
  const asOf  = new Date(asOfDate);

  if (isNaN(hire.getTime())) {
    throw new Error(`Invalid hireDate: ${hireDate}`);
  }
  if (isNaN(asOf.getTime())) {
    throw new Error(`Invalid asOfDate: ${asOfDate}`);
  }

  const msPerDay     = 1000 * 60 * 60 * 24;
  const daysEmployed = Math.floor((asOf - hire) / msPerDay);
  const daysRemaining = Math.max(0, WAITING_PERIOD_DAYS - daysEmployed);
  const eligible      = daysEmployed >= WAITING_PERIOD_DAYS;

  return {
    eligible,
    waitingPeriodDays: WAITING_PERIOD_DAYS,
    daysEmployed,
    daysRemaining,
  };
}

// ---------------------------------------------------------------------------
// BALANCE HELPER
// ---------------------------------------------------------------------------

/**
 * Computes an employee's current PTO balance given lifetime hours worked
 * and lifetime PTO used.
 *
 * For simplicity, this function accepts a single yearsOfService value.
 * For production use, call calculatePTOAccrual() incrementally each pay
 * period (so the accrual rate can adjust as tenure milestones are crossed)
 * and sum the results.
 *
 * @param {number} totalHoursWorked  - Cumulative hours worked since hire.
 * @param {number} yearsOfService    - Current completed years of service.
 * @param {number} ptoHoursUsed      - Cumulative PTO hours used.
 * @param {boolean} [allowNegative=false] - Whether the balance may go below zero.
 * @returns {{ accrued: number, used: number, balance: number, accrualBreakdown: object }}
 *
 * @example
 *   getPTOBalance(500, 0, 10)
 *   // accrued = 500 × 0.072115 ≈ 36.06
 *   // balance = 36.06 − 10 = 26.06
 */
function getPTOBalance(
  totalHoursWorked,
  yearsOfService,
  ptoHoursUsed,
  allowNegative = false
) {
  const accrualResult = calculatePTOAccrual(totalHoursWorked, yearsOfService);
  const accrued       = accrualResult.ptoEarned;
  const rawBalance    = accrued - ptoHoursUsed;
  const balance       = allowNegative ? rawBalance : Math.max(0, rawBalance);

  if (!allowNegative && rawBalance < 0) {
    console.warn(
      `PTO balance would be ${rawBalance.toFixed(4)} hours (negative). ` +
      `Clamped to 0. Set allowNegative=true to permit overdraft.`
    );
  }

  return {
    accrued,
    used:             ptoHoursUsed,
    balance,
    accrualBreakdown: accrualResult,
  };
}

// ---------------------------------------------------------------------------
// EXPORTS
// ---------------------------------------------------------------------------

module.exports = {
  // Main API
  calculatePTOAccrual,
  getAccrualRate,
  getVacationHours,
  isPTOEligible,
  getPTOBalance,

  // Constants (exported so tests and UI can read them without magic numbers)
  FULL_TIME_ANNUAL_HOURS,
  PERSONAL_TIME_HOURS,
  SICK_LEAVE_HOURS,
  WAITING_PERIOD_DAYS,
  VACATION_SCHEDULE,
};
