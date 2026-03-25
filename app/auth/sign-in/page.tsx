import Link from "next/link";
import { signInAction, signUpAction } from "@/app/auth/actions";

type SearchParams = {
  error?: string;
  message?: string;
};

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;

  return (
    <div className="min-h-screen bg-[#F7F6F2] text-[#2C2A26] font-sans selection:bg-[#E2DECF] selection:text-[#2C2A26] flex flex-col md:flex-row">
      
      {/* Left Side - Branding & Calm Intent */}
      <div className="hidden md:flex md:w-[45%] bg-[#EBE8E0] flex-col justify-between p-12 lg:p-20 relative overflow-hidden">
        {/* Subtle decorative element */}
        <div className="absolute inset-0 bg-gradient-to-b from-[#EFECE5]/50 to-transparent pointer-events-none"></div>
        
        <div className="relative z-10">
          <Link href="/" className="inline-block text-[11px] font-semibold tracking-[0.25em] uppercase text-[#2C2A26] hover:opacity-70 transition-opacity">
            CouncilFlow
          </Link>
        </div>

        <div className="relative z-10 max-w-md mt-24 mb-auto">
          <h1 className="text-[2.75rem] lg:text-[3.25rem] font-light tracking-[-0.02em] text-[#2C2A26] leading-[1.05] font-display mb-8">
            Return to your focus.
          </h1>
          <p className="text-[17px] text-[#716E68] font-light leading-relaxed">
            Sign in to manage your automated pipeline, review AI-drafted outreach, and continue refining your firm's growth trajectory with quiet confidence.
          </p>
        </div>

        <div className="relative z-10 flex items-center justify-between text-[11px] text-[#86827A] uppercase tracking-[0.2em]">
          <span>© {new Date().getFullYear()} CouncilFlow</span>
          <span>System Status: Optimal</span>
        </div>
      </div>

      {/* Right Side - Interactive Form */}
      <div className="w-full md:w-[55%] flex items-center justify-center p-6 sm:p-12 md:p-16 lg:p-24 relative bg-[#FDFCFB]">
        <div className="absolute top-8 left-8 md:hidden">
          <Link href="/" className="text-[11px] font-semibold tracking-[0.25em] uppercase text-[#2C2A26]">
            CouncilFlow
          </Link>
        </div>

        <div className="w-full max-w-[420px] animate-in fade-in slide-in-from-bottom-4 duration-1000 ease-out">
          
          <div className="mb-12 text-center md:text-left">
            <h2 className="text-[1.75rem] font-light tracking-[-0.01em] text-[#2C2A26] font-display mb-3">Welcome.</h2>
            <p className="text-[#86827A] text-[15px] font-light">Enter your credentials to access the platform.</p>
          </div>

          <div className="bg-white px-8 py-10 sm:p-12 border border-[#EBE8E0] rounded-lg shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
            
            {/* Alerts */}
            {params.error && (
              <div className="mb-6 p-4 bg-red-50 border border-red-100 text-red-600 text-sm rounded flex items-start gap-3">
                <svg className="w-5 h-5 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                <p>{params.error}</p>
              </div>
            )}
            {params.message && (
              <div className="mb-6 p-4 bg-[#EFECE5] border border-[#EBE8E0] text-[#2C2A26] text-sm rounded flex items-start gap-3">
                <svg className="w-5 h-5 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 13l4 4L19 7" /></svg>
                <p>{params.message}</p>
              </div>
            )}

            {/* OAuth Buttons */}
            <div className="mb-8">
              <div className="grid gap-3 sm:grid-cols-2">
                <button disabled className="w-full flex items-center justify-center gap-2 bg-[#FDFCFB] text-[#86827A] py-3 px-4 rounded border border-[#EBE8E0] text-[13px] font-medium opacity-50 cursor-not-allowed hover:bg-white transition-colors duration-300">
                  Google <span className="text-[10px] uppercase tracking-wider hidden sm:inline">(Soon)</span>
                </button>
                <button disabled className="w-full flex items-center justify-center gap-2 bg-[#FDFCFB] text-[#86827A] py-3 px-4 rounded border border-[#EBE8E0] text-[13px] font-medium opacity-50 cursor-not-allowed hover:bg-white transition-colors duration-300">
                  Microsoft <span className="text-[10px] uppercase tracking-wider hidden sm:inline">(Soon)</span>
                </button>
              </div>
              <div className="flex items-center gap-4 mt-8 mb-2">
                <div className="h-px bg-[#EBE8E0] flex-1"></div>
                <span className="text-[10px] text-[#A19D94] uppercase tracking-[0.15em] font-medium">Or email</span>
                <div className="h-px bg-[#EBE8E0] flex-1"></div>
              </div>
            </div>

            {/* Sign In Form */}
            <form action={signInAction} className="grid gap-5">
              <div className="grid gap-2">
                <label className="text-[13px] text-[#716E68] font-medium ml-1">Email address</label>
                <input
                  className="w-full bg-[#FDFCFB] border border-[#EBE8E0] text-[#2C2A26] px-4 py-3 rounded-md text-[15px] focus:outline-none focus:ring-1 focus:ring-[#EBE8E0] focus:border-[#C4C0B5] focus:bg-white transition-all duration-300 placeholder:text-[#D5D1C6]"
                  name="email"
                  type="email"
                  placeholder="you@firm.com"
                  autoComplete="email"
                  required
                />
              </div>
              <div className="grid gap-2">
                <div className="flex items-center justify-between ml-1">
                  <label className="text-[13px] text-[#716E68] font-medium">Password</label>
                </div>
                <input
                  className="w-full bg-[#FDFCFB] border border-[#EBE8E0] text-[#2C2A26] px-4 py-3 rounded-md text-[15px] focus:outline-none focus:ring-1 focus:ring-[#EBE8E0] focus:border-[#C4C0B5] focus:bg-white transition-all duration-300 placeholder:text-[#D5D1C6]"
                  name="password"
                  type="password"
                  placeholder="••••••••"
                  autoComplete="current-password"
                  required
                />
              </div>
              <button
                className="w-full mt-3 bg-[#2C2A26] text-[#FDFCFB] py-3.5 rounded-md text-[14px] font-medium hover:bg-[#1A1917] hover:shadow-md transition-all duration-300"
                type="submit"
              >
                Access Platform
              </button>
            </form>

            {/* Sign Up Form */}
            <form action={signUpAction} className="mt-10 pt-8 border-t border-[#EBE8E0]">
              <div className="text-center mb-6">
                <span className="text-[10px] text-[#A19D94] uppercase tracking-[0.2em] bg-white px-4 relative -top-[42px] font-medium">New firm?</span>
              </div>
              <div className="grid gap-5 mt-[-1rem]">
                <div className="grid gap-2">
                  <input
                    className="w-full bg-[#FDFCFB] border border-[#EBE8E0] text-[#2C2A26] px-4 py-3 rounded-md text-[15px] focus:outline-none focus:ring-1 focus:ring-[#EBE8E0] focus:border-[#C4C0B5] focus:bg-white transition-all duration-300 placeholder:text-[#D5D1C6]"
                    name="email"
                    type="email"
                    placeholder="Work email"
                    required
                  />
                </div>
                <div className="grid gap-2">
                  <input
                    className="w-full bg-[#FDFCFB] border border-[#EBE8E0] text-[#2C2A26] px-4 py-3 rounded-md text-[15px] focus:outline-none focus:ring-1 focus:ring-[#EBE8E0] focus:border-[#C4C0B5] focus:bg-white transition-all duration-300 placeholder:text-[#D5D1C6]"
                    name="password"
                    type="password"
                    placeholder="Create a strong password"
                    minLength={8}
                    required
                  />
                </div>
                <button
                  className="w-full mt-3 bg-white border border-[#EBE8E0] text-[#2C2A26] py-3.5 rounded-md text-[14px] font-medium hover:bg-[#FDFCFB] hover:border-[#C4C0B5] transition-all duration-300"
                  type="submit"
                >
                  Create Account
                </button>
              </div>
            </form>

          </div>
        </div>
      </div>
    </div>
  );
}
