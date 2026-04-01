import { getMyEmployee, getMyPTOUsage } from "@/lib/actions/employee";
import Link from "next/link";

function fmtDate(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default async function DashboardPage() {
  const data = await getMyEmployee();
  const usage = await getMyPTOUsage();

  if (!data) {
    return (
      <div className="max-w-2xl mx-auto py-12 text-center">
        <p className="text-gray-500 text-lg">
          Your account is being set up. Please check back soon.
        </p>
      </div>
    );
  }

  const { employee, pto } = data;

  // Current accrual rate from the last segment
  const lastSegment =
    pto.segments.length > 0 ? pto.segments[pto.segments.length - 1] : null;

  // Annual equivalent: current avg hrs/week × 52 × rate
  const annualEquivalent = lastSegment
    ? lastSegment.avgHoursPerWeek * 52 * lastSegment.accrualRate
    : null;

  // Opening date label: opening balance date if present, else hire date
  const accruedSinceLabel = pto.openingBalance
    ? fmtDate(pto.openingBalance.asOfDate)
    : fmtDate(pto.hireDate);

  const recentUsage = usage.slice(0, 10);

  return (
    <div className="max-w-2xl mx-auto space-y-6 py-6">

      {/* Balance card */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6">
        <p className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
          PTO Balance
        </p>

        <div className="flex items-end gap-3 mb-3">
          <span className="text-5xl font-bold text-gray-900">
            {pto.balance.toFixed(1)}
          </span>
          <span className="text-gray-500 text-lg mb-1">hours available</span>
        </div>

        {/* Eligibility banner */}
        {!pto.eligible ? (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg px-4 py-2 mb-4 text-sm text-yellow-800">
            PTO available to use in{" "}
            <span className="font-semibold">{pto.daysUntilEligible} day{pto.daysUntilEligible !== 1 ? "s" : ""}</span>
          </div>
        ) : (
          <div className="inline-flex items-center gap-1.5 bg-green-50 border border-green-200 rounded-full px-3 py-1 mb-4">
            <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />
            <span className="text-green-700 text-xs font-semibold">Eligible to use</span>
          </div>
        )}

        {/* Sub-stats */}
        <div className="grid grid-cols-2 gap-4 mt-2">
          <div className="bg-gray-50 rounded-xl p-4">
            <p className="text-xs text-gray-500 mb-1">
              Accrued since {accruedSinceLabel}
            </p>
            <p className="text-xl font-semibold text-gray-900">
              {pto.accruedSinceOpening.toFixed(1)}{" "}
              <span className="text-sm font-normal text-gray-500">hrs</span>
            </p>
          </div>
          <div className="bg-gray-50 rounded-xl p-4">
            <p className="text-xs text-gray-500 mb-1">Used</p>
            <p className="text-xl font-semibold text-gray-900">
              {pto.ptoUsed.toFixed(1)}{" "}
              <span className="text-sm font-normal text-gray-500">hrs</span>
            </p>
          </div>
        </div>

        {/* Log PTO button */}
        <div className="mt-5">
          {pto.eligible ? (
            <Link
              href="/use-pto"
              className="inline-flex items-center px-5 py-2.5 rounded-lg bg-indigo-600 text-white font-medium text-sm hover:bg-indigo-700 transition-colors"
            >
              Log PTO
            </Link>
          ) : (
            <div
              title={`You can log PTO after ${pto.daysUntilEligible} more day${pto.daysUntilEligible !== 1 ? "s" : ""}`}
              className="inline-flex items-center px-5 py-2.5 rounded-lg bg-gray-200 text-gray-400 font-medium text-sm cursor-not-allowed select-none"
            >
              Log PTO
            </div>
          )}
        </div>
      </div>

      {/* Accrual info card */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6">
        <p className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
          Accrual Info
        </p>
        <dl className="space-y-3 text-sm">
          <div className="flex justify-between">
            <dt className="text-gray-500">Hire date</dt>
            <dd className="text-gray-900 font-medium">{fmtDate(employee.hire_date)}</dd>
          </div>

          {lastSegment && (
            <>
              <div className="flex justify-between">
                <dt className="text-gray-500">Current accrual rate</dt>
                <dd className="text-gray-900 font-medium">
                  {(lastSegment.accrualRate * 100).toFixed(2)}% of hours worked
                </dd>
              </div>
              {annualEquivalent !== null && (
                <div className="flex justify-between">
                  <dt className="text-gray-500">Annual equivalent</dt>
                  <dd className="text-gray-900 font-medium">
                    ~{annualEquivalent.toFixed(1)} hrs/year at current schedule
                  </dd>
                </div>
              )}
            </>
          )}

          {pto.openingBalance && (
            <div className="flex justify-between">
              <dt className="text-gray-500">
                Balance imported from {fmtDate(pto.openingBalance.asOfDate)}
              </dt>
              <dd className="text-gray-900 font-medium">
                {pto.openingBalance.hours.toFixed(1)} hrs
              </dd>
            </div>
          )}
        </dl>
      </div>

      {/* Usage history */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6">
        <p className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
          Usage History
        </p>
        {recentUsage.length === 0 ? (
          <p className="text-gray-400 text-sm">No PTO used yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-400 border-b border-gray-100">
                <th className="pb-2 font-medium">Date</th>
                <th className="pb-2 font-medium">Hours</th>
                <th className="pb-2 font-medium">Note</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {recentUsage.map((entry) => (
                <tr key={entry.id} className="text-gray-700">
                  <td className="py-2.5">{fmtDate(entry.usage_date)}</td>
                  <td className="py-2.5 font-medium">{Number(entry.hours_used).toFixed(1)}</td>
                  <td className="py-2.5 text-gray-400">{entry.note ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

    </div>
  );
}
