import { createClient } from "@/lib/supabase/server";
import {
  removeMemberAction,
  inviteMemberAction,
  resendInviteAction,
  revokeInviteAction,
  updateMemberRoleAction,
} from "@/app/auth/actions";

interface TeamSectionProps {
  firmId: string;
  userId: string;
  isOwner: boolean;
}

export async function TeamSection({ firmId, userId, isOwner }: TeamSectionProps) {
  const supabase = await createClient();

  const [
    { data: firmMembers },
    { data: invitations },
  ] = await Promise.all([
    supabase
      .from("firm_memberships")
      .select("id, user_id, role, created_at")
      .eq("firm_id", firmId)
      .order("created_at", { ascending: true }),
    supabase
      .from("firm_invitations")
      .select("id, email, role, status, invited_at, expires_at")
      .eq("firm_id", firmId)
      .order("invited_at", { ascending: false })
      .limit(20),
  ]);

  const memberIds = (firmMembers ?? []).map((m) => m.user_id);
  const { data: memberProfiles } = memberIds.length
    ? await supabase.from("profiles").select("id, display_name").in("id", memberIds)
    : { data: [] };
  const profileMap = new Map((memberProfiles ?? []).map((p) => [p.id, p.display_name]));

  return (
    <section className="mt-8 bg-white border border-[#EBE8E0] p-8 rounded-sm reveal-up shadow-sm">
      <div className="mb-8 pb-6 border-b border-[#F7F6F2]">
        <h2 className="text-xl font-light tracking-tight">Team & Governance</h2>
        <p className="mt-2 text-sm text-[#716E68]">
          Manage firm permissions and administrative access.
        </p>
      </div>

      <div className="table-shell">
        <table className="w-full text-left text-sm">
          <thead>
            <tr>
              <th className="px-5 py-4 font-medium uppercase tracking-widest text-[10px]">Member</th>
              <th className="px-5 py-4 font-medium uppercase tracking-widest text-[10px]">
                Permission
              </th>
              <th className="px-5 py-4 font-medium uppercase tracking-widest text-[10px]">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#F7F6F2]">
            {(firmMembers ?? []).map((member) => (
              <tr key={member.id} className="hover:bg-[#FDFCFB]/50 transition-colors">
                <td className="px-5 py-4">
                  <div className="flex items-center gap-3">
                    <span className="font-medium text-[#2C2A26]">
                      {profileMap.get(member.user_id) ?? member.user_id}
                    </span>
                    {member.user_id === userId && (
                      <span className="px-2 py-0.5 bg-[#EFECE5] text-[#A19D94] text-[9px] uppercase tracking-widest font-bold rounded-full">
                        Personal
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-5 py-4">
                  <span className="status-badge capitalize bg-[#F7F6F2] text-[#716E68]">
                    {member.role}
                  </span>
                </td>
                <td className="px-5 py-4">
                  {isOwner ? (
                    <div className="flex items-center gap-4">
                      <form action={updateMemberRoleAction} className="flex gap-2">
                        <input type="hidden" name="firm_id" value={firmId} />
                        <input type="hidden" name="membership_id" value={member.id} />
                        <select
                          name="new_role"
                          defaultValue={member.role}
                          className="px-2 py-1 bg-[#F7F6F2] border border-[#EBE8E0] text-[11px] rounded outline-none appearance-none cursor-pointer hover:bg-white transition-colors"
                        >
                          <option value="owner">Owner</option>
                          <option value="attorney">Attorney</option>
                          <option value="ops">Ops</option>
                        </select>
                        <button
                          type="submit"
                          className="px-3 py-1 bg-[#2C2A26] text-[#F7F6F2] text-[10px] font-medium rounded uppercase tracking-wider"
                        >
                          Save
                        </button>
                      </form>
                      <form action={removeMemberAction}>
                        <input type="hidden" name="firm_id" value={firmId} />
                        <input type="hidden" name="membership_id" value={member.id} />
                        <button
                          type="submit"
                          className="px-3 py-1 border border-[#FEE2E2] text-red-600 text-[10px] font-medium rounded hover:bg-red-50 transition-colors uppercase tracking-wider disabled:opacity-30 disabled:cursor-not-allowed"
                          disabled={member.user_id === userId}
                        >
                          Remove
                        </button>
                      </form>
                    </div>
                  ) : (
                    <span className="text-[10px] text-[#A19D94] uppercase tracking-widest">
                      Read Only
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {isOwner && (
        <div className="mt-8 pt-8 border-t border-[#F7F6F2]">
          <h3 className="text-sm font-medium mb-4 text-[#2C2A26]">Invite Counsel</h3>
          <form action={inviteMemberAction} className="grid gap-3 md:grid-cols-4">
            <input type="hidden" name="firm_id" value={firmId} />
            <label className="md:col-span-2">
              <input
                className="input-base"
                name="invite_email"
                type="email"
                placeholder="Enter email address..."
                required
              />
            </label>
            <label>
              <select
                className="input-base cursor-pointer"
                name="invite_role"
                defaultValue="attorney"
              >
                <option value="attorney">Attorney</option>
                <option value="ops">Operation</option>
              </select>
            </label>
            <button type="submit" className="btn-primary">
              Send Invitation
            </button>
          </form>
        </div>
      )}

      <div className="mt-8 table-shell">
        <table className="w-full text-left text-sm">
          <thead>
            <tr>
              <th className="px-5 py-4 font-medium uppercase tracking-widest text-[10px]">Email</th>
              <th className="px-5 py-4 font-medium uppercase tracking-widest text-[10px]">Role</th>
              <th className="px-5 py-4 font-medium uppercase tracking-widest text-[10px]">Status</th>
              <th className="px-5 py-4 font-medium uppercase tracking-widest text-[10px]">
                Expires
              </th>
              <th className="px-5 py-4 font-medium uppercase tracking-widest text-[10px]">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#F7F6F2]">
            {(invitations ?? []).map((invite) => (
              <tr key={invite.id} className="hover:bg-[#FDFCFB]/50 transition-colors">
                <td className="px-5 py-4 text-[#2C2A26]">{invite.email}</td>
                <td className="px-5 py-4">
                  <span className="status-badge capitalize bg-[#F7F6F2] text-[#716E68]">
                    {invite.role}
                  </span>
                </td>
                <td className="px-5 py-4 text-[#A19D94]">
                  <span
                    className={invite.status === "pending" ? "text-[#B79455] font-medium" : ""}
                  >
                    {invite.status}
                  </span>
                </td>
                <td className="px-5 py-4 text-[#A19D94] text-xs">
                  {new Date(invite.expires_at).toLocaleDateString()}
                </td>
                <td className="px-5 py-4">
                  {isOwner && invite.status === "pending" ? (
                    <div className="flex gap-2">
                      <form action={resendInviteAction}>
                        <input type="hidden" name="firm_id" value={firmId} />
                        <input type="hidden" name="invitation_id" value={invite.id} />
                        <button
                          type="submit"
                          className="px-3 py-1 bg-[#EFECE5] text-[#716E68] text-[10px] font-medium rounded hover:bg-[#D5D1C6] transition-colors uppercase tracking-wider"
                        >
                          Resend
                        </button>
                      </form>
                      <form action={revokeInviteAction}>
                        <input type="hidden" name="firm_id" value={firmId} />
                        <input type="hidden" name="invitation_id" value={invite.id} />
                        <button
                          type="submit"
                          className="px-3 py-1 border border-[#FEE2E2] text-red-600 text-[10px] font-medium rounded hover:bg-red-50 transition-colors uppercase tracking-wider"
                        >
                          Revoke
                        </button>
                      </form>
                    </div>
                  ) : (
                    <span className="text-[10px] text-[#A19D94] uppercase tracking-widest">-</span>
                  )}
                </td>
              </tr>
            ))}
            {!invitations?.length && (
              <tr>
                <td
                  className="px-5 py-12 text-center text-[#A19D94] text-xs uppercase tracking-widest"
                  colSpan={5}
                >
                  No active invitations
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
