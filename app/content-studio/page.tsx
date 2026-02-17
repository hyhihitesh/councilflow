import Link from "next/link";
import { redirect } from "next/navigation";

import { CopyLinkedInButton } from "@/components/content/copy-linkedin-button";
import { AppShell } from "@/components/layout/app-shell";
import { getFirmAccessState } from "@/lib/billing/entitlements";
import { createClient } from "@/lib/supabase/server";

type SearchParams = {
  error?: string;
  message?: string;
};

type DraftRow = {
  id: string;
  channel: string;
  status: string;
  title: string;
  body: string;
  topic: string | null;
  version: number;
  published_at: string | null;
  created_at: string;
  preview_payload: Record<string, unknown> | null;
  publish_adapter: string | null;
  published_via: string | null;
  provider: string | null;
  provider_status: string | null;
  provider_post_id: string | null;
  provider_published_at: string | null;
  provider_error_code: string | null;
  provider_error_message: string | null;
};

export default async function ContentStudioPage({
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
    redirect("/auth/sign-in");
  }

  const { data: memberships } = await supabase
    .from("firm_memberships")
    .select("firm_id, firms(name)")
    .eq("user_id", user.id)
    .limit(1);

  if (!memberships || memberships.length === 0) {
    redirect("/onboarding");
  }

  const primary = memberships[0];
  const firm = Array.isArray(primary.firms) ? primary.firms[0] : primary.firms;
  const accessState = await getFirmAccessState({
    supabase,
    firmId: primary.firm_id,
  });

  const { data: drafts } = await supabase
    .from("content_drafts")
    .select(
      "id, channel, status, title, body, topic, version, published_at, created_at, preview_payload, publish_adapter, published_via, provider, provider_status, provider_post_id, provider_published_at, provider_error_code, provider_error_message",
    )
    .eq("firm_id", primary.firm_id)
    .order("created_at", { ascending: false })
    .limit(24);

  const typedDrafts = ((drafts ?? []) as DraftRow[]).map((draft) => ({
    ...draft,
    preview_payload:
      draft.preview_payload && typeof draft.preview_payload === "object"
        ? draft.preview_payload
        : null,
  }));
  const linkedinDrafts = typedDrafts.filter((draft) => draft.channel === "linkedin");
  const newsletterDrafts = typedDrafts.filter((draft) => draft.channel === "newsletter");

  function previewDate(value: string) {
    return new Date(value).toLocaleDateString();
  }

  function resolveProviderField(draft: DraftRow, key: keyof DraftRow) {
    const direct = draft[key];
    if (typeof direct === "string" && direct.trim().length > 0) return direct;

    const payload = draft.preview_payload ?? {};
    const payloadValue = payload[key as string];
    if (typeof payloadValue === "string" && payloadValue.trim().length > 0) return payloadValue;

    return null;
  }

  return (
    <AppShell
      title="Content Studio"
      description={`Firm: ${firm?.name ?? "Unknown"} | Generate, edit, approve, and publish thought-leadership drafts.`}
      billingAccessState={accessState.ok ? accessState.accessState : "active"}
      billingAccessContext={
        accessState.ok
          ? {
              trialEndsAt: accessState.trialEndsAt,
              graceEndsAt: accessState.graceEndsAt,
            }
          : undefined
      }
      currentPath="/content-studio"
      mobileCta={{ href: "/pipeline", label: "Open Follow-Up Pipeline" }}
      headerActions={
        <>
          <Link
            href="/pipeline"
            className="rounded-md border border-amber-300/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200"
          >
            Open pipeline
          </Link>
          <Link
            href="/analytics"
            className="rounded-md border border-indigo-300/30 bg-indigo-500/10 px-3 py-2 text-xs text-indigo-200"
          >
            Open analytics
          </Link>
          <Link
            href="/dashboard"
            className="rounded-md border border-white/20 bg-[#111827] px-3 py-2 text-xs"
          >
            Back to dashboard
          </Link>
        </>
      }
    >

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

        <section className="mt-6 grid gap-4 md:grid-cols-2 reveal-up stagger-children">
          <article className="glass-card p-5">
            <h2 className="text-lg font-semibold">LinkedIn Weekly Draft</h2>
            <p className="mt-2 text-sm text-[#94A3B8]">
              Generate a concise post with hook, POV, and clear discussion CTA.
            </p>
            <form action="/api/content/drafts/generate" method="post" className="mt-4 grid gap-3">
              <input type="hidden" name="channel" value="linkedin" />
              <label className="grid gap-1">
                <span className="sr-only">LinkedIn draft topic</span>
                <input
                  name="topic"
                  placeholder="Topic (ex: client retention signals)"
                  className="rounded-md border border-white/15 bg-[#0D1117] px-3 py-2 text-sm outline-none ring-[#8B5CF6] focus:ring-2"
                />
              </label>
              <button
                type="submit"
                className="btn-base btn-primary"
              >
                Generate LinkedIn draft
              </button>
            </form>
          </article>

          <article className="glass-card p-5">
            <h2 className="text-lg font-semibold">Newsletter Monthly Draft</h2>
            <p className="mt-2 text-sm text-[#94A3B8]">
              Generate a structured brief with sections and practical recommendations.
            </p>
            <form action="/api/content/drafts/generate" method="post" className="mt-4 grid gap-3">
              <input type="hidden" name="channel" value="newsletter" />
              <label className="grid gap-1">
                <span className="sr-only">Newsletter draft topic</span>
                <input
                  name="topic"
                  placeholder="Topic (ex: outbound quality metrics)"
                  className="rounded-md border border-white/15 bg-[#0D1117] px-3 py-2 text-sm outline-none ring-[#8B5CF6] focus:ring-2"
                />
              </label>
              <button
                type="submit"
                className="btn-base btn-primary"
              >
                Generate newsletter draft
              </button>
            </form>
          </article>
        </section>

        <section className="mt-8 grid gap-4 md:grid-cols-2 reveal-up stagger-children">
          <article className="glass-card p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">LinkedIn Drafts</h2>
              <span className="rounded-full bg-[#111827] px-2 py-0.5 text-xs text-[#94A3B8]">
                {linkedinDrafts.length}
              </span>
            </div>
            <div className="mt-4 space-y-4">
              {linkedinDrafts.map((draft) => (
                <div key={draft.id} className="rounded-xl border border-white/10 bg-[#0D1117] p-4">
                  {(() => {
                    const providerStatus = resolveProviderField(draft, "provider_status");
                    const providerPostId = resolveProviderField(draft, "provider_post_id");
                    const providerErrorCode = resolveProviderField(draft, "provider_error_code");
                    const providerErrorMessage = resolveProviderField(draft, "provider_error_message");
                    const publishedVia = resolveProviderField(draft, "published_via");
                    const providerPublishedAt = resolveProviderField(draft, "provider_published_at");
                    const alreadyProviderPublished =
                      draft.status === "published" &&
                      Boolean(providerPostId) &&
                      (providerStatus === "published" || publishedVia === "provider_adapter");

                    return (
                      <>
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs uppercase tracking-[0.12em] text-[#94A3B8]">
                      v{draft.version} | {draft.status}
                    </p>
                    <p className="text-xs text-[#94A3B8]">
                      {previewDate(draft.created_at)}
                    </p>
                  </div>

                  <div className="mt-2 rounded-lg border border-white/10 bg-[#060911] px-3 py-2 text-[11px] text-[#CBD5E1]">
                    <p>
                      Publish status: <span className="font-semibold capitalize">{providerStatus ?? "not published"}</span>
                    </p>
                    {providerPostId ? (
                      <p className="mt-1 break-all">
                        Provider post id: <span className="font-mono text-[10px]">{providerPostId}</span>
                      </p>
                    ) : null}
                    {providerPublishedAt ? (
                      <p className="mt-1">Provider published at: {new Date(providerPublishedAt).toLocaleString()}</p>
                    ) : null}
                    {providerErrorCode || providerErrorMessage ? (
                      <p className="mt-1 text-amber-300">
                        Last provider error: {[providerErrorCode, providerErrorMessage].filter(Boolean).join(" | ")}
                      </p>
                    ) : null}
                  </div>

                  <div className="mt-3 grid gap-3 lg:grid-cols-2">
                    <form action="/api/content/drafts/decision" method="post" className="grid gap-2">
                      <input type="hidden" name="draft_id" value={draft.id} />
                      <input type="hidden" name="action" value="save" />
                      <label className="grid gap-1">
                        <span className="sr-only">LinkedIn draft title</span>
                        <input
                          name="title"
                          defaultValue={draft.title}
                          className="input-base text-sm px-2 py-1.5"
                        />
                      </label>
                      <label className="grid gap-1">
                        <span className="sr-only">LinkedIn draft body</span>
                        <textarea
                          name="body"
                          defaultValue={draft.body}
                          rows={8}
                          className="input-base text-xs font-medium px-2 py-1.5"
                        />
                      </label>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="submit"
                          className="rounded-md border border-white/20 bg-[#111827] px-2.5 py-1 text-xs"
                        >
                          Save edits
                        </button>
                      </div>
                    </form>

                    <div className="rounded-lg border border-white/10 bg-[#060911] p-3">
                      <p className="text-[11px] uppercase tracking-[0.16em] text-[#94A3B8]">
                        Live preview
                      </p>
                      <div className="mt-2 rounded-lg border border-white/10 bg-[#0B1220] p-3">
                        <p className="text-sm font-semibold">{draft.title}</p>
                        <p className="mt-2 whitespace-pre-wrap text-xs text-[#CBD5E1]">{draft.body}</p>
                        <div className="mt-3 flex flex-wrap gap-1 text-[11px] text-[#94A3B8]">
                          {draft.body
                            .split(/\s+/)
                            .filter((token: string) => token.startsWith("#"))
                            .slice(0, 5)
                            .map((tag: string) => (
                              <span key={`${draft.id}-${tag}`} className="rounded bg-white/5 px-1.5 py-0.5">
                                {tag}
                              </span>
                            ))}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    <form action="/api/content/drafts/decision" method="post">
                      <input type="hidden" name="draft_id" value={draft.id} />
                      <input type="hidden" name="action" value="approve" />
                      <button
                        type="submit"
                        className="rounded-md border border-emerald-300/40 bg-emerald-500/10 px-2.5 py-1 text-xs text-emerald-200"
                      >
                        Approve
                      </button>
                    </form>
                    {draft.status === "approved" || draft.status === "published" ? (
                      <>
                        <form action="/api/content/drafts/decision" method="post">
                          <input type="hidden" name="draft_id" value={draft.id} />
                          <input type="hidden" name="action" value="publish" />
                          <input type="hidden" name="publish_adapter" value="manual_copy" />
                          <button
                            type="submit"
                            className="rounded-md border border-cyan-300/40 bg-cyan-500/10 px-2.5 py-1 text-xs text-cyan-200"
                          >
                            Mark as Published (Manual Fallback)
                          </button>
                        </form>
                        <form action="/api/content/drafts/decision" method="post">
                          <input type="hidden" name="draft_id" value={draft.id} />
                          <input type="hidden" name="action" value="publish" />
                          <input type="hidden" name="publish_adapter" value="linkedin_api" />
                          <button
                            type="submit"
                            disabled={alreadyProviderPublished}
                            className="rounded-md border border-fuchsia-300/40 bg-fuchsia-500/10 px-2.5 py-1 text-xs text-fuchsia-200 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {alreadyProviderPublished ? "Already Published to LinkedIn" : "Publish to LinkedIn"}
                          </button>
                        </form>
                      </>
                    ) : null}
                    <CopyLinkedInButton draftId={draft.id} text={`${draft.title}\n\n${draft.body}`} />
                  </div>
                      </>
                    );
                  })()}
                </div>
              ))}
              {!linkedinDrafts.length ? (
                <p className="rounded-lg border border-dashed border-white/20 bg-[#0D1117] px-3 py-2 text-sm text-[#94A3B8]">
                  No LinkedIn drafts yet.
                </p>
              ) : null}
            </div>
          </article>

          <article className="glass-card p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Newsletter Drafts</h2>
              <span className="rounded-full bg-[#111827] px-2 py-0.5 text-xs text-[#94A3B8]">
                {newsletterDrafts.length}
              </span>
            </div>
            <div className="mt-4 space-y-4">
              {newsletterDrafts.map((draft) => (
                <div key={draft.id} className="rounded-xl border border-white/10 bg-[#0D1117] p-4">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs uppercase tracking-[0.12em] text-[#94A3B8]">
                      v{draft.version} | {draft.status}
                    </p>
                    <p className="text-xs text-[#94A3B8]">
                      {previewDate(draft.created_at)}
                    </p>
                  </div>

                  <div className="mt-3 grid gap-3 lg:grid-cols-2">
                    <form action="/api/content/drafts/decision" method="post" className="grid gap-2">
                      <input type="hidden" name="draft_id" value={draft.id} />
                      <input type="hidden" name="action" value="save" />
                      <label className="grid gap-1">
                        <span className="sr-only">Newsletter draft title</span>
                        <input
                          name="title"
                          defaultValue={draft.title}
                          className="input-base text-sm px-2 py-1.5"
                        />
                      </label>
                      <label className="grid gap-1">
                        <span className="sr-only">Newsletter draft body</span>
                        <textarea
                          name="body"
                          defaultValue={draft.body}
                          rows={10}
                          className="input-base text-xs px-2 py-1.5"
                        />
                      </label>
                      <button
                        type="submit"
                        className="rounded-md border border-white/20 bg-[#111827] px-2.5 py-1 text-xs"
                      >
                        Save edits
                      </button>
                    </form>

                    <div className="rounded-lg border border-white/10 bg-[#060911] p-3">
                      <p className="text-[11px] uppercase tracking-[0.16em] text-[#94A3B8]">
                        Live preview
                      </p>
                      <div className="mt-2 rounded-lg border border-white/10 bg-[#F8FAFC] p-4 text-[#111827]">
                        <p className="text-xs text-[#475569]">From: inhumans.io</p>
                        <p className="mt-1 text-sm font-semibold">{draft.title}</p>
                        <div className="mt-3 h-px bg-[#E2E8F0]" />
                        <p className="mt-3 whitespace-pre-wrap text-xs leading-6">{draft.body}</p>
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    <form action="/api/content/drafts/decision" method="post">
                      <input type="hidden" name="draft_id" value={draft.id} />
                      <input type="hidden" name="action" value="approve" />
                      <button
                        type="submit"
                        className="rounded-md border border-emerald-300/40 bg-emerald-500/10 px-2.5 py-1 text-xs text-emerald-200"
                      >
                        Approve
                      </button>
                    </form>
                    {draft.status === "approved" || draft.status === "published" ? (
                      <form action="/api/content/drafts/decision" method="post">
                        <input type="hidden" name="draft_id" value={draft.id} />
                        <input type="hidden" name="action" value="publish" />
                        <button
                          type="submit"
                          className="rounded-md border border-cyan-300/40 bg-cyan-500/10 px-2.5 py-1 text-xs text-cyan-200"
                        >
                          Mark published
                        </button>
                      </form>
                    ) : null}
                    {draft.published_at ? (
                      <p className="text-xs text-emerald-300">
                        Published {new Date(draft.published_at).toLocaleString()}
                      </p>
                    ) : null}
                  </div>
                </div>
              ))}
              {!newsletterDrafts.length ? (
                <p className="rounded-lg border border-dashed border-white/20 bg-[#0D1117] px-3 py-2 text-sm text-[#94A3B8]">
                  No newsletter drafts yet.
                </p>
              ) : null}
            </div>
          </article>
        </section>
    </AppShell>
  );
}



