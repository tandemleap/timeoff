/**
 * Employee PTO Engine
 *
 * PURPOSE:
 *   Manages employee records and computes PTO accrual accurately over time,
 *   accounting for:
 *     - Changes in average weekly hours (entered after 90 days, updatable on anniversary)
 *     - Vacation tier upgrades that occur at whole-year tenure milestones
 *
 * HOW SEGMENTED ACCRUAL WORKS:
 *   An employee's timeline from hire to "today" is divided into segments.
 *   A new segment begins whenever EITHER of the following changes:
 *     1. The employee's average weekly hours are updated (hoursHistory entry)
 *     2. The employee crosses a vacation-tier anniversary (years 5, 6, 7 … 18)
 *
 *   Within each segment:
 *     - avgHoursPerWeek is treated as constant
 *     - yearsOfService (and therefore the accrual rate) is treated as constant
 *     - hoursWorked = weeksInSegment × avgHoursPerWeek
 *     - ptoEarned   = hoursWorked × accrualRate
 *
 *   Total PTO accrued = sum of ptoEarned across all segments.
 *
 * EMPLOYEE DATA SHAPE:
 *   {
 *     id:           string,    — unique identifier
 *     name:         string,
 *     hireDate:     string,    — ISO date string, e.g. "2024-03-15"
 *     hoursHistory: [          — sorted ascending by effectiveDate
 *       { effectiveDate: string, avgHoursPerWeek: number }
 *     ],
 *     ptoUsed:      number,    — cumulative PTO hours used to date
 *   }
 *
 * HOURS HISTORY NOTES:
 *   - The first entry is applied RETROACTIVELY to hireDate, so PTO accrues
 *     from day one even before the admin formally enters the hours.
 *   - Subsequent entries take effect on their effectiveDate (typically an
 *     anniversary date or whenever the schedule changes).
 *   - If hoursHistory is empty, accrual returns 0 (no hours on record).
 */

const {
  calculatePTOAccrual,
  isPTOEligible,
  VACATION_SCHEDULE,
} = require("./pto_calculator");

// ---------------------------------------------------------------------------
// DATE UTILITIES
// ---------------------------------------------------------------------------

const MS_PER_DAY  = 1000 * 60 * 60 * 24;
const MS_PER_WEEK = MS_PER_DAY * 7;

/**
 * Returns a new Date exactly `years` whole years after `baseDate`,
 * respecting month/day (e.g. hire date of Feb 29 → Mar 1 in non-leap years).
 */
function addYears(baseDate, years) {
  const d = new Date(baseDate);
  d.setFullYear(d.getFullYear() + years);
  return d;
}

/**
 * Returns completed whole years between two dates.
 * e.g. hireDate=2020-01-01, asOf=2025-06-15 → 5 (not yet 5.5)
 */
function completedYears(hireDate, asOf) {
  let years = asOf.getFullYear() - hireDate.getFullYear();
  const monthDiff = asOf.getMonth() - hireDate.getMonth();
  const dayDiff   = asOf.getDate()  - hireDate.getDate();
  if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) years--;
  return Math.max(0, years);
}

// ---------------------------------------------------------------------------
// EMPLOYEE FACTORY
// ---------------------------------------------------------------------------

/**
 * Creates a new employee record.
 *
 * @param {string} id
 * @param {string} name
 * @param {string} hireDate  — ISO date string, e.g. "2024-03-15"
 * @returns {object} Employee record with empty hoursHistory and zero ptoUsed.
 *
 * @example
 *   const emp = createEmployee("emp-001", "Jane Smith", "2024-03-15");
 */
function createEmployee(id, name, hireDate) {
  if (!id || !name || !hireDate) {
    throw new Error("id, name, and hireDate are all required.");
  }
  const d = new Date(hireDate);
  if (isNaN(d.getTime())) throw new Error(`Invalid hireDate: ${hireDate}`);

  return {
    id,
    name,
    hireDate,          // stored as ISO string; convert to Date when calculating
    hoursHistory: [],  // populated via setEmployeeHours()
    ptoUsed: 0,
  };
}

// ---------------------------------------------------------------------------
// HOURS HISTORY MANAGEMENT
// ---------------------------------------------------------------------------

/**
 * Records or updates the employee's average weekly hours starting from a
 * given effective date.
 *
 * Call this:
 *   - After 90 days of employment to set the initial hours (effectiveDate = hireDate
 *     if you want retroactive accrual from day one, or hireDate + 90 days otherwise).
 *   - On each anniversary (or whenever the schedule changes) to update the rate.
 *
 * If an entry already exists for the exact same effectiveDate it is replaced.
 * The history is always kept sorted ascending by effectiveDate.
 *
 * @param {object} employee        — Employee record (mutated in place).
 * @param {string} effectiveDate   — ISO date string. Must be >= hireDate.
 * @param {number} avgHoursPerWeek — Average hours worked per week from this date forward.
 * @returns {object} The updated employee record.
 *
 * @example
 *   // Set initial hours (retroactively covers from hire date)
 *   setEmployeeHours(emp, emp.hireDate, 20);
 *
 *   // Update hours on 1-year anniversary
 *   setEmployeeHours(emp, "2025-03-15", 24);
 */
function setEmployeeHours(employee, effectiveDate, avgHoursPerWeek) {
  if (typeof avgHoursPerWeek !== "number" || avgHoursPerWeek < 0) {
    throw new Error(
      `avgHoursPerWeek must be a non-negative number. Received: ${avgHoursPerWeek}`
    );
  }
  const effDate  = new Date(effectiveDate);
  const hireDate = new Date(employee.hireDate);

  if (isNaN(effDate.getTime())) {
    throw new Error(`Invalid effectiveDate: ${effectiveDate}`);
  }
  if (effDate < hireDate) {
    throw new Error(
      `effectiveDate (${effectiveDate}) cannot be before hireDate (${employee.hireDate}).`
    );
  }

  // Remove any existing entry for this exact date, then add the new one.
  employee.hoursHistory = employee.hoursHistory.filter(
    (e) => new Date(e.effectiveDate).getTime() !== effDate.getTime()
  );
  employee.hoursHistory.push({ effectiveDate, avgHoursPerWeek });

  // Keep sorted ascending.
  employee.hoursHistory.sort(
    (a, b) => new Date(a.effectiveDate) - new Date(b.effectiveDate)
  );

  return employee;
}

// ---------------------------------------------------------------------------
// ACTIVE HOURS LOOKUP
// ---------------------------------------------------------------------------

/**
 * Returns the avgHoursPerWeek in effect at a given point in time, based on
 * the employee's hoursHistory.
 *
 * The first history entry is always applied retroactively back to hireDate,
 * so there is never a gap at the start of employment.
 *
 * Returns 0 if hoursHistory is empty (no hours have been entered yet).
 *
 * @param {Array}  hoursHistory
 * @param {Date}   atDate
 * @returns {number}
 */
function getActiveHoursPerWeek(hoursHistory, atDate) {
  if (!hoursHistory || hoursHistory.length === 0) return 0;

  // Walk backwards from the most recent entry to find the active one.
  // The first entry acts as the catch-all for any date before it
  // (retroactive application).
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
 * Boundaries are inserted at:
 *   1. hireDate
 *   2. Each hoursHistory effectiveDate that falls between hireDate and asOfDate
 *   3. Each vacation-tier anniversary (years 5, 6, 7 … 18) that falls between
 *      hireDate and asOfDate
 *   4. asOfDate
 *
 * @param {Date}  hireDate
 * @param {Array} hoursHistory
 * @param {Date}  asOfDate
 * @returns {Date[]} Sorted array of unique boundary dates.
 */
function buildSegmentBoundaries(hireDate, hoursHistory, asOfDate) {
  const set = new Map(); // timestamp → Date (dedup by ms)

  function addBoundary(d) {
    set.set(d.getTime(), d);
  }

  addBoundary(new Date(hireDate));
  addBoundary(new Date(asOfDate));

  // Hours-history change dates
  for (const entry of hoursHistory) {
    const d = new Date(entry.effectiveDate);
    if (d > hireDate && d < asOfDate) addBoundary(d);
  }

  // Vacation-tier anniversary dates (only years where the tier actually changes)
  const tierChangeYears = VACATION_SCHEDULE.slice(1).map(([y]) => y);
  for (const y of tierChangeYears) {
    const anniversary = addYears(hireDate, y);
    if (anniversary > hireDate && anniversary < asOfDate) addBoundary(anniversary);
  }

  return [...set.values()].sort((a, b) => a - b);
}

/**
 * Converts a boundary array into an array of segments.
 * Each segment: { start: Date, end: Date, weeks: number,
 *                 avgHoursPerWeek: number, yearsOfService: number }
 *
 * @param {Date}  hireDate
 * @param {Array} hoursHistory
 * @param {Date[]} boundaries
 * @returns {object[]}
 */
function buildSegments(hireDate, hoursHistory, boundaries) {
  const segments = [];

  for (let i = 0; i < boundaries.length - 1; i++) {
    const start = boundaries[i];
    const end   = boundaries[i + 1];

    // Use the midpoint to determine which hours-history entry is active.
    // (Avoids edge effects at exact boundary timestamps.)
    const midpoint         = new Date((start.getTime() + end.getTime()) / 2);
    const avgHoursPerWeek  = getActiveHoursPerWeek(hoursHistory, midpoint);
    const yearsOfService   = completedYears(hireDate, start);
    const weeks            = (end - start) / MS_PER_WEEK;

    segments.push({ start, end, weeks, avgHoursPerWeek, yearsOfService });
  }

  return segments;
}

// ---------------------------------------------------------------------------
// CORE ACCRUAL COMPUTATION
// ---------------------------------------------------------------------------

/**
 * Computes total PTO accrued for an employee from hireDate through asOfDate.
 *
 * This is the primary calculation function for the employee engine.
 * It delegates per-segment math to calculatePTOAccrual() from pto_calculator.js.
 *
 * @param {object}      employee
 * @param {Date|string} [asOfDate=new Date()]
 * @returns {{
 *   totalAccrued:   number,   — cumulative PTO hours earned (all time)
 *   ptoUsed:        number,   — cumulative PTO hours drawn down
 *   balance:        number,   — accrued − used (floored at 0)
 *   eligible:       boolean,  — whether employee may USE PTO yet (90-day check)
 *   daysUntilEligible: number,
 *   segments:       object[], — per-segment breakdown for transparency/audit
 * }}
 *
 * @example
 *   const emp = createEmployee("e1", "Jane", "2024-01-01");
 *   setEmployeeHours(emp, "2024-01-01", 20);
 *   const result = computeEmployeePTO(emp, "2025-01-01");
 *   // result.totalAccrued ≈ (52 weeks × 20 hrs) × (150/2080) ≈ 74.9 hrs
 */
function computeEmployeePTO(employee, asOfDate = new Date()) {
  const hire  = new Date(employee.hireDate);
  const asOf  = new Date(asOfDate);

  if (isNaN(hire.getTime())) throw new Error(`Invalid employee hireDate: ${employee.hireDate}`);
  if (isNaN(asOf.getTime()))  throw new Error(`Invalid asOfDate: ${asOfDate}`);
  if (asOf < hire)            throw new Error("asOfDate cannot be before hireDate.");

  // Eligibility (gates USAGE, not accrual)
  const eligibility = isPTOEligible(hire, asOf);

  // Build timeline and compute per-segment accrual
  const boundaries = buildSegmentBoundaries(hire, employee.hoursHistory, asOf);
  const segments   = buildSegments(hire, employee.hoursHistory, boundaries);

  let totalAccrued = 0;
  const segmentDetails = segments.map((seg) => {
    const hoursWorked = seg.weeks * seg.avgHoursPerWeek;
    const accrual     = calculatePTOAccrual(hoursWorked, seg.yearsOfService);

    totalAccrued += accrual.ptoEarned;

    return {
      start:            seg.start.toISOString().slice(0, 10),
      end:              seg.end.toISOString().slice(0, 10),
      weeks:            parseFloat(seg.weeks.toFixed(4)),
      avgHoursPerWeek:  seg.avgHoursPerWeek,
      yearsOfService:   seg.yearsOfService,
      hoursWorked:      parseFloat(hoursWorked.toFixed(4)),
      accrualRate:      parseFloat(accrual.accrualRate.toFixed(6)),
      ptoEarned:        parseFloat(accrual.ptoEarned.toFixed(4)),
    };
  });

  const rawBalance = totalAccrued - employee.ptoUsed;
  const balance    = Math.max(0, rawBalance);

  return {
    employeeId:          employee.id,
    employeeName:        employee.name,
    hireDate:            employee.hireDate,
    asOfDate:            asOf.toISOString().slice(0, 10),
    totalAccrued:        parseFloat(totalAccrued.toFixed(4)),
    ptoUsed:             employee.ptoUsed,
    balance:             parseFloat(balance.toFixed(4)),
    eligible:            eligibility.eligible,
    daysUntilEligible:   eligibility.daysRemaining,
    segments:            segmentDetails,
  };
}

// ---------------------------------------------------------------------------
// PTO USAGE
// ---------------------------------------------------------------------------

/**
 * Records PTO usage against an employee's balance.
 *
 * Validates that:
 *   1. The employee has passed the 90-day waiting period.
 *   2. The employee has sufficient balance (unless allowOverdraft is true).
 *
 * @param {object}      employee
 * @param {number}      hoursToUse
 * @param {Date|string} [asOfDate=new Date()]
 * @param {boolean}     [allowOverdraft=false]
 * @returns {object} Updated employee record.
 *
 * @throws {Error} If ineligible or insufficient balance.
 */
function usePTO(employee, hoursToUse, asOfDate = new Date(), allowOverdraft = false) {
  if (typeof hoursToUse !== "number" || hoursToUse <= 0) {
    throw new Error(`hoursToUse must be a positive number. Received: ${hoursToUse}`);
  }

  const eligibility = isPTOEligible(new Date(employee.hireDate), new Date(asOfDate));
  if (!eligibility.eligible) {
    throw new Error(
      `${employee.name} is not yet eligible to use PTO. ` +
      `${eligibility.daysRemaining} day(s) remaining in the 90-day waiting period.`
    );
  }

  const current = computeEmployeePTO(employee, asOfDate);
  if (!allowOverdraft && hoursToUse > current.balance) {
    throw new Error(
      `Insufficient PTO balance. Requested: ${hoursToUse} hrs, ` +
      `Available: ${current.balance.toFixed(2)} hrs.`
    );
  }

  employee.ptoUsed = parseFloat((employee.ptoUsed + hoursToUse).toFixed(4));
  return employee;
}

// ---------------------------------------------------------------------------
// ANNIVERSARY SUMMARY
// ---------------------------------------------------------------------------

/**
 * Returns the next anniversary date and the hours-per-week value that should
 * be reviewed/updated at that time.
 *
 * Intended to help the UI prompt the admin to update average hours on
 * each anniversary.
 *
 * @param {object}      employee
 * @param {Date|string} [asOfDate=new Date()]
 * @returns {{ nextAnniversary: string, yearsCompleted: number,
 *             currentAvgHoursPerWeek: number }}
 */
function getAnniversarySummary(employee, asOfDate = new Date()) {
  const hire  = new Date(employee.hireDate);
  const asOf  = new Date(asOfDate);
  const years = completedYears(hire, asOf);

  const nextAnniversary     = addYears(hire, years + 1);
  const currentAvgHoursPerWeek = getActiveHoursPerWeek(employee.hoursHistory, asOf);

  return {
    nextAnniversary:        nextAnniversary.toISOString().slice(0, 10),
    yearsCompleted:         years,
    currentAvgHoursPerWeek,
  };
}

// ---------------------------------------------------------------------------
// EXPORTS
// ---------------------------------------------------------------------------

module.exports = {
  createEmployee,
  setEmployeeHours,
  computeEmployeePTO,
  usePTO,
  getAnniversarySummary,

  // Exposed for testing
  getActiveHoursPerWeek,
  buildSegmentBoundaries,
  buildSegments,
  completedYears,
  addYears,
};
