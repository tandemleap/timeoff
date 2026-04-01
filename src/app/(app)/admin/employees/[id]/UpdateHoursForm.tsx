"use client";

import { useTransition, useState } from "react";
import { useRouter } from "next/navigation";
import { updateEmployeeHours } from "@/lib/actions/employee";

export default function UpdateHoursForm({ employeeId }: { employeeId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError]     = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    const fd            = new FormData(e.currentTarget);
    const effectiveDate = fd.get("effectiveDate") as string;
    const hrs           = Number(fd.get("avgHoursPerWeek"));

    startTransition(async () => {
      const result = await updateEmployeeHours(employeeId, effectiveDate, hrs);
      if (result.error) {
        setError(result.error);
      } else {
        setSuccess(true);
        router.refresh();
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3">
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Effective date</label>
        <input
          name="effectiveDate" type="date" required
          className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Avg hrs/week</label>
        <input
          name="avgHoursPerWeek" type="number" required
          min="0" max="40" step="0.5" placeholder="20"
          className="w-24 rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
      </div>
      <button
        type="submit" disabled={isPending}
        className="rounded-lg bg-indigo-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
      >
        {isPending ? "Saving…" : "Save"}
      </button>
      {success && <span className="text-sm text-green-600">Saved!</span>}
      {error   && <span className="text-sm text-red-600">{error}</span>}
    </form>
  );
}
