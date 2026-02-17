import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  createAdminClient: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: mocks.createClient,
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: mocks.createAdminClient,
}));

import {
  acceptInviteAction,
  inviteMemberAction,
  oauthSignInAction,
  removeMemberAction,
  resendInviteAction,
  revokeInviteAction,
  updateMemberRoleAction,
} from "../../../app/auth/actions";

function formDataOf(entries: Record<string, string>) {
  const form = new FormData();
  Object.entries(entries).forEach(([key, value]) => form.set(key, value));
  return form;
}

async function expectRedirect(promise: Promise<unknown>, url: string) {
  await expect(promise).rejects.toThrow(`REDIRECT:${url}`);
}

function mockMembershipQuery(result: unknown) {
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    single: vi.fn(async () => ({ data: result, error: null })),
  };

  return builder;
}

function mockUpdateQuery(error: { message: string } | null = null) {
  const builder = {
    update: vi.fn(() => builder),
    eq: vi.fn(() => builder),
  } as {
    update: ReturnType<typeof vi.fn>;
    eq: ReturnType<typeof vi.fn>;
  };

  const originalEq = builder.eq;
  builder.eq = vi.fn((...args: unknown[]) => {
    (originalEq as (...callArgs: unknown[]) => unknown)(...args);
    if (builder.eq.mock.calls.length >= 2) {
      return Promise.resolve({ error });
    }
    return builder;
  });

  return builder;
}

function mockDeleteQuery(error: { message: string } | null = null) {
  const builder = {
    delete: vi.fn(() => builder),
    eq: vi.fn(() => builder),
  } as {
    delete: ReturnType<typeof vi.fn>;
    eq: ReturnType<typeof vi.fn>;
  };

  const originalEq = builder.eq;
  builder.eq = vi.fn((...args: unknown[]) => {
    (originalEq as (...callArgs: unknown[]) => unknown)(...args);
    if (builder.eq.mock.calls.length >= 2) {
      return Promise.resolve({ error });
    }
    return builder;
  });

  return builder;
}

function mockCountQuery(count: number) {
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
  } as {
    select: ReturnType<typeof vi.fn>;
    eq: ReturnType<typeof vi.fn>;
  };

  const originalEq = builder.eq;
  builder.eq = vi.fn((...args: unknown[]) => {
    (originalEq as (...callArgs: unknown[]) => unknown)(...args);
    if (builder.eq.mock.calls.length >= 2) {
      return Promise.resolve({ count, error: null });
    }
    return builder;
  });

  return builder;
}

describe("auth actions invite lifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("redirects when invite form data is missing", async () => {
    await expectRedirect(
      inviteMemberAction(formDataOf({ invite_email: "", invite_role: "", firm_id: "" })),
      "/dashboard?error=Missing%20invite%20details",
    );
  });

  it("blocks non-owner from inviting members", async () => {
    const nonOwnerQuery = mockMembershipQuery({ id: "m1", role: "attorney" });

    mocks.createClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({ data: { user: { id: "u1" } } })),
      },
      from: vi.fn((table: string) => {
        if (table === "firm_memberships") return nonOwnerQuery;
        throw new Error(`unexpected table: ${table}`);
      }),
    });

    await expectRedirect(
      inviteMemberAction(
        formDataOf({
          invite_email: "new@firm.com",
          invite_role: "attorney",
          firm_id: "firm-1",
        }),
      ),
      "/dashboard?error=Only%20owners%20can%20invite%20members",
    );
  });

  it("creates invitation record and redirects on success", async () => {
    const ownerQuery = mockMembershipQuery({ id: "m1", role: "owner" });
    const existingOwnerQuery = mockMembershipQuery({ id: "m1" });
    const insertMock = vi.fn(async () => ({ error: null }));

    const fromMock = vi.fn((table: string) => {
      if (table === "firm_memberships") {
        const callCount = fromMock.mock.calls.filter(([t]) => t === "firm_memberships").length;
        return callCount === 1 ? ownerQuery : existingOwnerQuery;
      }
      if (table === "firm_invitations") {
        return {
          insert: insertMock,
        };
      }
      throw new Error(`unexpected table: ${table}`);
    });

    mocks.createClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({ data: { user: { id: "owner-1" } } })),
      },
      from: fromMock,
    });

    mocks.createAdminClient.mockReturnValue({
      auth: {
        admin: {
          inviteUserByEmail: vi.fn(async () => ({
            data: { user: { id: "user-2" } },
            error: null,
          })),
        },
      },
    });

    await expectRedirect(
      inviteMemberAction(
        formDataOf({
          invite_email: "new@firm.com",
          invite_role: "ops",
          firm_id: "firm-1",
        }),
      ),
      "/dashboard?message=Invitation%20sent",
    );

    expect(insertMock).toHaveBeenCalledTimes(1);
    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "new@firm.com",
        role: "ops",
        status: "pending",
      }),
    );
  });

  it("accept invite redirects with error when RPC fails", async () => {
    mocks.createClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({ data: { user: { id: "u1" } } })),
      },
      rpc: vi.fn(async () => ({ error: { message: "invitation expired" } })),
    });

    await expectRedirect(
      acceptInviteAction(formDataOf({ invitation_id: "inv-1" })),
      "/invite?error=invitation%20expired",
    );
  });

  it("accept invite redirects to dashboard on success", async () => {
    mocks.createClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({ data: { user: { id: "u1" } } })),
      },
      rpc: vi.fn(async () => ({ error: null })),
    });

    await expectRedirect(
      acceptInviteAction(formDataOf({ invitation_id: "inv-1" })),
      "/dashboard?message=Invitation%20accepted",
    );
  });

  it("resend invite blocks non-owner", async () => {
    const nonOwnerQuery = mockMembershipQuery({ id: "m1", role: "attorney" });

    mocks.createClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({ data: { user: { id: "u1" } } })),
      },
      from: vi.fn((table: string) => {
        if (table === "firm_memberships") return nonOwnerQuery;
        throw new Error(`unexpected table: ${table}`);
      }),
    });

    await expectRedirect(
      resendInviteAction(
        formDataOf({
          invitation_id: "inv-1",
          firm_id: "firm-1",
        }),
      ),
      "/dashboard?error=Only%20owners%20can%20resend%20invites",
    );
  });

  it("resend invite updates pending invitation and redirects on success", async () => {
    const ownerQuery = mockMembershipQuery({ id: "m1", role: "owner" });
    const invitationQuery = mockMembershipQuery({
      id: "inv-1",
      email: "new@firm.com",
      status: "pending",
    });
    const updateQuery = mockUpdateQuery(null);

    const fromMock = vi.fn((table: string) => {
      if (table === "firm_memberships") return ownerQuery;
      if (table === "firm_invitations") {
        const callCount = fromMock.mock.calls.filter(([t]) => t === "firm_invitations").length;
        return callCount === 1 ? invitationQuery : updateQuery;
      }
      throw new Error(`unexpected table: ${table}`);
    });

    mocks.createClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({ data: { user: { id: "owner-1" } } })),
      },
      from: fromMock,
    });

    mocks.createAdminClient.mockReturnValue({
      auth: {
        admin: {
          inviteUserByEmail: vi.fn(async () => ({
            data: { user: { id: "user-2" } },
            error: null,
          })),
        },
      },
    });

    await expectRedirect(
      resendInviteAction(
        formDataOf({
          invitation_id: "inv-1",
          firm_id: "firm-1",
        }),
      ),
      "/dashboard?message=Invitation%20resent",
    );

    expect(updateQuery.update).toHaveBeenCalledTimes(1);
    expect(updateQuery.update).toHaveBeenCalledWith(
      expect.objectContaining({
        invited_user_id: "user-2",
      }),
    );
  });

  it("revoke invite updates status and redirects on success", async () => {
    const ownerQuery = mockMembershipQuery({ id: "m1", role: "owner" });
    const revokeUpdateQuery = mockUpdateQuery(null);

    const fromMock = vi.fn((table: string) => {
      if (table === "firm_memberships") return ownerQuery;
      if (table === "firm_invitations") return revokeUpdateQuery;
      throw new Error(`unexpected table: ${table}`);
    });

    mocks.createClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({ data: { user: { id: "owner-1" } } })),
      },
      from: fromMock,
    });

    await expectRedirect(
      revokeInviteAction(
        formDataOf({
          invitation_id: "inv-1",
          firm_id: "firm-1",
        }),
      ),
      "/dashboard?message=Invitation%20revoked",
    );

    expect(revokeUpdateQuery.update).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "revoked",
      }),
    );
  });

  it("blocks downgrading the last owner", async () => {
    const ownerQuery = mockMembershipQuery({ id: "m-owner", role: "owner" });
    const targetQuery = mockMembershipQuery({ id: "m-target", role: "owner" });
    const countQuery = mockCountQuery(1);

    const fromMock = vi.fn((table: string) => {
      if (table !== "firm_memberships") {
        throw new Error(`unexpected table: ${table}`);
      }
      const callCount = fromMock.mock.calls.filter(([t]) => t === "firm_memberships").length;
      if (callCount === 1) return ownerQuery;
      if (callCount === 2) return targetQuery;
      return countQuery;
    });

    mocks.createClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({ data: { user: { id: "owner-1" } } })),
      },
      from: fromMock,
    });

    await expectRedirect(
      updateMemberRoleAction(
        formDataOf({
          membership_id: "m-target",
          firm_id: "firm-1",
          new_role: "attorney",
        }),
      ),
      "/dashboard?error=Cannot%20downgrade%20the%20last%20owner",
    );
  });

  it("blocks removing the last owner", async () => {
    const ownerQuery = mockMembershipQuery({ id: "m-owner", role: "owner" });
    const targetQuery = mockMembershipQuery({ id: "m-target", role: "owner", user_id: "owner-2" });
    const countQuery = mockCountQuery(1);
    const deleteQuery = mockDeleteQuery(null);

    const fromMock = vi.fn((table: string) => {
      if (table !== "firm_memberships") {
        throw new Error(`unexpected table: ${table}`);
      }
      const callCount = fromMock.mock.calls.filter(([t]) => t === "firm_memberships").length;
      if (callCount === 1) return ownerQuery;
      if (callCount === 2) return targetQuery;
      if (callCount === 3) return countQuery;
      return deleteQuery;
    });

    mocks.createClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({ data: { user: { id: "owner-1" } } })),
      },
      from: fromMock,
    });

    await expectRedirect(
      removeMemberAction(
        formDataOf({
          membership_id: "m-target",
          firm_id: "firm-1",
        }),
      ),
      "/dashboard?error=Cannot%20remove%20the%20last%20owner",
    );
  });

  it("oauth sign-in rejects unsupported providers", async () => {
    await expectRedirect(
      oauthSignInAction(formDataOf({ provider: "linkedin" })),
      "/auth/sign-in?error=Unsupported%20OAuth%20provider",
    );
  });

  it("oauth sign-in redirects to provider url on success", async () => {
    const signInWithOAuth = vi.fn(async () => ({
      data: {
        url: "https://example.com/oauth/start",
      },
      error: null,
    }));

    mocks.createClient.mockResolvedValue({
      auth: {
        signInWithOAuth,
      },
    });

    await expectRedirect(
      oauthSignInAction(formDataOf({ provider: "google" })),
      "https://example.com/oauth/start",
    );

    expect(signInWithOAuth).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "google",
      }),
    );
  });

  it("blocks removing yourself from the firm", async () => {
    const ownerQuery = mockMembershipQuery({ id: "m-owner", role: "owner" });
    const targetQuery = mockMembershipQuery({ id: "m-owner", role: "owner", user_id: "owner-1" });

    const fromMock = vi.fn((table: string) => {
      if (table !== "firm_memberships") {
        throw new Error(`unexpected table: ${table}`);
      }
      const callCount = fromMock.mock.calls.filter(([t]) => t === "firm_memberships").length;
      if (callCount === 1) return ownerQuery;
      return targetQuery;
    });

    mocks.createClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({ data: { user: { id: "owner-1" } } })),
      },
      from: fromMock,
    });

    await expectRedirect(
      removeMemberAction(
        formDataOf({
          membership_id: "m-owner",
          firm_id: "firm-1",
        }),
      ),
      "/dashboard?error=Use%20Sign%20out%20instead%20of%20removing%20yourself",
    );
  });
});
