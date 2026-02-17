"use client";

import { useRef, useState, type FormEvent } from "react";

import { ONBOARDING_STEPS, validateOnboardingStep } from "@/app/onboarding/validation";

type Props = {
  error?: string;
  action: (formData: FormData) => void;
  initialStep?: number;
};

export function OnboardingForm({ error, action, initialStep = 0 }: Props) {
  const [step, setStep] = useState(initialStep);
  const [localError, setLocalError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  function onNextStep() {
    if (!formRef.current) return;
    const validation = validateOnboardingStep(new FormData(formRef.current), step);
    if (!validation.ok) {
      setLocalError(validation.message);
      return;
    }
    setLocalError(null);
    setStep((current) => Math.min(ONBOARDING_STEPS.length - 1, current + 1));
  }

  function onPrevStep() {
    setLocalError(null);
    setStep((current) => Math.max(0, current - 1));
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    if (!formRef.current) return;

    for (let idx = 0; idx < ONBOARDING_STEPS.length; idx += 1) {
      const validation = validateOnboardingStep(new FormData(formRef.current), idx);
      if (!validation.ok) {
        event.preventDefault();
        setStep(idx);
        setLocalError(validation.message);
        return;
      }
    }
  }

  return (
    <form ref={formRef} action={action} onSubmit={onSubmit} className="glass-card mt-8 grid gap-4 p-6">
      {error ? <p className="alert-error">{error}</p> : null}
      {localError ? <p className="alert-error">{localError}</p> : null}

      <div className="flex items-center gap-2 text-xs text-[#94A3B8]">
        {ONBOARDING_STEPS.map((label, idx) => (
          <span
            key={label}
            className={
              idx === step
                ? "rounded-full border border-indigo-300/40 bg-indigo-500/15 px-2 py-1 text-indigo-100"
                : "rounded-full border border-white/15 bg-[#0D1117] px-2 py-1"
            }
          >
            {idx + 1}. {label}
          </span>
        ))}
      </div>

      <div className={step === 0 ? "grid gap-4" : "hidden"}>
        <label className="grid gap-1 text-sm">
          <span className="text-[#94A3B8]">Your display name</span>
          <input className="input-base" name="display_name" type="text" placeholder="Hitesh" />
        </label>

        <label className="grid gap-1 text-sm">
          <span className="text-[#94A3B8]">Firm name</span>
                <input
                  className="input-base"
                  name="firm_name"
                  type="text"
                  placeholder="CouncilFlow Legal LLP"
                />
              </label>
      </div>

      <div className={step === 1 ? "grid gap-4" : "hidden"}>
        <label className="grid gap-1 text-sm">
          <span className="text-[#94A3B8]">Practice areas (comma separated)</span>
          <input
            className="input-base"
            name="practice_areas"
            type="text"
            placeholder="Corporate law, Employment, Litigation"
          />
        </label>

        <label className="grid gap-1 text-sm">
          <span className="text-[#94A3B8]">Office location</span>
          <input className="input-base" name="office_location" type="text" placeholder="New York, NY" />
        </label>

        <label className="grid gap-1 text-sm">
          <span className="text-[#94A3B8]">Average matter value (USD)</span>
          <input className="input-base" name="avg_matter_value" type="number" min={0} step={100} placeholder="15000" />
        </label>
      </div>

      <div className={step === 2 ? "grid gap-4" : "hidden"}>
        <label className="grid gap-1 text-sm">
          <span className="text-[#94A3B8]">Industries (comma separated)</span>
          <input className="input-base" name="icp_industries" type="text" placeholder="SaaS, Healthtech, Fintech" />
        </label>

        <label className="grid gap-1 text-sm">
          <span className="text-[#94A3B8]">Company sizes (comma separated)</span>
          <input className="input-base" name="icp_company_sizes" type="text" placeholder="1-10, 11-50, 51-200" />
        </label>

        <label className="grid gap-1 text-sm">
          <span className="text-[#94A3B8]">Geography</span>
          <input className="input-base" name="icp_geography" type="text" placeholder="US East Coast" />
        </label>
      </div>

      <div className={step === 3 ? "grid gap-4" : "hidden"}>
        <label className="grid gap-1 text-sm">
          <span className="text-[#94A3B8]">Preferred tone</span>
          <select className="input-base" name="voice_tone" defaultValue="professional">
            <option value="professional">Professional</option>
            <option value="direct">Direct</option>
            <option value="warm">Warm</option>
            <option value="authoritative">Authoritative</option>
          </select>
        </label>

        <label className="grid gap-1 text-sm">
          <span className="text-[#94A3B8]">Sample outreach paragraph (optional)</span>
          <textarea
            className="input-base min-h-28"
            name="voice_sample"
            placeholder="Paste a short sample so drafts better match your voice."
          />
        </label>
      </div>

      <div className="mt-2 flex items-center justify-between">
        <button
          type="button"
          onClick={onPrevStep}
          disabled={step === 0}
          className="rounded-md border border-white/20 bg-[#111827] px-3 py-2 text-xs disabled:cursor-not-allowed disabled:opacity-40"
        >
          Back
        </button>

        {step < ONBOARDING_STEPS.length - 1 ? (
          <button
            type="button"
            onClick={onNextStep}
            className="btn-base btn-primary"
          >
            Next
          </button>
        ) : (
          <button className="btn-base btn-primary" type="submit">
            Create workspace
          </button>
        )}
      </div>
    </form>
  );
}
