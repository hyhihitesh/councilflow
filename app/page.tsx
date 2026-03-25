import Link from "next/link";

export default function Home() {
  return (
    <div className="min-h-screen bg-[#F7F6F2] text-[#2C2A26] font-sans selection:bg-[#E2DECF] selection:text-[#2C2A26]">
      {/* Navigation */}
      <nav className="fixed top-0 w-full z-50 bg-[#F7F6F2]/90 backdrop-blur-md border-b border-[#EBE8E0] transition-all">
        <div className="mx-auto max-w-7xl px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3 relative z-10">
            <span className="text-sm font-semibold tracking-[0.15em] uppercase text-[#2C2A26]">CouncilFlow</span>
          </div>
          <div className="hidden md:flex items-center gap-8 text-sm font-medium">
            <a href="#philosophy" className="text-[#716E68] hover:text-[#2C2A26] transition-colors">Philosophy</a>
            <a href="#platform" className="text-[#716E68] hover:text-[#2C2A26] transition-colors">Platform</a>
            <a href="#pricing" className="text-[#716E68] hover:text-[#2C2A26] transition-colors">Pricing</a>
          </div>
          <div className="flex items-center gap-6 text-sm font-medium relative z-10">
            <Link href="/auth/sign-in" className="hidden sm:block text-[#2C2A26]/70 hover:text-[#2C2A26] transition-colors">
              Log in
            </Link>
            <Link href="/auth/sign-in" className="bg-[#2C2A26] text-[#F7F6F2] px-6 py-2.5 rounded-sm hover:bg-[#4A4742] transition-colors shadow-sm">
              Start Free Trial
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative px-6 pt-48 pb-32 md:pt-64 md:pb-40 overflow-hidden flex flex-col items-center justify-center text-center">
        <div className="relative z-10 max-w-4xl mx-auto flex flex-col items-center">
          <span className="inline-block py-1 px-4 mb-8 text-[11px] font-semibold tracking-[0.2em] text-[#86827A] uppercase border border-[#EBE8E0] rounded-full bg-white/40">
            The New Standard in Legal Prospecting
          </span>
          <h1 className="text-5xl md:text-7xl font-light tracking-tight text-[#2C2A26] leading-[1.05] font-display">
            Business development,<br />refined by intelligence.
          </h1>
          <p className="mt-8 text-lg md:text-xl text-[#716E68] max-w-2xl font-light leading-relaxed">
            Stop losing hours to manual firm research and noisy outreach. CouncilFlow leverages autonomous AI to uncover high-fidelity connections and craft bespoke pipeline opportunities that actually convert.
          </p>
          <div className="mt-12 flex flex-col sm:flex-row items-center justify-center gap-4 w-full sm:w-auto">
            <Link href="/auth/sign-in" className="w-full sm:w-auto flex items-center justify-center gap-3 bg-[#2C2A26] text-[#F7F6F2] px-8 py-4 rounded-sm text-base transition-all hover:bg-[#4A4742] shadow-md hover:shadow-lg">
              Start your 14-day trial
            </Link>
            <a href="#platform" className="w-full sm:w-auto flex items-center justify-center gap-3 bg-transparent text-[#2C2A26] border border-[#D5D1C6] px-8 py-4 rounded-sm text-base transition-all hover:bg-[#EFECE5]">
              Explore the platform
            </a>
          </div>
          <p className="mt-6 text-xs text-[#A19D94]">No credit card required. Setup in 3 minutes.</p>
        </div>
      </section>

      {/* Social Proof (Quiet) */}
      <section className="py-12 border-y border-[#EBE8E0] bg-[#FDFCFB]/40 hidden md:block">
        <div className="max-w-7xl mx-auto px-6 text-center">
          <p className="text-xs uppercase tracking-[0.2em] text-[#A19D94] mb-8 font-medium">Trusted by forward-thinking modern practices</p>
          <div className="flex flex-wrap justify-center gap-12 md:gap-24 opacity-50 grayscale">
            <span className="font-display font-medium text-xl tracking-wide">Artemis Law</span>
            <span className="font-display font-medium text-xl tracking-wide">Vanguard Partners</span>
            <span className="font-display font-medium text-xl tracking-wide">Equinox Legal</span>
            <span className="font-display font-medium text-xl tracking-wide">Meridian Counsel</span>
          </div>
        </div>
      </section>

      {/* The Problem / Philosophy */}
      <section id="philosophy" className="py-32 bg-[#EFECE5]">
        <div className="max-w-6xl mx-auto px-6">
          <div className="grid md:grid-cols-2 gap-20 items-center">
            <div>
              <h2 className="text-3xl md:text-5xl font-light tracking-tight text-[#2C2A26] leading-[1.1] font-display mb-8">
                Outreach has become<br />unbearably loud.
              </h2>
              <div className="space-y-6 text-[#716E68] text-lg font-light leading-relaxed">
                <p>
                  Modern law firms waste profound amounts of time manually researching prospects, or worse, they rely on mass-email tools that destroy their reputation with generic, robotic copy.
                </p>
                <p>
                  We believe true business development shouldn't feel like spam. CouncilFlow brings a meditative rhythm to prospecting—filtering out the chaos to present only the highest fidelity opportunities, and drafting outreach with a quietly authoritative voice.
                </p>
              </div>
            </div>
            <div className="bg-[#F7F6F2] p-10 md:p-14 rounded border border-[#EBE8E0] shadow-sm relative">
              <div className="absolute top-0 left-0 w-1 h-full bg-[#D5D1C6]"></div>
              <p className="text-xl md:text-2xl font-light text-[#2C2A26] italic leading-relaxed">
                "CouncilFlow took our firm's prospecting from a chaotic, 10-hour-a-week chore to an elegant, automated pipeline that runs in the background. It feels like magic."
              </p>
              <div className="mt-8">
                <p className="font-medium text-[#2C2A26]">Sarah Jenkins</p>
                <p className="text-sm text-[#86827A]">Managing Partner, Meridian Counsel</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Feature Deep Dive (The Solution) */}
      <section id="platform" className="py-32">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center max-w-3xl mx-auto mb-24">
            <h2 className="text-4xl md:text-5xl font-light tracking-tight text-[#2C2A26] font-display mb-6">
              A cohesive system for growth.
            </h2>
            <p className="text-lg text-[#716E68] font-light">
              We replaced four different tools with one seamless workflow. From deep web research to final review, every motion is intentional, transparent, and completely automated.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {/* Card 1 */}
            <div className="bg-[#FDFCFB] p-12 border border-[#EBE8E0] rounded shadow-sm hover:shadow-md transition-all duration-700 hover:-translate-y-1">
              <div className="w-12 h-12 bg-[#EFECE5] rounded flex items-center justify-center mb-8 text-[#2C2A26]">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
              </div>
              <h3 className="text-2xl font-medium text-[#2C2A26] mb-4">Deep Web Enrichment</h3>
              <p className="text-[#716E68] font-light leading-relaxed mb-6">
                Unearth context with natural grace. Enter a company name, and our orchestration engine silently sweeps the web via Exa to gather recent news, executive structures, and firmographics in seconds.
              </p>
            </div>

            {/* Card 2 */}
            <div className="bg-[#FDFCFB] p-12 border border-[#EBE8E0] rounded shadow-sm hover:shadow-md transition-all duration-700 hover:-translate-y-1">
              <div className="w-12 h-12 bg-[#EFECE5] rounded flex items-center justify-center mb-8 text-[#2C2A26]">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
              </div>
              <h3 className="text-2xl font-medium text-[#2C2A26] mb-4">Mindful AI Drafting</h3>
              <p className="text-[#716E68] font-light leading-relaxed mb-6">
                Emails authored with quiet confidence. Gemini intelligence ensures your outreach remains refined, bespoke to the prospect's immediate needs, and profoundly human.
              </p>
            </div>

            {/* Card 3 */}
            <div className="bg-[#FDFCFB] p-12 border border-[#EBE8E0] rounded shadow-sm hover:shadow-md transition-all duration-700 hover:-translate-y-1">
              <div className="w-12 h-12 bg-[#EFECE5] rounded flex items-center justify-center mb-8 text-[#2C2A26]">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
              </div>
              <h3 className="text-2xl font-medium text-[#2C2A26] mb-4">Fluid Automation</h3>
              <p className="text-[#716E68] font-light leading-relaxed mb-6">
                Like a gentle current, prospects move through your pipeline autonomously. Schedule weekly batches to run while you sleep, and wake up to a curated list of drafts waiting for your final approval.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing Section (Transparent, elegant, Polar-ready) */}
      <section id="pricing" className="py-32 bg-[#EFECE5] border-t border-[#EBE8E0]">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-20">
            <h2 className="text-4xl md:text-5xl font-light tracking-tight text-[#2C2A26] font-display mb-4">Simple, transparent pricing.</h2>
            <p className="text-[#716E68] text-lg font-light">Choose the scale that fits your firm's ambition. Cancel anytime.</p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            {/* Starter */}
            <div className="bg-[#F7F6F2] p-10 border border-[#EBE8E0] rounded shadow-sm flex flex-col">
              <h3 className="text-xl font-medium text-[#2C2A26] mb-2">Starter Kit</h3>
              <p className="text-[#86827A] text-sm mb-6 pb-6 border-b border-[#EBE8E0]">For solo practitioners</p>
              <div className="mb-8">
                <span className="text-4xl font-light text-[#2C2A26]">$49</span>
                <span className="text-[#86827A]">/mo</span>
              </div>
              <ul className="space-y-4 mb-10 flex-grow">
                <li className="flex items-center gap-3 text-[#716E68] text-sm"><span className="text-[#2C2A26]">✓</span> 500 AI-enriched prospects</li>
                <li className="flex items-center gap-3 text-[#716E68] text-sm"><span className="text-[#2C2A26]">✓</span> Basic outreach generation</li>
                <li className="flex items-center gap-3 text-[#716E68] text-sm"><span className="text-[#2C2A26]">✓</span> 1 User Seat</li>
              </ul>
              <Link href="/checkout?plan=starter" className="block text-center bg-transparent border border-[#2C2A26] text-[#2C2A26] py-3 rounded hover:bg-[#2C2A26] hover:text-[#F7F6F2] transition-colors">Select Starter</Link>
            </div>

            {/* Pro (Highlighted) */}
            <div className="bg-[#2C2A26] text-[#F7F6F2] p-10 border border-[#2C2A26] rounded shadow-xl flex flex-col relative transform md:-translate-y-4">
              <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-[#F7F6F2] text-[#2C2A26] text-xs font-semibold px-4 py-1 rounded-full uppercase tracking-widest">Most Popular</div>
              <h3 className="text-xl font-medium mb-2">Pro Firm</h3>
              <p className="text-[#A19D94] text-sm mb-6 pb-6 border-b border-[#4A4742]">For growing legal teams</p>
              <div className="mb-8">
                <span className="text-4xl font-light">$149</span>
                <span className="text-[#A19D94]">/mo</span>
              </div>
              <ul className="space-y-4 mb-10 flex-grow">
                <li className="flex items-center gap-3 text-[#E2DECF] text-sm"><span>✓</span> 2,500 AI-enriched prospects</li>
                <li className="flex items-center gap-3 text-[#E2DECF] text-sm"><span>✓</span> Custom AI voice tuning</li>
                <li className="flex items-center gap-3 text-[#E2DECF] text-sm"><span>✓</span> Full CRM syncing</li>
                <li className="flex items-center gap-3 text-[#E2DECF] text-sm"><span>✓</span> 5 User Seats</li>
              </ul>
              <Link href="/checkout?plan=pro" className="block text-center bg-[#F7F6F2] text-[#2C2A26] py-3 rounded hover:bg-[#E2DECF] transition-colors font-medium">Select Pro</Link>
            </div>

            {/* Premium */}
            <div className="bg-[#F7F6F2] p-10 border border-[#EBE8E0] rounded shadow-sm flex flex-col">
              <h3 className="text-xl font-medium text-[#2C2A26] mb-2">Premium Agency</h3>
              <p className="text-[#86827A] text-sm mb-6 pb-6 border-b border-[#EBE8E0]">For scaling operations</p>
              <div className="mb-8">
                <span className="text-4xl font-light text-[#2C2A26]">$399</span>
                <span className="text-[#86827A]">/mo</span>
              </div>
              <ul className="space-y-4 mb-10 flex-grow">
                <li className="flex items-center gap-3 text-[#716E68] text-sm"><span className="text-[#2C2A26]">✓</span> Unlimited enrichment</li>
                <li className="flex items-center gap-3 text-[#716E68] text-sm"><span className="text-[#2C2A26]">✓</span> Priority API & Execution</li>
                <li className="flex items-center gap-3 text-[#716E68] text-sm"><span className="text-[#2C2A26]">✓</span> Dedicated Onboarding</li>
                <li className="flex items-center gap-3 text-[#716E68] text-sm"><span className="text-[#2C2A26]">✓</span> Unlimited Seats</li>
              </ul>
              <Link href="/checkout?plan=premium" className="block text-center bg-transparent border border-[#2C2A26] text-[#2C2A26] py-3 rounded hover:bg-[#2C2A26] hover:text-[#F7F6F2] transition-colors">Select Premium</Link>
            </div>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-32 bg-[#F7F6F2] px-6 text-center border-t border-[#EBE8E0]">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-4xl md:text-6xl font-light tracking-tight text-[#2C2A26] mb-8 font-display leading-[1.1]">
            Ready to find your focus?
          </h2>
          <p className="text-xl text-[#716E68] font-light mb-12">
            Join the forward-thinking firms accelerating their pipeline with CouncilFlow. Begin your 14-day free trial today.
          </p>
          <Link href="/auth/sign-in" className="inline-block bg-[#2C2A26] text-[#F7F6F2] px-10 py-5 rounded-sm text-lg transition-all hover:bg-[#4A4742] shadow-xl hover:shadow-2xl">
            Begin the journey
          </Link>
        </div>
      </section>

      {/* Structured Footer */}
      <footer className="bg-[#EFECE5] pt-20 pb-10 px-6 border-t border-[#D5D1C6]">
        <div className="max-w-7xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-12 mb-16">
          <div className="col-span-2">
            <span className="text-lg font-semibold tracking-widest uppercase text-[#2C2A26] mb-6 block">CouncilFlow</span>
            <p className="text-[#716E68] font-light max-w-sm">
              The AI-native business development platform designed to bring clarity, calm, and precision to modern law firm prospecting.
            </p>
          </div>
          <div>
            <h4 className="font-medium text-[#2C2A26] mb-6">Platform</h4>
            <ul className="space-y-4 text-sm text-[#716E68]">
              <li><a href="#platform" className="hover:text-[#2C2A26] transition-colors">Features</a></li>
              <li><a href="#pricing" className="hover:text-[#2C2A26] transition-colors">Pricing</a></li>
              <li><Link href="/auth/sign-in" className="hover:text-[#2C2A26] transition-colors">Log in</Link></li>
            </ul>
          </div>
          <div>
            <h4 className="font-medium text-[#2C2A26] mb-6">Legal</h4>
            <ul className="space-y-4 text-sm text-[#716E68]">
              <li><a href="#" className="hover:text-[#2C2A26] transition-colors">Privacy Policy</a></li>
              <li><a href="#" className="hover:text-[#2C2A26] transition-colors">Terms of Service</a></li>
              <li><a href="#" className="hover:text-[#2C2A26] transition-colors">Data Security</a></li>
            </ul>
          </div>
        </div>
        <div className="max-w-7xl mx-auto border-t border-[#D5D1C6] pt-8 flex flex-col md:flex-row items-center justify-between text-xs text-[#A19D94] uppercase tracking-widest">
          <p>© {new Date().getFullYear()} CouncilFlow. All rights reserved.</p>
          <div className="mt-4 md:mt-0 space-x-6">
            <a href="#" className="hover:text-[#2C2A26] transition-colors">Twitter</a>
            <a href="#" className="hover:text-[#2C2A26] transition-colors">LinkedIn</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
