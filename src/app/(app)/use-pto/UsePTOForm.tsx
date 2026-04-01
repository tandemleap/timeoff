"use client";

import { useTransition, useState } from "react";
import { logPTOUsage } from "@/lib/actions/employee";
import Link from "next/link";

interface Props {
  balance: number;
  employeeId: string;
}

export default function UsePTOForm({ balance }: Props) {
  const [isPending, startTransition] = useTransition();
  const [error, setError]     = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const today = new Date().toISOString().slice(0, 10);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    const form  = e.currentTarget;
    const fd    = new FormData(form);
    const hours = Number(fd.get("hoursUsed"));
    const date  = fd.get("usageDate") as string;

    if (hours > balance) {
      setError(`You only have ${balance.toFixed(1)} hrs available.`);
      return;
    }

    startTransition(async () => {
      const result = await logPTOUsage(fd);
      if (result.error) {
        setError(result.error);
      } else {
        setSuccess(`${hours.toFixed(1)} hours of PTO logged for ${new Date(date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}.`);
        form.reset();
        // Reset date back to today after reset
        (form.elements.namedItem("usageDate") as HTMLInputElement).value = today;
      }
    });
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-6">

      {/* Current balance */}
      <div className="mb-6 p-4 bg-gray-50 rounded-xl">
        <p className="text-xs text-gray-500 mb-0.5">Available balance</p>
        <p className="text-2xl font-bold text-gray-900">
          {balance.toFixed(1)} <span className="text-base font-normal text-gray-400">hrs</span>
        </p>
      </div>

      {success ? (
        <div className="space-y-4">
          <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-3 text-green-800 text-sm">
            {success}
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => setSuccess(null)}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
            >
              Log more PTO
            </button>
            <Link href="/dashboard" className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
              Back to dashboard
            </Link>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label htmlFor="usageDate" className="block text-sm font-medium text-gray-700 mb-1">
              Date
            </label>
            <input
              id="usageDate"
              name="usageDate"
              type="date"
              required
              defaultValue={today}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          <div>
            <label htmlFor="hoursUsed" className="block text-sm font-medium text-gray-700 mb-1">
              Hours used
            </label>
            <input
              id="hoursUsed"
              name="hoursUsed"
              type="number"
              required
              min="0.5"
              max={balance}
              step="0.5"
              placeholder="e.g. 4"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          <div>
            <label htmlFor="note" className="block text-sm font-medium text-gray-700 mb-1">
              Note <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <input
              id="note"
              name="note"
              type="text"
              placeholder="e.g. Vacation, sick day…"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
          )}

          <div className="flex gap-3 pt-1">
            <button
              type="submit"
              disabled={isPending}
              className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isPending ? "Saving…" : "Log PTO"}
            </button>
            <Link href="/dashboard" className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
              Cancel
            </Link>
          </div>
        </form>
      )}
    </div>
  );
}
