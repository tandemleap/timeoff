"use client";

import { useTransition, useState } from "react";
import { createEmployee } from "@/lib/actions/employee";
import Link from "next/link";

export default function NewEmployeeForm() {
  const [isPending, startTransition] = useTransition();
  const [error, setError]   = useState<string | null>(null);
  const [invited, setInvited] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);

    startTransition(async () => {
      const result = await createEmployee(fd);
      if (result.error) {
        setError(result.error);
      } else {
        setInvited(fd.get("email") as string);
      }
    });
  }

  if (invited) {
    return (
      <div className="space-y-4">
        <div className="bg-green-50 border border-green-200 rounded-xl p-5 text-sm text-green-800">
          <p className="font-semibold">Invite sent!</p>
          <p className="mt-1">
            An email was sent to <strong>{invited}</strong> with a link to set their password.
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => { setInvited(null); setError(null); }}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Add another employee
          </button>
          <Link href="/admin" className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700">
            Back to admin
          </Link>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-gray-200 p-6 space-y-5">

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">Full name</label>
          <input
            id="name" name="name" type="text" required
            placeholder="Jane Smith"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">Email address</label>
          <input
            id="email" name="email" type="email" required
            placeholder="jane@example.com"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="hireDate" className="block text-sm font-medium text-gray-700 mb-1">Hire date</label>
          <input
            id="hireDate" name="hireDate" type="date" required
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>
        <div>
          <label htmlFor="avgHoursPerWeek" className="block text-sm font-medium text-gray-700 mb-1">Avg hours/week</label>
          <input
            id="avgHoursPerWeek" name="avgHoursPerWeek" type="number"
            required min="1" max="40" step="0.5" placeholder="20"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>
      </div>

      <div className="border-t border-gray-100 pt-5">
        <p className="text-sm font-semibold text-gray-700 mb-1">Opening balance <span className="font-normal text-gray-400">(optional — for employees hired before app launch)</span></p>
        <p className="text-xs text-gray-500 mb-4">
          Enter their current PTO balance and the date it was calculated. Leave blank for employees hired after launch.
        </p>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="openingBalanceDate" className="block text-sm font-medium text-gray-700 mb-1">Balance as-of date</label>
            <input
              id="openingBalanceDate" name="openingBalanceDate" type="date"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label htmlFor="openingBalanceHours" className="block text-sm font-medium text-gray-700 mb-1">Current PTO balance (hrs)</label>
            <input
              id="openingBalanceHours" name="openingBalanceHours" type="number"
              min="0" step="0.5" placeholder="0"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>
        </div>
      </div>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
      )}

      <div className="flex gap-3 pt-1">
        <button
          type="submit" disabled={isPending}
          className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isPending ? "Sending invite…" : "Add employee & send invite"}
        </button>
        <Link href="/admin" className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
          Cancel
        </Link>
      </div>
    </form>
  );
}
