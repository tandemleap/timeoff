import { getMyEmployee } from "@/lib/actions/employee";
import UsePTOForm from "./UsePTOForm";

export default async function UsePTOPage() {
  const data = await getMyEmployee();

  if (!data) {
    return (
      <div className="max-w-2xl mx-auto py-12">
        <p className="text-gray-500">Account not set up yet.</p>
      </div>
    );
  }

  if (!data.pto.eligible) {
    return (
      <div className="max-w-2xl mx-auto py-6">
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-6">
          <p className="text-yellow-800 font-medium">PTO not yet available</p>
          <p className="text-yellow-700 text-sm mt-1">
            You can use PTO after {data.pto.daysUntilEligible} more day(s).
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto py-6">
      <UsePTOForm balance={data.pto.balance} employeeId={data.employee.id} />
    </div>
  );
}
