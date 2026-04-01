/**
 * Tests for employee_pto.js
 *
 * Run with:  node employee_pto.test.js
 */

const assert = require("assert");
const {
  createEmployee,
  setOpeningBalance,
  setEmployeeHours,
  computeEmployeePTO,
  usePTO,
  getAnniversarySummary,
  getActiveHoursPerWeek,
  completedYears,
  addYears,
} = require("./employee_pto");

const { FULL_TIME_ANNUAL_HOURS } = require("./pto_calculator");

let passed = 0;
let failed = 0;

function test(description, fn) {
  try {
    fn();
    console.log(`  ✓  ${description}`);
    passed++;
  } catch (err) {
    console.error(`  ✗  ${description}`);
    console.error(`     ${err.message}`);
    failed++;
  }
}

function assertClose(actual, expected, tolerance = 0.01, label = "") {
  const diff = Math.abs(actual - expected);
  if (diff > tolerance) {
    throw new Error(
      `${label}Expected ≈${expected} (±${tolerance}), got ${actual} (diff=${diff})`
    );
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
console.log("\ncompletedYears");

test("exactly 1 year → 1", () => {
  assert.strictEqual(completedYears(new Date("2024-01-01"), new Date("2025-01-01")), 1);
});
test("364 days → 0", () => {
  assert.strictEqual(completedYears(new Date("2024-01-01"), new Date("2024-12-31")), 0);
});
test("5 years and 6 months → 5", () => {
  assert.strictEqual(completedYears(new Date("2020-01-01"), new Date("2025-07-01")), 5);
});

console.log("\naddYears");

test("add 5 years to 2020-01-01 → 2025-01-01", () => {
  assert.strictEqual(addYears(new Date("2020-01-01"), 5).toISOString().slice(0, 10), "2025-01-01");
});

// ---------------------------------------------------------------------------
// createEmployee
// ---------------------------------------------------------------------------
console.log("\ncreateEmployee");

test("creates employee with correct defaults", () => {
  const emp = createEmployee("e1", "Jane", "2024-01-01");
  assert.strictEqual(emp.id, "e1");
  assert.strictEqual(emp.name, "Jane");
  assert.strictEqual(emp.hireDate, "2024-01-01");
  assert.deepStrictEqual(emp.hoursHistory, []);
  assert.strictEqual(emp.ptoUsed, 0);
});
test("throws on missing hireDate", () => {
  assert.throws(() => createEmployee("e1", "Jane", ""), /required/);
});
test("throws on invalid hireDate", () => {
  assert.throws(() => createEmployee("e1", "Jane", "not-a-date"), /Invalid hireDate/);
});

// ---------------------------------------------------------------------------
// setEmployeeHours
// ---------------------------------------------------------------------------
console.log("\nsetEmployeeHours");

test("adds first entry", () => {
  const emp = createEmployee("e1", "Jane", "2024-01-01");
  setEmployeeHours(emp, "2024-01-01", 20);
  assert.strictEqual(emp.hoursHistory.length, 1);
  assert.strictEqual(emp.hoursHistory[0].avgHoursPerWeek, 20);
});
test("keeps history sorted ascending", () => {
  const emp = createEmployee("e1", "Jane", "2024-01-01");
  setEmployeeHours(emp, "2025-01-01", 24);
  setEmployeeHours(emp, "2024-01-01", 20);
  assert.strictEqual(emp.hoursHistory[0].avgHoursPerWeek, 20);
  assert.strictEqual(emp.hoursHistory[1].avgHoursPerWeek, 24);
});
test("replaces entry with same effectiveDate", () => {
  const emp = createEmployee("e1", "Jane", "2024-01-01");
  setEmployeeHours(emp, "2024-01-01", 20);
  setEmployeeHours(emp, "2024-01-01", 25);
  assert.strictEqual(emp.hoursHistory.length, 1);
  assert.strictEqual(emp.hoursHistory[0].avgHoursPerWeek, 25);
});
test("throws if effectiveDate is before hireDate", () => {
  const emp = createEmployee("e1", "Jane", "2024-06-01");
  assert.throws(() => setEmployeeHours(emp, "2024-01-01", 20), /before hireDate/);
});
test("throws on negative hours", () => {
  const emp = createEmployee("e1", "Jane", "2024-01-01");
  assert.throws(() => setEmployeeHours(emp, "2024-01-01", -1), /non-negative/);
});

// ---------------------------------------------------------------------------
// getActiveHoursPerWeek
// ---------------------------------------------------------------------------
console.log("\ngetActiveHoursPerWeek");

test("returns 0 with empty history", () => {
  assert.strictEqual(getActiveHoursPerWeek([], new Date("2025-01-01")), 0);
});
test("returns first entry retroactively before its effectiveDate", () => {
  const history = [{ effectiveDate: "2024-04-01", avgHoursPerWeek: 20 }];
  assert.strictEqual(getActiveHoursPerWeek(history, new Date("2024-01-01")), 20);
});
test("returns most recent entry at or before atDate", () => {
  const history = [
    { effectiveDate: "2024-01-01", avgHoursPerWeek: 20 },
    { effectiveDate: "2025-01-01", avgHoursPerWeek: 30 },
  ];
  assert.strictEqual(getActiveHoursPerWeek(history, new Date("2024-06-01")), 20);
  assert.strictEqual(getActiveHoursPerWeek(history, new Date("2025-06-01")), 30);
});

// ---------------------------------------------------------------------------
// computeEmployeePTO — basic single-rate scenarios
// ---------------------------------------------------------------------------
console.log("\ncomputeEmployeePTO — single rate");

test("one full year @ 20 hrs/week, 0 years service ≈ correct accrual", () => {
  const emp = createEmployee("e1", "Jane", "2024-01-01");
  setEmployeeHours(emp, "2024-01-01", 20);

  // 2024-01-01 → 2025-01-01 = 366 days (leap year) = 52.2857 weeks
  // hours = 52.2857 × 20 = 1045.71; PTO = 1045.71 × (150/2080)
  const weeks    = (new Date("2025-01-01") - new Date("2024-01-01")) / (7 * 24 * 3600 * 1000);
  const expected = weeks * 20 * (150 / 2080);
  const result   = computeEmployeePTO(emp, "2025-01-01");

  assertClose(result.accruedSinceOpening, expected, 0.01, "1yr@20hr ");
});

test("full-time equivalent: 40 hrs/week for one year earns PTO proportional to actual weeks", () => {
  const emp = createEmployee("e1", "Jane", "2024-01-01");
  setEmployeeHours(emp, "2024-01-01", 40); // 40 hrs/week

  // 2024 is a leap year: 366 days = 52.2857 weeks → 2091.43 hrs (slightly over 2080)
  const weeks    = (new Date("2025-01-01") - new Date("2024-01-01")) / (7 * 24 * 3600 * 1000);
  const expected = weeks * 40 * (150 / 2080);
  const result   = computeEmployeePTO(emp, "2025-01-01");
  assertClose(result.accruedSinceOpening, expected, 0.01, "FT 1yr ");
});

test("zero hours → zero accrual", () => {
  const emp = createEmployee("e1", "Jane", "2024-01-01");
  setEmployeeHours(emp, "2024-01-01", 0);
  const result = computeEmployeePTO(emp, "2025-01-01");
  assert.strictEqual(result.accruedSinceOpening, 0);
});

test("no hoursHistory → zero accrual", () => {
  const emp = createEmployee("e1", "Jane", "2024-01-01");
  const result = computeEmployeePTO(emp, "2025-01-01");
  assert.strictEqual(result.accruedSinceOpening, 0);
});

test("90-day eligibility flag is correct (before 90 days)", () => {
  const hire = "2025-01-01";
  const asOf = "2025-03-01"; // ~59 days
  const emp  = createEmployee("e1", "Jane", hire);
  setEmployeeHours(emp, hire, 20);
  const result = computeEmployeePTO(emp, asOf);
  assert.strictEqual(result.eligible, false);
  assert.ok(result.daysUntilEligible > 0);
});

test("90-day eligibility flag is correct (after 90 days)", () => {
  const hire = "2025-01-01";
  const asOf = "2025-05-01"; // ~120 days
  const emp  = createEmployee("e1", "Jane", hire);
  setEmployeeHours(emp, hire, 20);
  const result = computeEmployeePTO(emp, asOf);
  assert.strictEqual(result.eligible, true);
  assert.strictEqual(result.daysUntilEligible, 0);
});

// ---------------------------------------------------------------------------
// computeEmployeePTO — multi-rate (hours updated mid-tenure)
// ---------------------------------------------------------------------------
console.log("\ncomputeEmployeePTO — hours update on anniversary");

test("hours update on anniversary splits correctly into two segments", () => {
  // Segment 1: 2024-01-01 → 2025-01-01 @ 20 hrs/wk (366 days, leap year)
  // Segment 2: 2025-01-01 → 2026-01-01 @ 30 hrs/wk (365 days)
  // Both segments are in the 0–4 yr tier, so rate = 150/2080 throughout.
  const emp = createEmployee("e1", "Jane", "2024-01-01");
  setEmployeeHours(emp, "2024-01-01", 20);
  setEmployeeHours(emp, "2025-01-01", 30); // anniversary update

  const result = computeEmployeePTO(emp, "2026-01-01");

  const MS_PER_WEEK = 7 * 24 * 3600 * 1000;
  const rate        = 150 / 2080;
  const weeks1      = (new Date("2025-01-01") - new Date("2024-01-01")) / MS_PER_WEEK;
  const weeks2      = (new Date("2026-01-01") - new Date("2025-01-01")) / MS_PER_WEEK;
  const expected    = (weeks1 * 20 + weeks2 * 30) * rate;

  assertClose(result.accruedSinceOpening, expected, 0.01, "2yr split ");
  assert.strictEqual(result.segments.length, 2);
});

test("segment avgHoursPerWeek reflects the correct rate in each period", () => {
  const emp = createEmployee("e1", "Jane", "2024-01-01");
  setEmployeeHours(emp, "2024-01-01", 20);
  setEmployeeHours(emp, "2025-01-01", 30);

  const result = computeEmployeePTO(emp, "2026-01-01");
  assert.strictEqual(result.segments[0].avgHoursPerWeek, 20);
  assert.strictEqual(result.segments[1].avgHoursPerWeek, 30);
});

// ---------------------------------------------------------------------------
// computeEmployeePTO — vacation tier upgrade
// ---------------------------------------------------------------------------
console.log("\ncomputeEmployeePTO — vacation tier upgrade at year 5");

test("accrual rate increases after 5-year anniversary", () => {
  // Hire 2020-01-01.  At year 5 (2025-01-01) vacation jumps from 80 → 120.
  // Rate before: 150/2080.  Rate after: 190/2080.
  const emp = createEmployee("e1", "Jane", "2020-01-01");
  setEmployeeHours(emp, "2020-01-01", 20);

  // Compute for the year crossing the 5th anniversary
  // Segment 1: 2024-01-01 → 2025-01-01 (year 4, still 0-4 tier), 52 weeks × 20 hrs
  // Segment 2: 2025-01-01 → 2026-01-01 (year 5, new tier),        52 weeks × 20 hrs
  const resultBefore = computeEmployeePTO(emp, "2025-01-01"); // 5 full years
  const resultAfter  = computeEmployeePTO(emp, "2026-01-01"); // 6 full years

  // At exactly 5 years service starts being counted: rate should be higher
  // in the year after the 5th anniversary
  const accrualIn5thYear  = resultBefore.totalAccrued; // all at 150 rate
  const accrualIn6thYear  = resultAfter.totalAccrued - accrualIn5thYear;

  // 6th year should use 190/2080 rate (20 hrs/wk × 52 weeks × 190/2080)
  const expected6thYear = 1040 * (190 / 2080);
  assertClose(accrualIn6thYear, expected6thYear, 0.5, "6th yr tier ");
});

test("5-year anniversary creates an extra segment boundary", () => {
  const emp = createEmployee("e1", "Jane", "2020-01-01");
  setEmployeeHours(emp, "2020-01-01", 20);

  // Segments split only at TIER CHANGES and HOURS CHANGES.
  // From 2020-01-01 to 2026-01-01, the only tier change is year 5 (2025-01-01).
  // No hours changes → 2 segments:
  //   Segment 1: 2020-01-01 → 2025-01-01  (tier: 0–4 yrs, rate = 150/2080)
  //   Segment 2: 2025-01-01 → 2026-01-01  (tier: 5 yrs,   rate = 190/2080)
  const result = computeEmployeePTO(emp, "2026-01-01");

  assert.strictEqual(result.segments.length, 2, `Expected 2 segments, got ${result.segments.length}`);

  // The segment starting at the 5yr anniversary should use the 190/2080 accrual rate
  const postAnniversarySegment = result.segments.find(
    (s) => s.start === "2025-01-01"
  );
  assert.ok(postAnniversarySegment, "Expected a segment starting on 2025-01-01");
  assertClose(postAnniversarySegment.accrualRate, 190 / 2080, 1e-6, "post-5yr rate ");
});

// ---------------------------------------------------------------------------
// usePTO
// ---------------------------------------------------------------------------
console.log("\nusePTO");

test("deducts ptoUsed correctly", () => {
  const emp = createEmployee("e1", "Jane", "2024-01-01");
  setEmployeeHours(emp, "2024-01-01", 20);
  usePTO(emp, 5, "2025-01-01");
  assert.strictEqual(emp.ptoUsed, 5);
});
test("balance reflects usage", () => {
  const emp = createEmployee("e1", "Jane", "2024-01-01");
  setEmployeeHours(emp, "2024-01-01", 20);
  usePTO(emp, 5, "2025-01-01");
  const result = computeEmployeePTO(emp, "2025-01-01");
  assertClose(result.balance, result.accruedSinceOpening - 5, 0.001, "balance after use ");
});
test("throws if not yet eligible", () => {
  const emp = createEmployee("e1", "Jane", "2025-01-01");
  setEmployeeHours(emp, "2025-01-01", 20);
  assert.throws(() => usePTO(emp, 2, "2025-02-01"), /not yet eligible/);
});
test("throws if insufficient balance", () => {
  const emp = createEmployee("e1", "Jane", "2024-01-01");
  setEmployeeHours(emp, "2024-01-01", 5); // very few hours
  assert.throws(() => usePTO(emp, 999, "2025-01-01"), /Insufficient/);
});
test("allows overdraft when flag is true", () => {
  const emp = createEmployee("e1", "Jane", "2024-01-01");
  setEmployeeHours(emp, "2024-01-01", 5);
  usePTO(emp, 999, "2025-01-01", true);
  assert.strictEqual(emp.ptoUsed, 999);
});

// ---------------------------------------------------------------------------
// getAnniversarySummary
// ---------------------------------------------------------------------------
console.log("\ngetAnniversarySummary");

test("returns correct next anniversary", () => {
  const emp = createEmployee("e1", "Jane", "2024-03-15");
  setEmployeeHours(emp, "2024-03-15", 20);
  const summary = getAnniversarySummary(emp, "2025-01-01");
  assert.strictEqual(summary.nextAnniversary, "2025-03-15");
  assert.strictEqual(summary.yearsCompleted, 0);
  assert.strictEqual(summary.currentAvgHoursPerWeek, 20);
});
test("after 1 year, yearsCompleted = 1, next = 2nd anniversary", () => {
  const emp = createEmployee("e1", "Jane", "2024-01-01");
  setEmployeeHours(emp, "2024-01-01", 20);
  const summary = getAnniversarySummary(emp, "2025-06-01");
  assert.strictEqual(summary.yearsCompleted, 1);
  assert.strictEqual(summary.nextAnniversary, "2026-01-01");
});

// ---------------------------------------------------------------------------
// setOpeningBalance
// ---------------------------------------------------------------------------
console.log("\nsetOpeningBalance");

test("stores openingBalance on employee and resets ptoUsed", () => {
  const emp = createEmployee("e1", "Jane", "2021-01-01");
  emp.ptoUsed = 5; // simulate prior usage before calling setOpeningBalance
  setOpeningBalance(emp, "2026-04-01", 12.5);
  assert.deepStrictEqual(emp.openingBalance, { asOfDate: "2026-04-01", hours: 12.5 });
  assert.strictEqual(emp.ptoUsed, 0); // reset — usage tracked from opening date forward
});
test("throws if asOfDate before hireDate", () => {
  const emp = createEmployee("e1", "Jane", "2024-06-01");
  assert.throws(() => setOpeningBalance(emp, "2023-01-01", 10), /before hireDate/);
});
test("throws on negative hours", () => {
  const emp = createEmployee("e1", "Jane", "2024-01-01");
  assert.throws(() => setOpeningBalance(emp, "2024-01-01", -1), /non-negative/);
});
test("allows zero balance (employee has used all PTO)", () => {
  const emp = createEmployee("e1", "Jane", "2024-01-01");
  setOpeningBalance(emp, "2026-04-01", 0);
  assert.strictEqual(emp.openingBalance.hours, 0);
});

// ---------------------------------------------------------------------------
// computeEmployeePTO — opening balance (imported employee)
// ---------------------------------------------------------------------------
console.log("\ncomputeEmployeePTO — opening balance");

test("balance starts from opening balance hours when no time has passed", () => {
  const emp = createEmployee("e1", "Jane", "2021-01-01");
  setOpeningBalance(emp, "2026-04-01", 18.5);
  setEmployeeHours(emp, "2026-04-01", 20);

  // Query exactly on the opening balance date → 0 additional accrual
  const result = computeEmployeePTO(emp, "2026-04-01");
  assert.strictEqual(result.accruedSinceOpening, 0);
  assert.strictEqual(result.balance, 18.5);
});

test("accrual adds on top of opening balance going forward", () => {
  // Hired 2021-01-01, 5 years of service by opening date 2026-01-01.
  // At 5 years the rate is 190/2080.
  const emp = createEmployee("e1", "Jane", "2021-01-01");
  setOpeningBalance(emp, "2026-01-01", 10);
  setEmployeeHours(emp, "2026-01-01", 20);

  // Compute 26 weeks later (roughly half a year)
  const result = computeEmployeePTO(emp, "2026-07-01");
  const MS_PER_WEEK = 7 * 24 * 3600 * 1000;
  const weeks       = (new Date("2026-07-01") - new Date("2026-01-01")) / MS_PER_WEEK;
  const expectedNew = weeks * 20 * (190 / 2080);

  assertClose(result.accruedSinceOpening, expectedNew, 0.05, "accrued since opening ");
  assertClose(result.balance, 10 + expectedNew, 0.05, "balance ");
});

test("ptoUsed after opening is subtracted from balance", () => {
  const emp = createEmployee("e1", "Jane", "2021-01-01");
  setOpeningBalance(emp, "2026-01-01", 10);
  setEmployeeHours(emp, "2026-01-01", 20);

  // Use 5 hours after opening
  usePTO(emp, 5, "2026-07-01");

  const result = computeEmployeePTO(emp, "2026-07-01");
  const MS_PER_WEEK = 7 * 24 * 3600 * 1000;
  const weeks       = (new Date("2026-07-01") - new Date("2026-01-01")) / MS_PER_WEEK;
  const expectedNew = weeks * 20 * (190 / 2080);

  assertClose(result.balance, 10 + expectedNew - 5, 0.05, "balance after use ");
  assert.strictEqual(result.ptoUsed, 5);
});

test("hireDate is still used for years-of-service tier (not opening balance date)", () => {
  // Hired exactly 5 years before opening balance date → should use 190/2080 rate
  const emp = createEmployee("e1", "Jane", "2021-01-01");
  setOpeningBalance(emp, "2026-01-01", 0); // 5yr anniversary = opening date
  setEmployeeHours(emp, "2026-01-01", 20);

  const result = computeEmployeePTO(emp, "2026-07-01");
  const seg    = result.segments[0];
  assertClose(seg.accrualRate, 190 / 2080, 1e-6, "5yr rate ");
  assert.strictEqual(seg.yearsOfService, 5);
});

test("opening balance date before asOfDate but after hireDate shows accrual from opening date only", () => {
  // Hired 2020-01-01, opening balance set 2026-04-01.
  // Accrual should NOT cover 2020-2026 in segments.
  const emp = createEmployee("e1", "Jane", "2020-01-01");
  setOpeningBalance(emp, "2026-04-01", 5);
  setEmployeeHours(emp, "2026-04-01", 20);

  const result = computeEmployeePTO(emp, "2027-04-01");

  // Segments should only cover 2026-04-01 → 2027-04-01
  assert.ok(result.segments.every(s => s.start >= "2026-04-01"), "No segment before opening date");
  assert.ok(result.accruedSinceOpening > 0, "Should have accrued some PTO");
});

test("asOfDate before openingBalance.asOfDate returns opening balance unchanged", () => {
  const emp = createEmployee("e1", "Jane", "2020-01-01");
  setOpeningBalance(emp, "2026-04-01", 15);
  setEmployeeHours(emp, "2026-04-01", 20);

  // Query a date before the opening balance snapshot
  const result = computeEmployeePTO(emp, "2025-01-01");
  assert.strictEqual(result.accruedSinceOpening, 0);
  assert.strictEqual(result.balance, 15);
  assert.deepStrictEqual(result.segments, []);
});

test("new employee (no openingBalance) behaves as before — no regression", () => {
  const emp = createEmployee("e1", "Jane", "2024-01-01");
  setEmployeeHours(emp, "2024-01-01", 20);
  const result = computeEmployeePTO(emp, "2025-01-01");

  assert.strictEqual(result.openingBalance, null);
  assert.ok(result.accruedSinceOpening > 0);
  assert.strictEqual(result.balance, result.accruedSinceOpening); // no ptoUsed
});

// ---------------------------------------------------------------------------
// SUMMARY
// ---------------------------------------------------------------------------
console.log(`\n${"─".repeat(50)}`);
console.log(`  ${passed} passed, ${failed} failed`);
console.log(`${"─".repeat(50)}\n`);

if (failed > 0) process.exit(1);
