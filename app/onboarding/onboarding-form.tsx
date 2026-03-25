"use client";

import { useRef, useState, type FormEvent } from "react";
import { ONBOARDING_STEPS, validateOnboardingStep } from "@/app/onboarding/validation";

type Props = {
  error?: string;
  action: (formData: FormData) => void;
  initialStep?: number;
};

export default function OnboardingForm({ error, action, initialStep = 0 }: Props) {
  const [step, setStep] = useState(initialStep);
  const [localError, setLocalError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
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
    setPending(true);
  }

  const inputClass = "w-full bg-[#FDFCFB] border border-[#EBE8E0] text-[#2C2A26] px-4 py-3.5 rounded-md text-[15px] focus:outline-none focus:ring-1 focus:ring-[#EBE8E0] focus:border-[#C4C0B5] focus:bg-white transition-all duration-300 placeholder:text-[#D5D1C6]";
  const labelClass = "text-[13px] text-[#716E68] font-medium ml-1 mb-1.5 block";

  return (
    <form ref={formRef} action={action} onSubmit={onSubmit} className={`bg-white border border-[#EBE8E0] rounded-xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-8 sm:p-14 w-full transition-opacity duration-300 ${pending ? "opacity-70 pointer-events-none" : ""}`}>
      
      {/* Progress Indicator */}
      <div className="flex items-center justify-between mb-12 pb-6 border-b border-[#F7F6F2]">
        <div className="flex items-center gap-4">
          {ONBOARDING_STEPS.map((label, idx) => (
            <div key={label} className="flex flex-col items-center gap-2">
              <span
                className={`w-2.5 h-2.5 rounded-full transition-all duration-700 ${
                  idx === step
                    ? "bg-[#2C2A26] scale-125 shadow-sm"
                    : idx < step
                    ? "bg-[#C4C0B5]"
                    : "bg-[#EFECE5]"
                }`}
              />
            </div>
          ))}
        </div>
        <span className="text-[10px] uppercase tracking-[0.25em] text-[#A19D94] font-medium">
          Step {step + 1} of {ONBOARDING_STEPS.length}
        </span>
      </div>

      <div className="min-h-[260px]">
        {error ? <p className="mb-8 p-4 bg-red-50 border border-red-100 text-red-600 text-[13px] rounded-md">{error}</p> : null}
        {localError ? <p className="mb-8 p-4 bg-red-50 border border-red-100 text-red-600 text-[13px] rounded-md">{localError}</p> : null}

        {/* Step 0: Basic Info */}
        <div className={step === 0 ? "grid gap-7 animate-in fade-in duration-700" : "hidden"}>
          <div className="mb-2">
            <h2 className="text-[1.5rem] font-light tracking-[-0.01em] text-[#2C2A26] mb-2 font-display">Firm Details</h2>
            <p className="text-[15px] text-[#86827A] font-light">Let's start with your practice's core identity.</p>
          </div>
          <div>
            <label className={labelClass}>Your display name</label>
            <input className={inputClass} name="display_name" type="text" placeholder="e.g. Sarah Jenkins" required disabled={pending} />
          </div>
          <div>
            <label className={labelClass}>Firm name</label>
            <input className={inputClass} name="firm_name" type="text" placeholder="e.g. Meridian Counsel LLP" required disabled={pending} />
          </div>
        </div>

        {/* Step 1: Practice Areas */}
        <div className={step === 1 ? "grid gap-7 animate-in fade-in duration-700" : "hidden"}>
          <div className="mb-2">
            <h2 className="text-[1.5rem] font-light tracking-[-0.01em] text-[#2C2A26] mb-2 font-display">Areas of Practice</h2>
            <p className="text-[15px] text-[#86827A] font-light">What legal services do you specialize in?</p>
          </div>
          <div>
            <label className={labelClass}>Practice areas (comma separated)</label>
            <input className={inputClass} name="practice_areas" type="text" placeholder="Corporate Law, Employment, M&A" required disabled={pending} />
          </div>
          <div className="grid sm:grid-cols-2 gap-7">
            <div>
              <label className={labelClass}>Office location</label>
              <input className={inputClass} name="office_location" type="text" placeholder="New York, NY" required disabled={pending} />
            </div>
            <div>
              <label className={labelClass}>Avg matter value (USD)</label>
              <input className={inputClass} name="avg_matter_value" type="number" min={0} step={100} placeholder="25000" required disabled={pending} />
            </div>
          </div>
        </div>

        {/* Step 2: ICP */}
        <div className={step === 2 ? "grid gap-7 animate-in fade-in duration-700" : "hidden"}>
          <div className="mb-2">
            <h2 className="text-[1.5rem] font-light tracking-[-0.01em] text-[#2C2A26] mb-2 font-display">Ideal Client Profile</h2>
            <p className="text-[15px] text-[#86827A] font-light">Who does the AI need to find for you?</p>
          </div>
          <div>
            <label className={labelClass}>Industries (comma separated)</label>
            <input className={inputClass} name="icp_industries" type="text" placeholder="Healthtech, Fintech, SaaS" required disabled={pending} />
          </div>
          <div className="grid sm:grid-cols-2 gap-7">
            <div>
              <label className={labelClass}>Company sizes</label>
              <input className={inputClass} name="icp_company_sizes" type="text" placeholder="50-200, 201-500 employees" required disabled={pending} />
            </div>
            <div>
              <label className={labelClass}>Geography</label>
              <input className={inputClass} name="icp_geography" type="text" placeholder="United States" required disabled={pending} />
            </div>
          </div>
        </div>

        {/* Step 3: Voice */}
        <div className={step === 3 ? "grid gap-7 animate-in fade-in duration-700" : "hidden"}>
          <div className="mb-2">
            <h2 className="text-[1.5rem] font-light tracking-[-0.01em] text-[#2C2A26] mb-2 font-display">Voice & Tone</h2>
            <p className="text-[15px] text-[#86827A] font-light">How should the AI draft your outreach?</p>
          </div>
          <div>
            <label className={labelClass}>Preferred tone</label>
            <select className={inputClass} name="voice_tone" defaultValue="professional" disabled={pending}>
              <option value="professional">Professional & Refined</option>
              <option value="direct">Direct & Concise</option>
              <option value="warm">Warm & Conversational</option>
              <option value="authoritative">Authoritative & Commanding</option>
            </select>
          </div>
          <div>
            <label className={labelClass}>Sample outreach paragraph (optional)</label>
            <textarea
              className={`${inputClass} min-h-[100px] py-3 resize-none`}
              name="voice_sample"
              placeholder="Paste a short sample of your writing so drafts perfectly match your firm's distinct voice."
              disabled={pending}
            />
          </div>
        </div>
      </div>

      {/* Navigation Buttons */}
      <div className="mt-12 pt-8 border-t border-[#F7F6F2] flex items-center justify-between">
        <button
          type="button"
          onClick={onPrevStep}
          disabled={step === 0 || pending}
          className="text-[13px] font-medium text-[#86827A] hover:text-[#2C2A26] disabled:opacity-30 disabled:hover:text-[#86827A] transition-colors"
        >
          ← Go Back
        </button>

        {step < ONBOARDING_STEPS.length - 1 ? (
          <button
            type="button"
            onClick={onNextStep}
            disabled={pending}
            className="bg-[#2C2A26] text-[#FDFCFB] px-8 py-3.5 rounded-md text-[14px] font-medium hover:bg-[#1A1917] transition-all shadow-sm disabled:opacity-50"
          >
            Continue
          </button>
        ) : (
          <button 
            className="bg-[#2C2A26] text-[#FDFCFB] px-8 py-3.5 rounded-md text-[14px] font-medium hover:bg-[#1A1917] transition-all shadow-md hover:shadow-lg disabled:opacity-50 flex items-center gap-2" 
            type="submit"
            disabled={pending}
          >
            {pending ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-[#FDFCFB]/30 border-t-[#FDFCFB] rounded-full animate-spin" />
                Setting up...
              </>
            ) : "Establish Workspace"}
          </button>
        )}
      </div>
    </form>
  );
}
export { OnboardingForm };
