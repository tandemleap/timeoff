"use server";

import { createClient as createAdminClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import type { Employee, HoursHistoryEntry, PTOUsageRecord } from "@/types/database";
import type { EmployeeRecord, HoursHistoryItem } from "@/types/employee";
import { computeEmployeePTO } from "@/lib/pto/engine";
import type { PTOResult } from "@/lib/pto/engine";

// ---------------------------------------------------------------------------
// HELPER: maps DB rows → EmployeeRecord for the PTO engine
// ---------------------------------------------------------------------------

function toEngineRecord(
  emp: Employee,
  history: HoursHistoryEntry[],
  usageRows: PTOUsageRecord[]
): EmployeeRecord {
  const ptoUsed = usageRows.reduce((sum, r) => sum + Number(r.hours_used), 0);
  return {
    id: emp.id,
    name: emp.name,
    hireDate: emp.hire_date,
    openingBalance:
      emp.opening_balance_date && emp.opening_balance_hours != null
        ? { asOfDate: emp.opening_balance_date, hours: Number(emp.opening_balance_hours) }
        : null,
    hoursHistory: history.map((h): HoursHistoryItem => ({
      effectiveDate: h.effective_date,
      avgHoursPerWeek: Number(h.avg_hours_per_week),
    })),
    ptoUsed,
  };
}

// ---------------------------------------------------------------------------
// A. getMyEmployee
// ---------------------------------------------------------------------------

export async function getMyEmployee(): Promise<{ employee: Employee; pto: PTOResult } | null> {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: emp, error: empError } = await supabase
    .from("employees")
    .select("*")
    .eq("user_id", user.id)
    .single();

  if (empError || !emp) return null;

  const { data: history } = await supabase
    .from("hours_history")
    .select("*")
    .eq("employee_id", emp.id)
    .order("effective_date", { ascending: true });

  const { data: usage } = await supabase
    .from("pto_usage")
    .select("*")
    .eq("employee_id", emp.id)
    .order("usage_date", { ascending: false });

  const record = toEngineRecord(emp, history ?? [], usage ?? []);
  const pto    = computeEmployeePTO(record);

  return { employee: emp, pto };
}

// ---------------------------------------------------------------------------
// B. getMyPTOUsage
// ---------------------------------------------------------------------------

export async function getMyPTOUsage(): Promise<PTOUsageRecord[]> {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data: emp } = await supabase
    .from("employees")
    .select("id")
    .eq("user_id", user.id)
    .single();

  if (!emp) return [];

  const { data: usage } = await supabase
    .from("pto_usage")
    .select("*")
    .eq("employee_id", emp.id)
    .order("usage_date", { ascending: false });

  return usage ?? [];
}

// ---------------------------------------------------------------------------
// C. logPTOUsage
// ---------------------------------------------------------------------------

export async function logPTOUsage(formData: FormData): Promise<{ error?: string }> {
  const usageDate  = formData.get("usageDate") as string;
  const hoursUsed  = Number(formData.get("hoursUsed"));
  const noteRaw    = formData.get("note");
  const note       = noteRaw ? String(noteRaw) : null;

  if (!usageDate) return { error: "Usage date is required." };
  if (isNaN(hoursUsed) || hoursUsed <= 0 || hoursUsed > 80) {
    return { error: "Hours used must be a number between 0 and 80." };
  }

  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  const { data: emp } = await supabase
    .from("employees")
    .select("*")
    .eq("user_id", user.id)
    .single();

  if (!emp) return { error: "Employee record not found." };

  const { data: history } = await supabase
    .from("hours_history")
    .select("*")
    .eq("employee_id", emp.id)
    .order("effective_date", { ascending: true });

  const { data: usage } = await supabase
    .from("pto_usage")
    .select("*")
    .eq("employee_id", emp.id)
    .order("usage_date", { ascending: false });

  const record  = toEngineRecord(emp, history ?? [], usage ?? []);
  const current = computeEmployeePTO(record);

  if (hoursUsed > current.balance) {
    return { error: `Insufficient PTO balance. Available: ${current.balance.toFixed(2)} hrs.` };
  }

  const { error: insertError } = await supabase.from("pto_usage").insert({
    employee_id: emp.id,
    usage_date:  usageDate,
    hours_used:  hoursUsed,
    note,
  });

  if (insertError) return { error: insertError.message };

  return {};
}

// ---------------------------------------------------------------------------
// D. getAllEmployeesWithPTO
// ---------------------------------------------------------------------------

export async function getAllEmployeesWithPTO(): Promise<{ employee: Employee; pto: PTOResult }[]> {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const role = user.user_metadata?.role;
  if (role !== "admin") return [];

  const { data: employees } = await supabase
    .from("employees")
    .select("*")
    .order("name", { ascending: true });

  if (!employees) return [];

  const results: { employee: Employee; pto: PTOResult }[] = [];

  for (const emp of employees) {
    const { data: history } = await supabase
      .from("hours_history")
      .select("*")
      .eq("employee_id", emp.id)
      .order("effective_date", { ascending: true });

    const { data: usage } = await supabase
      .from("pto_usage")
      .select("*")
      .eq("employee_id", emp.id)
      .order("usage_date", { ascending: false });

    const record = toEngineRecord(emp, history ?? [], usage ?? []);
    const pto    = computeEmployeePTO(record);

    results.push({ employee: emp, pto });
  }

  return results;
}

// ---------------------------------------------------------------------------
// E. getEmployeeById
// ---------------------------------------------------------------------------

export async function getEmployeeById(id: string): Promise<{
  employee: Employee;
  history: HoursHistoryEntry[];
  usage: PTOUsageRecord[];
  pto: PTOResult;
} | null> {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const role = user.user_metadata?.role;
  if (role !== "admin") return null;

  const { data: emp } = await supabase
    .from("employees")
    .select("*")
    .eq("id", id)
    .single();

  if (!emp) return null;

  const { data: history } = await supabase
    .from("hours_history")
    .select("*")
    .eq("employee_id", id)
    .order("effective_date", { ascending: true });

  const { data: usage } = await supabase
    .from("pto_usage")
    .select("*")
    .eq("employee_id", id)
    .order("usage_date", { ascending: false });

  const record = toEngineRecord(emp, history ?? [], usage ?? []);
  const pto    = computeEmployeePTO(record);

  return { employee: emp, history: history ?? [], usage: usage ?? [], pto };
}

// ---------------------------------------------------------------------------
// F. createEmployee
// ---------------------------------------------------------------------------

export async function createEmployee(formData: FormData): Promise<{ error?: string }> {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  const role = user.user_metadata?.role;
  if (role !== "admin") return { error: "Unauthorized." };

  const email              = formData.get("email") as string;
  const name               = formData.get("name") as string;
  const hireDate           = formData.get("hireDate") as string;
  const avgHoursPerWeek    = Number(formData.get("avgHoursPerWeek"));
  const openingBalanceDate = formData.get("openingBalanceDate") as string | null;
  const openingBalanceHours =
    formData.get("openingBalanceHours") != null && formData.get("openingBalanceHours") !== ""
      ? Number(formData.get("openingBalanceHours"))
      : null;

  if (!email || !name || !hireDate || isNaN(avgHoursPerWeek)) {
    return { error: "email, name, hireDate, and avgHoursPerWeek are all required." };
  }

  const adminSupabase = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: inviteData, error: inviteError } = await adminSupabase.auth.admin.inviteUserByEmail(
    email,
    { data: { role: "employee" } }
  );

  if (inviteError || !inviteData?.user) {
    return { error: inviteError?.message ?? "Failed to invite user." };
  }

  const newUserId = inviteData.user.id;

  const employeeInsert: Record<string, unknown> = {
    user_id:   newUserId,
    name,
    hire_date: hireDate,
  };

  if (openingBalanceDate) {
    employeeInsert.opening_balance_date  = openingBalanceDate;
    employeeInsert.opening_balance_hours = openingBalanceHours ?? 0;
  }

  const { data: newEmp, error: empError } = await supabase
    .from("employees")
    .insert(employeeInsert)
    .select("id")
    .single();

  if (empError || !newEmp) return { error: empError?.message ?? "Failed to create employee." };

  const { error: historyError } = await supabase.from("hours_history").insert({
    employee_id:       newEmp.id,
    effective_date:    hireDate,
    avg_hours_per_week: avgHoursPerWeek,
  });

  if (historyError) return { error: historyError.message };

  return {};
}

// ---------------------------------------------------------------------------
// G. updateEmployeeHours
// ---------------------------------------------------------------------------

export async function updateEmployeeHours(
  employeeId: string,
  effectiveDate: string,
  avgHoursPerWeek: number
): Promise<{ error?: string }> {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  const role = user.user_metadata?.role;
  if (role !== "admin") return { error: "Unauthorized." };

  const { error } = await supabase.from("hours_history").upsert(
    {
      employee_id:        employeeId,
      effective_date:     effectiveDate,
      avg_hours_per_week: avgHoursPerWeek,
    },
    { onConflict: "employee_id,effective_date" }
  );

  if (error) return { error: error.message };

  return {};
}

// ---------------------------------------------------------------------------
// H. updateOpeningBalance
// ---------------------------------------------------------------------------

export async function updateOpeningBalance(
  employeeId: string,
  asOfDate: string,
  hours: number
): Promise<{ error?: string }> {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  const role = user.user_metadata?.role;
  if (role !== "admin") return { error: "Unauthorized." };

  const { error } = await supabase
    .from("employees")
    .update({
      opening_balance_date:  asOfDate,
      opening_balance_hours: hours,
    })
    .eq("id", employeeId);

  if (error) return { error: error.message };

  return {};
}
