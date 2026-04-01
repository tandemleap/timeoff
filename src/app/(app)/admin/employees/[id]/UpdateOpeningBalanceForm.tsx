"use client";

import { useTransition, useState } from "react";
import { useRouter } from "next/navigation";
import { updateOpeningBalance } from "@/lib/actions/employee";

interface Props {
  employeeId: string;
  currentDate: string | null;
  currentHours: number | null;
}

export default function UpdateOpeningBalanceForm({ employeeId, currentDate, currentHours }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError]     = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    const fd    = new FormData(e.currentTarget);
    const date  = fd.get("asOfDate") as string;
    const hours = Number(fd.get("hours"));

    startTransition(async () => {
      const result = await updateOpeningBalance(employeeId, date, hours);
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
        <label className="block text-xs font-medium text-gray-600 mb-1">Balance as-of date</label>
        <input
          name="asOfDate" type="date" required
          defaultValue={currentDate ?? ""}
          className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Balance (hrs)</label>
        <input
          name="hours" type="number" required
          min="0" step="0.5"
          defaultValue={currentHours ?? ""}
          placeholder="0"
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
