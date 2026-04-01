import { getAllEmployeesWithPTO } from "@/lib/actions/employee";
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

function nextAnniversary(hireDateIso: string): string {
  const hire  = new Date(hireDateIso + "T00:00:00");
  const years = completedYears(hireDateIso);
  const next  = new Date(hire);
  next.setFullYear(hire.getFullYear() + years + 1);
  return next.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function balancePill(hrs: number) {
  if (hrs > 20) return "bg-green-100 text-green-800";
  if (hrs > 5)  return "bg-yellow-100 text-yellow-800";
  return "bg-red-100 text-red-800";
}

export default async function AdminPage() {
  const employees = await getAllEmployeesWithPTO();

  const totalUsed      = employees.reduce((s, e) => s + e.pto.ptoUsed, 0);
  const totalAvailable = employees.reduce((s, e) => s + e.pto.balance, 0);

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-gray-900">Team PTO Overview</h1>
        <Link
          href="/admin/employees/new"
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
        >
          + Add Employee
        </Link>
      </div>

      {/* Summary row */}
      {employees.length > 0 && (
        <div className="grid grid-cols-3 gap-4 mb-6">
          {[
            { label: "Employees", value: employees.length },
            { label: "Total hrs used", value: totalUsed.toFixed(1) },
            { label: "Total hrs available", value: totalAvailable.toFixed(1) },
          ].map((s) => (
            <div key={s.label} className="bg-white rounded-2xl border border-gray-200 p-4">
              <p className="text-xs text-gray-500 mb-1">{s.label}</p>
              <p className="text-2xl font-bold text-gray-900">{s.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Table */}
      {employees.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center">
          <p className="text-gray-400 mb-4">No employees yet.</p>
          <Link
            href="/admin/employees/new"
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
          >
            + Add Employee
          </Link>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr className="text-left text-xs text-gray-500">
                <th className="px-4 py-3 font-medium">Employee</th>
                <th className="px-4 py-3 font-medium">Hire Date</th>
                <th className="px-4 py-3 font-medium">Years</th>
                <th className="px-4 py-3 font-medium">Balance</th>
                <th className="px-4 py-3 font-medium">Used</th>
                <th className="px-4 py-3 font-medium">Rate</th>
                <th className="px-4 py-3 font-medium">Next Anniversary</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {employees.map(({ employee, pto }) => {
                const lastSeg = pto.segments.at(-1);
                const rate    = lastSeg ? (lastSeg.accrualRate * 100).toFixed(2) + "%" : "—";
                return (
                  <tr key={employee.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">{employee.name}</td>
                    <td className="px-4 py-3 text-gray-600">{fmtDate(employee.hire_date)}</td>
                    <td className="px-4 py-3 text-gray-600">{completedYears(employee.hire_date)}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${balancePill(pto.balance)}`}>
                        {pto.balance.toFixed(1)} hrs
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{pto.ptoUsed.toFixed(1)} hrs</td>
                    <td className="px-4 py-3 text-gray-600">{rate}</td>
                    <td className="px-4 py-3 text-gray-600">{nextAnniversary(employee.hire_date)}</td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/employees/${employee.id}`}
                        className="text-indigo-600 hover:text-indigo-800 font-medium text-xs"
                      >
                        Edit
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
