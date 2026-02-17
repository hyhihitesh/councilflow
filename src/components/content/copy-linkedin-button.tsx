"use client";

import { useState } from "react";

type CopyLinkedInButtonProps = {
  draftId: string;
  text: string;
  disabled?: boolean;
};

export function CopyLinkedInButton({ draftId, text, disabled = false }: CopyLinkedInButtonProps) {
  const [status, setStatus] = useState<"idle" | "copied" | "error">("idle");

  async function onCopy() {
    if (disabled) return;

    try {
      await navigator.clipboard.writeText(text);
      setStatus("copied");

      await fetch("/api/content/drafts/decision", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          draft_id: draftId,
          action: "copy_linkedin",
        }),
      });
    } catch {
      setStatus("error");
    }
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={onCopy}
        disabled={disabled}
        className="rounded-md border border-indigo-300/40 bg-indigo-500/10 px-2.5 py-1 text-xs text-indigo-200 disabled:cursor-not-allowed disabled:opacity-50"
      >
        Copy for LinkedIn
      </button>
      {status === "copied" ? <span className="text-[11px] text-emerald-300">Copied</span> : null}
      {status === "error" ? (
        <span className="text-[11px] text-amber-300">Clipboard blocked. Copy manually.</span>
      ) : null}
    </div>
  );
}
