import { getEmployeeById } from "@/lib/actions/employee";
import UpdateHoursForm from "./UpdateHoursForm";
import UpdateOpeningBalanceForm from "./UpdateOpeningBalanceForm";
import Link from "next/link";

function fmtDate(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric",
  });
}

function completedYears(hireDateIso: string): number {
  const hire = new Date(hireDateIso + "T00:00:00");
  const now  = new Date();
  let years  = now.getFullYear() - hire.getFullYear();
  const m    = now.getMonth() - hire.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < hire.getDate())) years--;
  return Math.max(0, years);
}

export default async function EditEmployeePage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const data   = await getEmployeeById(id);

  if (!data) {
    return (
      <div>
        <p className="text-gray-500">Employee not found.</p>
        <Link href="/admin" className="text-indigo-600 text-sm mt-2 block">← Back to admin</Link>
      </div>
    );
  }

  const { employee, history, usage, pto } = data;
  const lastSeg    = pto.segments.at(-1);
  const accrualRate = lastSeg ? (lastSeg.accrualRate * 100).toFixed(4) : "—";

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/admin" className="text-sm text-indigo-600 hover:text-indigo-800">← Admin</Link>
        <span className="text-gray-300">/</span>
        <h1 className="text-xl font-bold text-gray-900">{employee.name}</h1>
      </div>

      {/* Employee info */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6 mb-5">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Employee Info</p>
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <div><dt className="text-gray-500">Hire date</dt><dd className="font-medium">{fmtDate(employee.hire_date)}</dd></div>
          <div><dt className="text-gray-500">Years of service</dt><dd className="font-medium">{completedYears(employee.hire_date)}</dd></div>
          {employee.opening_balance_date && (
            <>
              <div><dt className="text-gray-500">Opening balance date</dt><dd className="font-medium">{fmtDate(employee.opening_balance_date)}</dd></div>
              <div><dt className="text-gray-500">Opening balance</dt><dd className="font-medium">{Number(employee.opening_balance_hours).toFixed(1)} hrs</dd></div>
            </>
          )}
        </dl>
      </div>

      {/* PTO status */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6 mb-5">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Current PTO Status</p>
        <div className="grid grid-cols-3 gap-4 mb-4">
          <div className="bg-gray-50 rounded-xl p-3">
            <p className="text-xs text-gray-500 mb-0.5">Balance</p>
            <p className="text-xl font-bold text-gray-900">{pto.balance.toFixed(1)} <span className="text-sm font-normal text-gray-400">hrs</span></p>
          </div>
          <div className="bg-gray-50 rounded-xl p-3">
            <p className="text-xs text-gray-500 mb-0.5">Accrued</p>
            <p className="text-xl font-bold text-gray-900">{pto.accruedSinceOpening.toFixed(1)} <span className="text-sm font-normal text-gray-400">hrs</span></p>
          </div>
          <div className="bg-gray-50 rounded-xl p-3">
            <p className="text-xs text-gray-500 mb-0.5">Used</p>
            <p className="text-xl font-bold text-gray-900">{pto.ptoUsed.toFixed(1)} <span className="text-sm font-normal text-gray-400">hrs</span></p>
          </div>
        </div>
        <dl className="text-sm space-y-1.5">
          <div className="flex justify-between">
            <dt className="text-gray-500">Eligible to use PTO</dt>
            <dd className="font-medium">{pto.eligible ? "Yes" : `No — ${pto.daysUntilEligible} days remaining`}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-gray-500">Current accrual rate</dt>
            <dd className="font-medium">{accrualRate}% per hr worked</dd>
          </div>
        </dl>
      </div>

      {/* Hours history */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6 mb-5">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Hours Schedule</p>
        {history.length > 0 ? (
          <table className="w-full text-sm mb-5">
            <thead>
              <tr className="text-left text-xs text-gray-400 border-b border-gray-100">
                <th className="pb-2 font-medium">Effective Date</th>
                <th className="pb-2 font-medium">Avg Hrs/Week</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {history.map((h) => (
                <tr key={h.id}>
                  <td className="py-2 text-gray-700">{fmtDate(h.effective_date)}</td>
                  <td className="py-2 text-gray-700">{Number(h.avg_hours_per_week).toFixed(1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-sm text-gray-400 mb-4">No hours on record yet.</p>
        )}
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Add / Update Hours</p>
        <UpdateHoursForm employeeId={employee.id} />
      </div>

      {/* Opening balance */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6 mb-5">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Opening Balance</p>
        <p className="text-xs text-gray-500 mb-4">
          Set or update the imported PTO balance for this employee. This is their net balance as of the given date — the system accrues forward from there.
        </p>
        <UpdateOpeningBalanceForm
          employeeId={employee.id}
          currentDate={employee.opening_balance_date}
          currentHours={employee.opening_balance_hours !== null ? Number(employee.opening_balance_hours) : null}
        />
      </div>

      {/* Accrual segments (audit trail) */}
      <details className="bg-white rounded-2xl border border-gray-200 p-6 mb-5">
        <summary className="text-xs font-semibold text-gray-500 uppercase tracking-wide cursor-pointer select-none">
          Accrual Segments (audit trail) ▸
        </summary>
        {pto.segments.length === 0 ? (
          <p className="text-sm text-gray-400 mt-3">No segments yet.</p>
        ) : (
          <div className="overflow-x-auto mt-3">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-gray-400 border-b border-gray-100">
                  <th className="pb-2 font-medium">From</th>
                  <th className="pb-2 font-medium">To</th>
                  <th className="pb-2 font-medium">Weeks</th>
                  <th className="pb-2 font-medium">Hrs/Wk</th>
                  <th className="pb-2 font-medium">Yrs Svc</th>
                  <th className="pb-2 font-medium">Hrs Worked</th>
                  <th className="pb-2 font-medium">Rate</th>
                  <th className="pb-2 font-medium">PTO Earned</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {pto.segments.map((s, i) => (
                  <tr key={i} className="text-gray-600">
                    <td className="py-1.5">{fmtDate(s.start)}</td>
                    <td className="py-1.5">{fmtDate(s.end)}</td>
                    <td className="py-1.5">{s.weeks.toFixed(2)}</td>
                    <td className="py-1.5">{s.avgHoursPerWeek}</td>
                    <td className="py-1.5">{s.yearsOfService}</td>
                    <td className="py-1.5">{s.hoursWorked.toFixed(2)}</td>
                    <td className="py-1.5">{(s.accrualRate * 100).toFixed(4)}%</td>
                    <td className="py-1.5 font-medium text-gray-900">{s.ptoEarned.toFixed(4)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </details>

      {/* PTO usage history */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">PTO Usage History</p>
        {usage.length === 0 ? (
          <p className="text-sm text-gray-400">No PTO used yet.</p>
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
              {usage.map((u) => (
                <tr key={u.id} className="text-gray-700">
                  <td className="py-2">{fmtDate(u.usage_date)}</td>
                  <td className="py-2 font-medium">{Number(u.hours_used).toFixed(1)}</td>
                  <td className="py-2 text-gray-400">{u.note ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

    </div>
  );
}
