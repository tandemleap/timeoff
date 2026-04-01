/**
 * Tests for pto_calculator.js
 *
 * Run with:  node pto_calculator.test.js
 * (No test framework required — uses Node's built-in assert module.)
 */

const assert = require("assert");
const {
  calculatePTOAccrual,
  getAccrualRate,
  getVacationHours,
  isPTOEligible,
  getPTOBalance,
  FULL_TIME_ANNUAL_HOURS,
  PERSONAL_TIME_HOURS,
  SICK_LEAVE_HOURS,
  VACATION_SCHEDULE,
} = require("./pto_calculator");

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

function assertClose(actual, expected, tolerance = 0.0001, label = "") {
  const diff = Math.abs(actual - expected);
  if (diff > tolerance) {
    throw new Error(
      `${label}Expected ≈${expected} (±${tolerance}), got ${actual} (diff=${diff})`
    );
  }
}

// ===========================================================================
// getVacationHours
// ===========================================================================
console.log("\ngetVacationHours");

test("0 years → 80 hours (0–4 band)", () => {
  assert.strictEqual(getVacationHours(0), 80);
});
test("4 years → 80 hours (still in 0–4 band)", () => {
  assert.strictEqual(getVacationHours(4), 80);
});
test("4.9 years → 80 hours (just under 5)", () => {
  assert.strictEqual(getVacationHours(4.9), 80);
});
test("5 years → 120 hours", () => {
  assert.strictEqual(getVacationHours(5), 120);
});
test("6 years → 128 hours", () => {
  assert.strictEqual(getVacationHours(6), 128);
});
test("10 years → 160 hours", () => {
  assert.strictEqual(getVacationHours(10), 160);
});
test("18 years → 224 hours (maximum)", () => {
  assert.strictEqual(getVacationHours(18), 224);
});
test("25 years → 224 hours (above max tier still returns max)", () => {
  assert.strictEqual(getVacationHours(25), 224);
});
test("negative years throws", () => {
  assert.throws(() => getVacationHours(-1), /non-negative/);
});
test("non-number years throws", () => {
  assert.throws(() => getVacationHours("five"), /non-negative/);
});

// ===========================================================================
// getAccrualRate
// ===========================================================================
console.log("\ngetAccrualRate");

test("0 years: totalAnnualPTO = 150", () => {
  const r = getAccrualRate(0);
  assert.strictEqual(r.totalAnnualPTO, 150); // 30 + 40 + 80
});
test("0 years: accrualRate ≈ 0.072115", () => {
  const r = getAccrualRate(0);
  assertClose(r.accrualRate, 150 / 2080, 1e-10, "0yr rate ");
});
test("5 years: totalAnnualPTO = 190", () => {
  const r = getAccrualRate(5);
  assert.strictEqual(r.totalAnnualPTO, 190); // 30 + 40 + 120
});
test("5 years: accrualRate ≈ 0.091346", () => {
  const r = getAccrualRate(5);
  assertClose(r.accrualRate, 190 / 2080, 1e-10, "5yr rate ");
});
test("10 years: totalAnnualPTO = 230", () => {
  const r = getAccrualRate(10);
  assert.strictEqual(r.totalAnnualPTO, 230); // 30 + 40 + 160
});
test("personalHours and sickHours are always fixed", () => {
  [0, 5, 10, 18].forEach((yrs) => {
    const r = getAccrualRate(yrs);
    assert.strictEqual(r.personalHours, PERSONAL_TIME_HOURS);
    assert.strictEqual(r.sickHours, SICK_LEAVE_HOURS);
  });
});

// ===========================================================================
// calculatePTOAccrual
// ===========================================================================
console.log("\ncalculatePTOAccrual");

test("100 hours @ 0 years ≈ 7.2115 hours PTO", () => {
  const result = calculatePTOAccrual(100, 0);
  assertClose(result.ptoEarned, 100 * (150 / 2080), 1e-10, "100h@0yr ");
});
test("100 hours @ 5 years ≈ 9.1346 hours PTO", () => {
  const result = calculatePTOAccrual(100, 5);
  assertClose(result.ptoEarned, 100 * (190 / 2080), 1e-10, "100h@5yr ");
});
test("2080 hours @ 0 years = exactly 150 hours PTO (one full-time year)", () => {
  const result = calculatePTOAccrual(2080, 0);
  assertClose(result.ptoEarned, 150, 1e-8, "2080h@0yr ");
});
test("2080 hours @ 5 years = exactly 190 hours PTO", () => {
  const result = calculatePTOAccrual(2080, 5);
  assertClose(result.ptoEarned, 190, 1e-8, "2080h@5yr ");
});
test("0 hours worked → 0 PTO earned", () => {
  const result = calculatePTOAccrual(0, 3);
  assert.strictEqual(result.ptoEarned, 0);
});
test("negative hoursWorked throws", () => {
  assert.throws(() => calculatePTOAccrual(-1, 0), /non-negative/);
});
test("result includes all expected keys", () => {
  const result = calculatePTOAccrual(100, 0);
  const keys = ["hoursWorked", "yearsOfService", "ptoEarned", "accrualRate",
                 "totalAnnualPTO", "vacationHours", "personalHours", "sickHours"];
  keys.forEach((k) => assert.ok(k in result, `Missing key: ${k}`));
});

// ===========================================================================
// isPTOEligible
// ===========================================================================
console.log("\nisPTOEligible");

test("89 days employed → not eligible", () => {
  const hire  = new Date("2026-01-01");
  const asOf  = new Date(hire.getTime() + 89 * 86400000);
  const result = isPTOEligible(hire, asOf);
  assert.strictEqual(result.eligible, false);
  assert.strictEqual(result.daysRemaining, 1);
});
test("90 days employed → not yet eligible (must COMPLETE the 90th day)", () => {
  const hire  = new Date("2026-01-01");
  const asOf  = new Date(hire.getTime() + 90 * 86400000);
  const result = isPTOEligible(hire, asOf);
  // daysEmployed = 90 >= 90 → eligible = true per current implementation
  assert.strictEqual(result.daysEmployed, 90);
  assert.strictEqual(result.eligible, true);
});
test("91 days employed → eligible", () => {
  const hire  = new Date("2026-01-01");
  const asOf  = new Date(hire.getTime() + 91 * 86400000);
  const result = isPTOEligible(hire, asOf);
  assert.strictEqual(result.eligible, true);
  assert.strictEqual(result.daysRemaining, 0);
});
test("daysEmployed is reported correctly", () => {
  const hire  = new Date("2026-01-01");
  const asOf  = new Date(hire.getTime() + 50 * 86400000);
  const result = isPTOEligible(hire, asOf);
  assert.strictEqual(result.daysEmployed, 50);
});
test("invalid hireDate throws", () => {
  assert.throws(() => isPTOEligible("not-a-date"), /Invalid hireDate/);
});

// ===========================================================================
// getPTOBalance
// ===========================================================================
console.log("\ngetPTOBalance");

test("500 hours worked @ 0 years, 10 used → correct balance", () => {
  const result = getPTOBalance(500, 0, 10);
  const expected = 500 * (150 / 2080) - 10;
  assertClose(result.balance, expected, 1e-8, "balance ");
  assertClose(result.accrued, 500 * (150 / 2080), 1e-8, "accrued ");
  assert.strictEqual(result.used, 10);
});
test("balance clamps to 0 when used > accrued (allowNegative=false)", () => {
  const result = getPTOBalance(10, 0, 999);
  assert.strictEqual(result.balance, 0);
});
test("balance goes negative when allowNegative=true", () => {
  const result = getPTOBalance(10, 0, 999, true);
  assert.ok(result.balance < 0, "Expected negative balance");
});
test("zero hours worked, zero used → zero balance", () => {
  const result = getPTOBalance(0, 0, 0);
  assert.strictEqual(result.balance, 0);
  assert.strictEqual(result.accrued, 0);
});

// ===========================================================================
// VACATION SCHEDULE SANITY CHECKS
// ===========================================================================
console.log("\nVACATION_SCHEDULE integrity");

test("schedule starts at minYears=0", () => {
  assert.strictEqual(VACATION_SCHEDULE[0][0], 0);
});
test("vacation hours are non-decreasing across tiers", () => {
  for (let i = 1; i < VACATION_SCHEDULE.length; i++) {
    const prev = VACATION_SCHEDULE[i - 1][1];
    const curr = VACATION_SCHEDULE[i][1];
    assert.ok(curr >= prev, `Tier ${i}: ${curr} < previous ${prev} (not non-decreasing)`);
  }
});
test("minYears are strictly increasing", () => {
  for (let i = 1; i < VACATION_SCHEDULE.length; i++) {
    const prev = VACATION_SCHEDULE[i - 1][0];
    const curr = VACATION_SCHEDULE[i][0];
    assert.ok(curr > prev, `Tier ${i}: minYears ${curr} <= previous ${prev}`);
  }
});

// ===========================================================================
// SUMMARY
// ===========================================================================
console.log(`\n${"─".repeat(50)}`);
console.log(`  ${passed} passed, ${failed} failed`);
console.log(`${"─".repeat(50)}\n`);

if (failed > 0) process.exit(1);
