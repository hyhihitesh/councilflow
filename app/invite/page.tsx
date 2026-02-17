import Link from "next/link";
import { redirect } from "next/navigation";

import { acceptInviteAction } from "@/app/auth/actions";
import { createClient } from "@/lib/supabase/server";

type SearchParams = {
  error?: string;
  message?: string;
};

export default async function InvitePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/sign-in?error=Please%20sign%20in%20to%20view%20invites");
  }

  const { data: pendingInvites } = await supabase
    .from("firm_invitations")
    .select("id, firm_id, email, role, expires_at")
    .eq("status", "pending")
    .order("invited_at", { ascending: false });

  const firmIds = (pendingInvites ?? []).map((invite) => invite.firm_id);
  const { data: firms } = firmIds.length
    ? await supabase.from("firms").select("id, name").in("id", firmIds)
    : { data: [] };

  const firmMap = new Map((firms ?? []).map((firm) => [firm.id, firm.name]));

  return (
    <div className="min-h-screen bg-[#060911] text-[#F1F5F9]">
      <main className="mx-auto flex min-h-screen w-full max-w-4xl flex-col px-4 py-10 sm:px-6 sm:py-12">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-[#94A3B8]">
              inhumans.io
            </p>
            <h1 className="mt-2 text-3xl font-semibold">Pending invitations</h1>
          </div>
          <Link
            className="rounded-md border border-white/20 bg-[#161B22] px-4 py-2 text-sm"
            href="/dashboard"
          >
            Back to dashboard
          </Link>
        </div>

        {params.error ? (
          <p className="mt-6 alert-error">
            {params.error}
          </p>
        ) : null}
        {params.message ? (
          <p className="mt-6 alert-success">
            {params.message}
          </p>
        ) : null}

        <section className="mt-6 table-shell">
          <table className="w-full text-left text-sm">
            <thead className="bg-[#0D1117] text-[#94A3B8]">
              <tr>
                <th className="px-4 py-3 font-medium">Firm</th>
                <th className="px-4 py-3 font-medium">Role</th>
                <th className="px-4 py-3 font-medium">Invite email</th>
                <th className="px-4 py-3 font-medium">Expires</th>
                <th className="px-4 py-3 font-medium">Action</th>
              </tr>
            </thead>
            <tbody>
              {(pendingInvites ?? []).length === 0 ? (
                <tr>
                  <td className="px-4 py-6 text-[#94A3B8]" colSpan={5}>
                    No pending invitations.
                  </td>
                </tr>
              ) : (
                (pendingInvites ?? []).map((invite) => (
                  <tr key={invite.id} className="border-t border-white/10">
                    <td className="px-4 py-3">{firmMap.get(invite.firm_id) ?? "Unknown"}</td>
                    <td className="px-4 py-3 capitalize">{invite.role}</td>
                    <td className="px-4 py-3">{invite.email}</td>
                    <td className="px-4 py-3">
                      {new Date(invite.expires_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3">
                      <form action={acceptInviteAction}>
                        <input type="hidden" name="invitation_id" value={invite.id} />
                        <button
                          type="submit"
                          className="rounded-md bg-gradient-to-r from-[#6366F1] to-[#8B5CF6] px-3 py-1.5 text-xs font-medium"
                        >
                          Accept
                        </button>
                      </form>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </section>
      </main>
    </div>
  );
}


