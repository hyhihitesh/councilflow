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
      userEmail={user.email}
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
      headerActions={
        <>
          <Link
            href="/pipeline"
            className="px-4 py-2 border border-[#EBE8E0] text-[#716E68] text-[10px] font-medium rounded-sm hover:text-[#2C2A26] hover:bg-white transition-all uppercase tracking-widest"
          >
            Pipeline Board
          </Link>
          <Link
            href="/analytics"
            className="px-4 py-2 border border-[#EBE8E0] text-[#716E68] text-[10px] font-medium rounded-sm hover:text-[#2C2A26] hover:bg-white transition-all uppercase tracking-widest"
          >
            Performance
          </Link>
          <Link
            href="/dashboard"
            className="px-4 py-2 border border-[#EBE8E0] text-[#716E68] text-[10px] font-medium rounded-sm hover:text-[#2C2A26] hover:bg-white transition-all uppercase tracking-widest"
          >
            Dashboard
          </Link>
        </>
      }
    >
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        {params.error ? (
          <p className="mt-4 alert-error">
            {params.error}
          </p>
        ) : null}
        {params.message ? (
          <p className="mt-4 alert-success">
            {params.message}
          </p>
        ) : null}

        <section className="mt-6 grid gap-6 md:grid-cols-2 reveal-up stagger-children">
          <article className="bg-[#FDFCFB] border border-[#EBE8E0] p-8 shadow-sm rounded-sm">
            <h2 className="text-xl font-light tracking-tight text-[#2C2A26]">LinkedIn Weekly Draft</h2>
            <p className="mt-2 text-sm text-[#716E68]">
              Generate a concise post with hook, POV, and clear discussion CTA.
            </p>
            <form action="/api/content/drafts/generate" method="post" className="mt-6 grid gap-3">
              <input type="hidden" name="channel" value="linkedin" />
              <label className="grid gap-1">
                <span className="sr-only">LinkedIn draft topic</span>
                <input
                  name="topic"
                  placeholder="Topic (ex: client retention signals)"
                  className="w-full rounded border border-[#EBE8E0] bg-white px-4 py-3 text-sm text-[#2C2A26] placeholder-[#A19D94] focus:border-[#716E68] focus:outline-none focus:ring-1 focus:ring-[#716E68] transition-colors"
                />
              </label>
              <button
                type="submit"
                className="mt-2 px-6 py-3 bg-[#2C2A26] text-[#F7F6F2] text-xs font-medium rounded hover:bg-[#4A4742] transition-colors uppercase tracking-wider"
              >
                Generate LinkedIn draft
              </button>
            </form>
          </article>

          <article className="bg-[#FDFCFB] border border-[#EBE8E0] p-8 shadow-sm rounded-sm">
            <h2 className="text-xl font-light tracking-tight text-[#2C2A26]">Newsletter Monthly Draft</h2>
            <p className="mt-2 text-sm text-[#716E68]">
              Generate a structured brief with sections and practical recommendations.
            </p>
            <form action="/api/content/drafts/generate" method="post" className="mt-6 grid gap-3">
              <input type="hidden" name="channel" value="newsletter" />
              <label className="grid gap-1">
                <span className="sr-only">Newsletter draft topic</span>
                <input
                  name="topic"
                  placeholder="Topic (ex: outbound quality metrics)"
                  className="w-full rounded border border-[#EBE8E0] bg-white px-4 py-3 text-sm text-[#2C2A26] placeholder-[#A19D94] focus:border-[#716E68] focus:outline-none focus:ring-1 focus:ring-[#716E68] transition-colors"
                />
              </label>
              <button
                type="submit"
                className="mt-2 px-6 py-3 bg-[#2C2A26] text-[#F7F6F2] text-xs font-medium rounded hover:bg-[#4A4742] transition-colors uppercase tracking-wider"
              >
                Generate newsletter draft
              </button>
            </form>
          </article>
        </section>

        <section className="mt-12 grid gap-12 md:grid-cols-2 reveal-up stagger-children">
          <article className="bg-transparent">
            <div className="flex items-center justify-between border-b border-[#F7F6F2] pb-4 mb-6">
              <h2 className="text-lg font-light tracking-tight text-[#2C2A26]">LinkedIn Drafts</h2>
              <span className="px-2 py-0.5 rounded bg-white border border-[#EBE8E0] text-[10px] uppercase tracking-widest text-[#716E68] font-medium shadow-sm">
                {linkedinDrafts.length}
              </span>
            </div>
            <div className="mt-4 space-y-8">
              {linkedinDrafts.map((draft) => (
                <div key={draft.id} className="rounded border border-[#EBE8E0] bg-[#FDFCFB] p-6 shadow-sm flex flex-col hover:border-[#D5D1C6] transition-colors group">
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
                  <div className="flex items-center justify-between gap-2 border-b border-[#EBE8E0] pb-3 mb-4">
                    <p className="text-[10px] uppercase tracking-widest text-[#716E68] font-medium">
                      v{draft.version} | {draft.status}
                    </p>
                    <p className="text-[10px] uppercase tracking-widest text-[#A19D94] font-medium">
                      {previewDate(draft.created_at)}
                    </p>
                  </div>

                  <div className="mb-6 rounded bg-white border border-[#EBE8E0] px-4 py-3 text-[11px] text-[#716E68] shadow-sm">
                    <p>
                      Publish status: <span className="font-medium text-[#2C2A26] capitalize">{providerStatus ?? "not published"}</span>
                    </p>
                    {providerPostId ? (
                      <p className="mt-2 break-all text-[#A19D94]">
                        Post ID: <span className="font-mono text-[10px]">{providerPostId}</span>
                      </p>
                    ) : null}
                    {providerPublishedAt ? (
                      <p className="mt-1">Provider published at: {new Date(providerPublishedAt).toLocaleString()}</p>
                    ) : null}
                    {providerErrorCode || providerErrorMessage ? (
                      <p className="mt-2 text-amber-700 bg-amber-50 border border-amber-200 p-2 rounded">
                        Last provider error: {[providerErrorCode, providerErrorMessage].filter(Boolean).join(" | ")}
                      </p>
                    ) : null}
                  </div>

                  <div className="grid gap-6">
                    <form action="/api/content/drafts/decision" method="post" className="grid gap-4">
                      <input type="hidden" name="draft_id" value={draft.id} />
                      <input type="hidden" name="action" value="save" />
                      <label className="grid gap-2">
                        <span className="text-[10px] font-medium uppercase tracking-widest text-[#A19D94]">Title</span>
                        <input
                          name="title"
                          defaultValue={draft.title}
                          className="w-full rounded border border-[#EBE8E0] bg-white px-3 py-2 text-sm text-[#2C2A26] focus:border-[#716E68] focus:outline-none focus:ring-1 focus:ring-[#716E68] transition-colors"
                        />
                      </label>
                      <label className="grid gap-2">
                        <span className="text-[10px] font-medium uppercase tracking-widest text-[#A19D94]">Body</span>
                        <textarea
                          name="body"
                          defaultValue={draft.body}
                          rows={8}
                          className="w-full rounded border border-[#EBE8E0] bg-white px-3 py-2 text-[13px] font-serif leading-relaxed text-[#2C2A26] focus:border-[#716E68] focus:outline-none focus:ring-1 focus:ring-[#716E68] transition-colors resize-y"
                        />
                      </label>
                      <div>
                        <button
                          type="submit"
                          className="px-4 py-2 border border-[#EBE8E0] text-[#716E68] text-[10px] font-medium rounded hover:text-indigo-700 hover:border-indigo-200 hover:bg-indigo-50 transition-all uppercase tracking-wider"
                        >
                          Save edits
                        </button>
                      </div>
                    </form>

                    <div className="rounded border border-[#EBE8E0] bg-white p-4 shadow-sm">
                      <p className="text-[10px] font-medium uppercase tracking-widest text-[#A19D94] mb-3 border-b border-[#F7F6F2] pb-2">
                        Live preview
                      </p>
                      <div className="mt-2">
                        <p className="text-sm font-medium text-[#2C2A26]">{draft.title}</p>
                        <p className="mt-3 whitespace-pre-wrap text-[13px] font-serif leading-relaxed text-[#716E68]">{draft.body}</p>
                        <div className="mt-4 flex flex-wrap gap-2 text-[10px] text-[#A19D94]">
                          {draft.body
                            .split(/\s+/)
                            .filter((token: string) => token.startsWith("#"))
                            .slice(0, 5)
                            .map((tag: string) => (
                              <span key={`${draft.id}-${tag}`} className="rounded bg-[#FDFCFB] border border-[#EBE8E0] px-2 py-0.5 text-indigo-700 font-medium tracking-wide">
                                {tag}
                              </span>
                            ))}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="mt-6 pt-4 border-t border-[#EBE8E0] flex flex-wrap gap-2">
                    <form action="/api/content/drafts/decision" method="post">
                      <input type="hidden" name="draft_id" value={draft.id} />
                      <input type="hidden" name="action" value="approve" />
                      <button
                        type="submit"
                        className="px-3 py-1.5 border border-[#EBE8E0] text-[#716E68] text-[10px] font-medium rounded hover:text-emerald-700 hover:border-emerald-200 hover:bg-emerald-50 transition-all uppercase tracking-wider"
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
                            className="px-3 py-1.5 border border-[#EBE8E0] text-[#716E68] text-[10px] font-medium rounded hover:text-indigo-700 hover:border-indigo-200 hover:bg-indigo-50 transition-all uppercase tracking-wider"
                          >
                            Mark Published (Manual)
                          </button>
                        </form>
                        <form action="/api/content/drafts/decision" method="post">
                          <input type="hidden" name="draft_id" value={draft.id} />
                          <input type="hidden" name="action" value="publish" />
                          <input type="hidden" name="publish_adapter" value="linkedin_api" />
                          <button
                            type="submit"
                            disabled={alreadyProviderPublished}
                            className="px-3 py-1.5 border border-[#EBE8E0] text-[#716E68] text-[10px] font-medium rounded hover:text-fuchsia-700 hover:border-fuchsia-200 hover:bg-fuchsia-50 transition-all uppercase tracking-wider disabled:opacity-50 disabled:pointer-events-none"
                          >
                            {alreadyProviderPublished ? "Already Published" : "Publish to API"}
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
                <div className="py-12 flex flex-col items-center justify-center border border-dashed border-[#EBE8E0] rounded bg-[#FDFCFB]">
                  <p className="text-sm text-[#716E68] italic">No LinkedIn drafts yet.</p>
                </div>
              ) : null}
            </div>
          </article>

          <article className="bg-transparent">
            <div className="flex items-center justify-between border-b border-[#F7F6F2] pb-4 mb-6">
              <h2 className="text-lg font-light tracking-tight text-[#2C2A26]">Newsletter Drafts</h2>
              <span className="px-2 py-0.5 rounded bg-white border border-[#EBE8E0] text-[10px] uppercase tracking-widest text-[#716E68] font-medium shadow-sm">
                {newsletterDrafts.length}
              </span>
            </div>
            <div className="mt-4 space-y-8">
              {newsletterDrafts.map((draft) => (
                <div key={draft.id} className="rounded border border-[#EBE8E0] bg-[#FDFCFB] p-6 shadow-sm flex flex-col hover:border-[#D5D1C6] transition-colors group">
                  <div className="flex items-center justify-between gap-2 border-b border-[#EBE8E0] pb-3 mb-4">
                    <p className="text-[10px] uppercase tracking-widest text-[#716E68] font-medium">
                      v{draft.version} | {draft.status}
                    </p>
                    <p className="text-[10px] uppercase tracking-widest text-[#A19D94] font-medium">
                      {previewDate(draft.created_at)}
                    </p>
                  </div>

                  <div className="grid gap-6">
                    <form action="/api/content/drafts/decision" method="post" className="grid gap-4">
                      <input type="hidden" name="draft_id" value={draft.id} />
                      <input type="hidden" name="action" value="save" />
                      <label className="grid gap-2">
                        <span className="text-[10px] font-medium uppercase tracking-widest text-[#A19D94]">Title</span>
                        <input
                          name="title"
                          defaultValue={draft.title}
                          className="w-full rounded border border-[#EBE8E0] bg-white px-3 py-2 text-sm text-[#2C2A26] focus:border-[#716E68] focus:outline-none focus:ring-1 focus:ring-[#716E68] transition-colors"
                        />
                      </label>
                      <label className="grid gap-2">
                        <span className="text-[10px] font-medium uppercase tracking-widest text-[#A19D94]">Body</span>
                        <textarea
                          name="body"
                          defaultValue={draft.body}
                          rows={12}
                          className="w-full rounded border border-[#EBE8E0] bg-white px-3 py-2 text-[13px] font-serif leading-relaxed text-[#2C2A26] focus:border-[#716E68] focus:outline-none focus:ring-1 focus:ring-[#716E68] transition-colors resize-y"
                        />
                      </label>
                      <div>
                        <button
                          type="submit"
                          className="px-4 py-2 border border-[#EBE8E0] text-[#716E68] text-[10px] font-medium rounded hover:text-indigo-700 hover:border-indigo-200 hover:bg-indigo-50 transition-all uppercase tracking-wider"
                        >
                          Save edits
                        </button>
                      </div>
                    </form>

                    <div className="rounded border border-[#EBE8E0] bg-white p-4 shadow-sm">
                      <p className="text-[10px] font-medium uppercase tracking-widest text-[#A19D94] mb-3 border-b border-[#F7F6F2] pb-2">
                        Live preview
                      </p>
                      <div className="mt-2 rounded bg-white p-6 border border-[#EBE8E0] shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
                        <p className="text-[10px] text-[#A19D94] uppercase tracking-widest font-medium mb-3">From: inhumans.io</p>
                        <p className="text-lg font-light tracking-tight text-[#2C2A26] leading-snug">{draft.title}</p>
                        <div className="mt-4 mb-5 h-px bg-[#EBE8E0]" />
                        <p className="whitespace-pre-wrap text-[13px] font-serif leading-relaxed text-[#716E68]">{draft.body}</p>
                      </div>
                    </div>
                  </div>

                  <div className="mt-6 pt-4 border-t border-[#EBE8E0] flex flex-wrap gap-2">
                    <form action="/api/content/drafts/decision" method="post">
                      <input type="hidden" name="draft_id" value={draft.id} />
                      <input type="hidden" name="action" value="approve" />
                      <button
                        type="submit"
                        className="px-3 py-1.5 border border-[#EBE8E0] text-[#716E68] text-[10px] font-medium rounded hover:text-emerald-700 hover:border-emerald-200 hover:bg-emerald-50 transition-all uppercase tracking-wider"
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
                          className="px-3 py-1.5 border border-[#EBE8E0] text-[#716E68] text-[10px] font-medium rounded hover:text-indigo-700 hover:border-indigo-200 hover:bg-indigo-50 transition-all uppercase tracking-wider"
                        >
                          Mark published
                        </button>
                      </form>
                    ) : null}
                    {draft.published_at ? (
                      <p className="text-[10px] text-emerald-600 font-medium tracking-widest uppercase mt-2 ml-4 self-center">
                        Published ({new Date(draft.published_at).toLocaleDateString()})
                      </p>
                    ) : null}
                  </div>
                </div>
              ))}
              {!newsletterDrafts.length ? (
                <div className="py-12 flex flex-col items-center justify-center border border-dashed border-[#EBE8E0] rounded bg-[#FDFCFB]">
                  <p className="text-sm text-[#716E68] italic">No newsletter drafts yet.</p>
                </div>
              ) : null}
            </div>
          </article>
        </section>
      </div>
    </AppShell>
  );
}



