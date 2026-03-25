import { afterAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const runIntegration =
  process.env.RUN_RLS_INTEGRATION === "1" && Boolean(url && anonKey && serviceRoleKey);

const describeIf = runIntegration ? describe : describe.skip;

const createdUsers: string[] = [];
const createdFirms: string[] = [];

function mustEnv(name: string, value: string | undefined) {
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

function buildAnonClient() {
  return createClient(
    mustEnv("NEXT_PUBLIC_SUPABASE_URL", url),
    mustEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", anonKey),
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );
}

function buildAdminClient() {
  return createClient(
    mustEnv("NEXT_PUBLIC_SUPABASE_URL", url),
    mustEnv("SUPABASE_SERVICE_ROLE_KEY", serviceRoleKey),
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );
}

async function createConfirmedUser(
  adminClient: SupabaseClient,
  email: string,
  password: string,
) {
  const { data, error } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (error || !data.user) {
    throw new Error(`createUser failed: ${error?.message ?? "unknown error"}`);
  }

  createdUsers.push(data.user.id);
  return data.user.id;
}

async function signInAs(email: string, password: string) {
  const client = buildAnonClient();
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) {
    throw new Error(`signInWithPassword failed for ${email}: ${error.message}`);
  }
  return client;
}

describeIf("RLS adversarial tenant isolation checks", () => {
  it("prevents cross-tenant reads and writes between authenticated users", async () => {
    const adminClient = buildAdminClient();
    const seed = crypto.randomUUID();
    const password = "CouncilFlow!234";
    const ownerAEmail = `rls-owner-a-${seed}@example.com`;
    const ownerBEmail = `rls-owner-b-${seed}@example.com`;

    const ownerAId = await createConfirmedUser(adminClient, ownerAEmail, password);
    const ownerBId = await createConfirmedUser(adminClient, ownerBEmail, password);

    const ownerAClient = await signInAs(ownerAEmail, password);
    const ownerBClient = await signInAs(ownerBEmail, password);

    const firmAResult = await ownerAClient.rpc("create_firm_with_owner", {
      firm_name: `RLS Firm A ${seed}`,
    });
    const firmBResult = await ownerBClient.rpc("create_firm_with_owner", {
      firm_name: `RLS Firm B ${seed}`,
    });

    expect(firmAResult.error).toBeNull();
    expect(firmBResult.error).toBeNull();
    expect(typeof firmAResult.data).toBe("string");
    expect(typeof firmBResult.data).toBe("string");

    const firmAId = firmAResult.data as string;
    const firmBId = firmBResult.data as string;
    createdFirms.push(firmAId, firmBId);

    const inviteInsert = await ownerBClient.from("firm_invitations").insert({
      firm_id: firmBId,
      email: `pending-${seed}@example.com`,
      role: "attorney",
      invited_by: ownerBId,
      invited_user_id: ownerAId,
      status: "pending",
    });
    expect(inviteInsert.error).toBeNull();

    const foreignMembershipRead = await ownerAClient
      .from("firm_memberships")
      .select("id, firm_id")
      .eq("firm_id", firmBId);
    expect(foreignMembershipRead.error).toBeNull();
    expect(foreignMembershipRead.data).toHaveLength(0);

    const foreignInviteRead = await ownerAClient
      .from("firm_invitations")
      .select("id, firm_id")
      .eq("firm_id", firmBId);
    expect(foreignInviteRead.error).toBeNull();
    expect(foreignInviteRead.data).toHaveLength(0);

    const foreignFirmUpdate = await ownerAClient
      .from("firms")
      .update({ name: `Illegal Update ${seed}` })
      .eq("id", firmBId);
    expect(foreignFirmUpdate.error).not.toBeNull();

    const foreignMembershipInsert = await ownerAClient.from("firm_memberships").insert({
      firm_id: firmBId,
      user_id: ownerAId,
      role: "attorney",
    });
    expect(foreignMembershipInsert.error).not.toBeNull();

    const prospectInsert = await ownerBClient.from("prospects").insert({
      firm_id: firmBId,
      source: "manual",
      company_name: `Target ${seed}`,
      domain: `target-${seed}.example.com`,
      created_by: ownerBId,
      fit_score: 70,
      status: "new",
    }).select("id").single();
    expect(prospectInsert.error).toBeNull();
    expect(prospectInsert.data?.id).toBeTruthy();

    const prospectId = prospectInsert.data!.id as string;

    const signalInsert = await ownerBClient.from("prospect_signals").insert({
      firm_id: firmBId,
      prospect_id: prospectId,
      signal_type: "funding_event",
      signal_source: "tavily",
      summary: "Recent funding noted",
      created_by: ownerBId,
    });
    expect(signalInsert.error).toBeNull();

    const enrichmentInsert = await ownerBClient.from("prospect_enrichment_runs").insert({
      firm_id: firmBId,
      prospect_id: prospectId,
      provider: "tavily",
      status: "completed",
      created_by: ownerBId,
    });
    expect(enrichmentInsert.error).toBeNull();

    const researchRunInsert = await ownerBClient.from("research_runs").insert({
      firm_id: firmBId,
      trigger_type: "manual",
      status: "completed",
      requested_by: ownerBId,
    });
    expect(researchRunInsert.error).toBeNull();

    const foreignProspectRead = await ownerAClient
      .from("prospects")
      .select("id, firm_id")
      .eq("firm_id", firmBId);
    expect(foreignProspectRead.error).toBeNull();
    expect(foreignProspectRead.data).toHaveLength(0);

    const foreignSignalRead = await ownerAClient
      .from("prospect_signals")
      .select("id, firm_id")
      .eq("firm_id", firmBId);
    expect(foreignSignalRead.error).toBeNull();
    expect(foreignSignalRead.data).toHaveLength(0);

    const foreignEnrichmentRead = await ownerAClient
      .from("prospect_enrichment_runs")
      .select("id, firm_id")
      .eq("firm_id", firmBId);
    expect(foreignEnrichmentRead.error).toBeNull();
    expect(foreignEnrichmentRead.data).toHaveLength(0);

    const foreignResearchRunRead = await ownerAClient
      .from("research_runs")
      .select("id, firm_id")
      .eq("firm_id", firmBId);
    expect(foreignResearchRunRead.error).toBeNull();
    expect(foreignResearchRunRead.data).toHaveLength(0);

    const foreignProspectUpdate = await ownerAClient
      .from("prospects")
      .update({ status: "qualified" })
      .eq("id", prospectId)
      .eq("firm_id", firmBId);
    expect(foreignProspectUpdate.error).not.toBeNull();

    const foreignResearchRunInsert = await ownerAClient.from("research_runs").insert({
      firm_id: firmBId,
      trigger_type: "manual",
      status: "queued",
      requested_by: ownerAId,
    });
    expect(foreignResearchRunInsert.error).not.toBeNull();
  });
});

afterAll(async () => {
  if (!runIntegration) return;

  const adminClient = buildAdminClient();

  if (createdFirms.length > 0) {
    await adminClient.from("firms").delete().in("id", createdFirms);
  }

  for (const userId of createdUsers) {
    await adminClient.auth.admin.deleteUser(userId);
  }
});
