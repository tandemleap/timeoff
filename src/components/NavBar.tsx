import { createClient } from "@/lib/supabase/server";
import SignOutButton from "./SignOutButton";
import Link from "next/link";

export default async function NavBar() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const isAdmin = user?.user_metadata?.role === "admin";

  return (
    <nav className="bg-white border-b border-gray-200">
      <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <Link href="/dashboard" className="text-base font-bold text-indigo-600">
            TimeOff
          </Link>
          {isAdmin && (
            <Link href="/admin" className="text-sm text-gray-600 hover:text-gray-900">
              Admin
            </Link>
          )}
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-500">{user?.email}</span>
          <SignOutButton />
        </div>
      </div>
    </nav>
  );
}
