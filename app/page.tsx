import Link from "next/link";
import RotatingEarth from "@/components/ui/wireframe-dotted-globe";

export default function Home() {
  return (
    <div className="min-h-screen bg-[#FDFCFB] text-[#2C2A26] font-sans selection:bg-[#E2DECF] selection:text-[#2C2A26] scroll-smooth">
      {/* Navigation */}
      <nav className="fixed top-0 w-full z-50 bg-[#FDFCFB]/80 backdrop-blur-xl border-b border-[#EBE8E0] transition-all">
        <div className="mx-auto max-w-7xl px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3 relative z-10">
            <span className="text-[13px] font-semibold tracking-[0.2em] uppercase text-[#2C2A26]">CouncilFlow</span>
          </div>
          <div className="hidden md:flex items-center gap-10 text-[14px] font-medium">
            <a href="#philosophy" className="text-[#86827A] hover:text-[#2C2A26] transition-colors duration-300">Philosophy</a>
            <a href="#platform" className="text-[#86827A] hover:text-[#2C2A26] transition-colors duration-300">Platform</a>
            <a href="#pricing" className="text-[#86827A] hover:text-[#2C2A26] transition-colors duration-300">Pricing</a>
          </div>
          <div className="flex items-center gap-6 text-[14px] font-medium relative z-10">
            <Link href="/auth/sign-in" className="hidden sm:block text-[#716E68] hover:text-[#2C2A26] transition-colors duration-300">
              Log in
            </Link>
            <Link href="/auth/sign-in" className="bg-[#2C2A26] text-[#FDFCFB] px-6 py-2.5 rounded-md hover:bg-[#1A1917] transition-all duration-300 shadow-sm hover:shadow-md">
              Start Free Trial
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative px-6 pt-40 pb-24 md:pt-[240px] md:pb-[180px] overflow-hidden flex flex-col items-center justify-center text-center">
        {/* Animated Background */}
        <div className="absolute inset-0 z-0 flex items-center justify-center opacity-30 pointer-events-none">
          <RotatingEarth width={1200} height={1200} className="scale-125 md:scale-150" />
        </div>
        
        {/* Subtle Gradient Overlay for Text Readability */}
        <div className="absolute inset-0 bg-gradient-to-b from-[#FDFCFB]/20 via-transparent to-[#FDFCFB] z-0 pointer-events-none"></div>

        <div className="relative z-10 max-w-[900px] mx-auto flex flex-col items-center animate-in fade-in slide-in-from-bottom-8 duration-1000 ease-out fill-mode-both">
          <span className="inline-flex items-center gap-2 py-1.5 px-4 mb-8 text-[11px] font-semibold tracking-[0.25em] text-[#86827A] uppercase border border-[#EBE8E0] rounded-full bg-white/60 backdrop-blur-md shadow-sm">
            <span className="w-1.5 h-1.5 rounded-full bg-[#2C2A26] animate-pulse"></span>
            The Standard in Legal Prospecting
          </span>
          <h1 className="text-[3.5rem] md:text-[5.5rem] lg:text-[6rem] font-light tracking-[-0.02em] text-[#2C2A26] leading-[1.05] font-display mb-8">
            Business development,<br className="hidden md:block" /> refined by intelligence.
          </h1>
          <p className="text-[17px] md:text-[21px] text-[#716E68] max-w-3xl font-light leading-relaxed mb-12">
            Stop losing profound amounts of time to manual firm research and noisy outreach. CouncilFlow leverages autonomous AI to uncover high-fidelity connections and craft bespoke pipeline opportunities that actually convert.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-5 w-full sm:w-auto">
            <Link href="/auth/sign-in" className="w-full sm:w-auto flex items-center justify-center gap-3 bg-[#2C2A26] text-[#FDFCFB] px-10 py-4 rounded-md text-[15px] font-medium transition-all duration-300 hover:bg-[#1A1917] shadow-[0_8px_30px_rgb(0,0,0,0.12)] hover:shadow-[0_8px_40px_rgb(0,0,0,0.16)] hover:-translate-y-0.5">
              Start your 14-day trial
            </Link>
            <a href="#platform" className="w-full sm:w-auto flex items-center justify-center gap-3 bg-white text-[#2C2A26] border border-[#EBE8E0] px-10 py-4 rounded-md text-[15px] font-medium transition-all duration-300 hover:bg-[#F7F6F2] hover:border-[#D5D1C6] shadow-sm">
              Explore platform
            </a>
          </div>
          <p className="mt-8 text-[13px] text-[#A19D94] font-medium">No credit card required. Setup in 3 minutes.</p>
        </div>
      </section>

      {/* Social Proof (Quiet) */}
      <section className="py-16 md:py-20 border-y border-[#EBE8E0] bg-[#F7F6F2]">
        <div className="max-w-7xl mx-auto px-6 text-center">
          <p className="text-[11px] uppercase tracking-[0.25em] text-[#A19D94] mb-10 font-semibold">Trusted by forward-thinking modern practices</p>
          <div className="flex flex-wrap justify-center items-center gap-12 md:gap-24 opacity-60 mix-blend-multiply">
            {/* Minimalist text representations replacing actual logos for clean Japandi look */}
            <span className="font-display font-medium text-2xl tracking-wide text-[#86827A]">Artemis Law</span>
            <span className="font-display font-medium text-2xl tracking-wide text-[#86827A]">Vanguard Partners</span>
            <span className="font-display font-medium text-2xl tracking-wide text-[#86827A]">Equinox Legal</span>
            <span className="font-display font-medium text-2xl tracking-wide text-[#86827A]">Meridian Counsel</span>
          </div>
        </div>
      </section>

      {/* The Problem / Philosophy */}
      <section id="philosophy" className="py-24 md:py-[180px] bg-[#FDFCFB]">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid lg:grid-cols-2 gap-16 lg:gap-32 items-center">
            <div className="order-2 lg:order-1">
              <span className="text-[11px] font-semibold tracking-[0.25em] text-[#A19D94] uppercase mb-8 block">The Philosophy</span>
              <h2 className="text-[2.5rem] md:text-[3.5rem] font-light tracking-[-0.01em] text-[#2C2A26] leading-[1.1] font-display mb-8">
                Outreach has become<br />unbearably loud.
              </h2>
              <div className="space-y-8 text-[#716E68] text-[17px] md:text-[19px] font-light leading-relaxed">
                <p>
                  Modern law firms waste profound amounts of time manually researching prospects, or worse, they rely on mass-email tools that destroy their reputation with generic, robotic copy.
                </p>
                <p>
                  We believe true business development shouldn't feel like spam. CouncilFlow brings a meditative rhythm to prospecting—filtering out the chaos to present only the highest fidelity opportunities, and drafting outreach with a quietly authoritative voice.
                </p>
              </div>
            </div>
            <div className="order-1 lg:order-2 bg-white p-10 md:p-16 rounded-2xl border border-[#EBE8E0] shadow-[0_8px_40px_rgb(0,0,0,0.03)] relative overflow-hidden">
              <div className="absolute top-0 left-0 w-1.5 h-full bg-[#EBE8E0]"></div>
              <div className="absolute -top-10 -right-10 text-[120px] text-[#F7F6F2] font-serif leading-none italic pointer-events-none">"</div>
              <p className="relative z-10 text-[20px] md:text-[24px] font-light text-[#2C2A26] italic leading-relaxed mb-10">
                "CouncilFlow took our firm's prospecting from a chaotic, 10-hour-a-week chore to an elegant, automated pipeline that runs in the background. It feels like magic."
              </p>
              <div className="relative z-10 flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-[#EFECE5] flex items-center justify-center text-[#86827A] font-medium text-[15px]">SJ</div>
                <div>
                  <p className="font-medium text-[#2C2A26] text-[15px]">Sarah Jenkins</p>
                  <p className="text-[13px] text-[#86827A]">Managing Partner, Meridian Counsel</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Feature Deep Dive (The Solution) */}
      <section id="platform" className="py-24 md:py-[180px] bg-[#F7F6F2]">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center max-w-3xl mx-auto mb-20 md:mb-32">
            <span className="text-[11px] font-semibold tracking-[0.25em] text-[#A19D94] uppercase mb-6 block">The Platform</span>
            <h2 className="text-[2.5rem] md:text-[4rem] font-light tracking-[-0.01em] text-[#2C2A26] font-display mb-8 leading-[1.1]">
              A cohesive system for growth.
            </h2>
            <p className="text-[17px] md:text-[21px] text-[#716E68] font-light leading-relaxed">
              We replaced four different tools with one seamless workflow. From deep web research to final review, every motion is intentional, transparent, and completely automated.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 md:gap-12">
            {/* Card 1 */}
            <div className="bg-white p-10 md:p-12 border border-[#EBE8E0] rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.02)] transition-all duration-700 hover:shadow-[0_20px_60px_rgb(0,0,0,0.06)] hover:-translate-y-2 group">
              <div className="w-14 h-14 bg-[#F7F6F2] border border-[#EBE8E0] rounded-xl flex items-center justify-center mb-10 text-[#2C2A26] group-hover:bg-[#2C2A26] group-hover:text-white transition-colors duration-500">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
              </div>
              <h3 className="text-[22px] font-medium text-[#2C2A26] mb-4">Deep Web Enrichment</h3>
              <p className="text-[#716E68] text-[15px] font-light leading-relaxed">
                Unearth context with natural grace. Enter a company name, and our orchestration engine silently sweeps the web to gather recent news, executive structures, and firmographics in seconds.
              </p>
            </div>

            {/* Card 2 */}
            <div className="bg-white p-10 md:p-12 border border-[#EBE8E0] rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.02)] transition-all duration-700 hover:shadow-[0_20px_60px_rgb(0,0,0,0.06)] hover:-translate-y-2 group">
              <div className="w-14 h-14 bg-[#F7F6F2] border border-[#EBE8E0] rounded-xl flex items-center justify-center mb-10 text-[#2C2A26] group-hover:bg-[#2C2A26] group-hover:text-white transition-colors duration-500">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
              </div>
              <h3 className="text-[22px] font-medium text-[#2C2A26] mb-4">Mindful AI Drafting</h3>
              <p className="text-[#716E68] text-[15px] font-light leading-relaxed">
                Emails authored with quiet confidence. Our intelligence engine ensures your outreach remains refined, bespoke to the prospect's immediate needs, and profoundly human.
              </p>
            </div>

            {/* Card 3 */}
            <div className="bg-white p-10 md:p-12 border border-[#EBE8E0] rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.02)] transition-all duration-700 hover:shadow-[0_20px_60px_rgb(0,0,0,0.06)] hover:-translate-y-2 group">
              <div className="w-14 h-14 bg-[#F7F6F2] border border-[#EBE8E0] rounded-xl flex items-center justify-center mb-10 text-[#2C2A26] group-hover:bg-[#2C2A26] group-hover:text-white transition-colors duration-500">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
              </div>
              <h3 className="text-[22px] font-medium text-[#2C2A26] mb-4">Fluid Automation</h3>
              <p className="text-[#716E68] text-[15px] font-light leading-relaxed">
                Like a gentle current, prospects move through your pipeline autonomously. Schedule weekly batches to run while you sleep, and wake up to a curated list of drafts waiting for approval.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing Section (Transparent, elegant) */}
      <section id="pricing" className="py-24 md:py-[180px] bg-[#FDFCFB]">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-20 md:mb-32">
            <span className="text-[11px] font-semibold tracking-[0.25em] text-[#A19D94] uppercase mb-6 block">Plans & Pricing</span>
            <h2 className="text-[2.5rem] md:text-[4rem] font-light tracking-[-0.01em] text-[#2C2A26] font-display mb-6 leading-[1.1]">Simple, transparent pricing.</h2>
            <p className="text-[#716E68] text-[17px] md:text-[19px] max-w-2xl mx-auto font-light leading-relaxed">Choose the scale that fits your firm's ambition. Cancel anytime.</p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
            {/* Starter */}
            <div className="bg-white p-12 border border-[#EBE8E0] rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.02)] flex flex-col transition-all duration-500 hover:shadow-[0_20px_60px_rgb(0,0,0,0.06)]">
              <h3 className="text-[22px] font-medium text-[#2C2A26] mb-3">Starter Kit</h3>
              <p className="text-[#86827A] text-[14px] mb-8 pb-8 border-b border-[#EBE8E0]">For solo practitioners</p>
              <div className="mb-10 flex items-baseline gap-1">
                <span className="text-[3.5rem] leading-none font-light tracking-[-0.02em] text-[#2C2A26] font-display">$49</span>
                <span className="text-[#86827A] font-medium">/mo</span>
              </div>
              <ul className="space-y-5 mb-14 flex-grow">
                <li className="flex items-start gap-4 text-[#716E68] text-[15px]"><span className="text-[#2C2A26] mt-0.5"><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg></span> 500 AI-enriched prospects</li>
                <li className="flex items-start gap-4 text-[#716E68] text-[15px]"><span className="text-[#2C2A26] mt-0.5"><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg></span> Basic outreach generation</li>
                <li className="flex items-start gap-4 text-[#716E68] text-[15px]"><span className="text-[#2C2A26] mt-0.5"><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg></span> 1 User Seat</li>
              </ul>
              <Link href="/checkout?plan=starter" className="block w-full text-center bg-white border border-[#2C2A26] text-[#2C2A26] py-3.5 rounded-md text-[15px] font-medium hover:bg-[#F7F6F2] transition-colors shadow-sm">Select Starter</Link>
            </div>

            {/* Pro (Highlighted) */}
            <div className="bg-[#2C2A26] text-[#FDFCFB] p-12 border border-[#2C2A26] rounded-2xl shadow-[0_20px_60px_rgb(0,0,0,0.15)] flex flex-col relative transform md:-translate-y-6">
              <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white text-[#2C2A26] text-[10px] font-bold px-4 py-1.5 rounded-full uppercase tracking-[0.2em] shadow-md">Most Popular</div>
              <h3 className="text-[22px] font-medium mb-3">Pro Firm</h3>
              <p className="text-[#A19D94] text-[14px] mb-8 pb-8 border-b border-[#4A4742]">For growing legal teams</p>
              <div className="mb-10 flex items-baseline gap-1">
                <span className="text-[3.5rem] leading-none font-light tracking-[-0.02em] font-display">$149</span>
                <span className="text-[#A19D94] font-medium">/mo</span>
              </div>
              <ul className="space-y-5 mb-14 flex-grow">
                <li className="flex items-start gap-4 text-[#E2DECF] text-[15px]"><span className="text-white mt-0.5"><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg></span> 2,500 AI-enriched prospects</li>
                <li className="flex items-start gap-4 text-[#E2DECF] text-[15px]"><span className="text-white mt-0.5"><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg></span> Custom AI voice tuning</li>
                <li className="flex items-start gap-4 text-[#E2DECF] text-[15px]"><span className="text-white mt-0.5"><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg></span> Full CRM syncing</li>
                <li className="flex items-start gap-4 text-[#E2DECF] text-[15px]"><span className="text-white mt-0.5"><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg></span> 5 User Seats</li>
              </ul>
              <Link href="/checkout?plan=pro" className="block w-full text-center bg-white text-[#2C2A26] py-3.5 rounded-md text-[15px] font-medium hover:bg-[#EFECE5] transition-colors shadow-md hover:shadow-lg">Select Pro</Link>
            </div>

            {/* Premium */}
            <div className="bg-white p-12 border border-[#EBE8E0] rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.02)] flex flex-col transition-all duration-500 hover:shadow-[0_20px_60px_rgb(0,0,0,0.06)]">
              <h3 className="text-[22px] font-medium text-[#2C2A26] mb-3">Premium Agency</h3>
              <p className="text-[#86827A] text-[14px] mb-8 pb-8 border-b border-[#EBE8E0]">For scaling operations</p>
              <div className="mb-10 flex items-baseline gap-1">
                <span className="text-[3.5rem] leading-none font-light tracking-[-0.02em] text-[#2C2A26] font-display">$399</span>
                <span className="text-[#86827A] font-medium">/mo</span>
              </div>
              <ul className="space-y-5 mb-14 flex-grow">
                <li className="flex items-start gap-4 text-[#716E68] text-[15px]"><span className="text-[#2C2A26] mt-0.5"><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg></span> Unlimited enrichment</li>
                <li className="flex items-start gap-4 text-[#716E68] text-[15px]"><span className="text-[#2C2A26] mt-0.5"><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg></span> Priority API & Execution</li>
                <li className="flex items-start gap-4 text-[#716E68] text-[15px]"><span className="text-[#2C2A26] mt-0.5"><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg></span> Dedicated Onboarding</li>
                <li className="flex items-start gap-4 text-[#716E68] text-[15px]"><span className="text-[#2C2A26] mt-0.5"><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg></span> Unlimited Seats</li>
              </ul>
              <Link href="/checkout?plan=premium" className="block w-full text-center bg-white border border-[#2C2A26] text-[#2C2A26] py-3.5 rounded-md text-[15px] font-medium hover:bg-[#F7F6F2] transition-colors shadow-sm">Select Premium</Link>
            </div>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-24 md:py-[180px] bg-[#F7F6F2] px-6 text-center border-t border-[#EBE8E0]">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-[3rem] md:text-[5rem] font-light tracking-[-0.02em] text-[#2C2A26] mb-8 font-display leading-[1.05]">
            Ready to find your focus?
          </h2>
          <p className="text-[19px] md:text-[22px] text-[#716E68] font-light mb-14 leading-relaxed max-w-2xl mx-auto">
            Join the forward-thinking firms accelerating their pipeline with CouncilFlow. Begin your 14-day free trial today.
          </p>
          <Link href="/auth/sign-in" className="inline-block bg-[#2C2A26] text-[#FDFCFB] px-12 py-5 rounded-md text-[16px] font-medium transition-all duration-300 hover:bg-[#1A1917] shadow-[0_8px_30px_rgb(0,0,0,0.12)] hover:shadow-[0_8px_40px_rgb(0,0,0,0.16)] hover:-translate-y-1">
            Begin the journey
          </Link>
        </div>
      </section>

      {/* Structured Footer */}
      <footer className="bg-[#EFECE5] pt-24 pb-12 px-6 border-t border-[#EBE8E0]">
        <div className="max-w-7xl mx-auto grid grid-cols-2 lg:grid-cols-4 gap-16 lg:gap-12 mb-20">
          <div className="col-span-2 lg:col-span-2">
            <span className="text-[13px] font-semibold tracking-[0.2em] uppercase text-[#2C2A26] mb-8 block">CouncilFlow</span>
            <p className="text-[#716E68] font-light max-w-sm text-[15px] leading-relaxed">
              The AI-native business development platform designed to bring clarity, calm, and precision to modern law firm prospecting.
            </p>
          </div>
          <div>
            <h4 className="font-semibold text-[#2C2A26] mb-8 text-[14px]">Platform</h4>
            <ul className="space-y-5 text-[14px] text-[#716E68]">
              <li><a href="#platform" className="hover:text-[#2C2A26] transition-colors">Features</a></li>
              <li><a href="#pricing" className="hover:text-[#2C2A26] transition-colors">Pricing</a></li>
              <li><Link href="/auth/sign-in" className="hover:text-[#2C2A26] transition-colors">Log in</Link></li>
            </ul>
          </div>
          <div>
            <h4 className="font-semibold text-[#2C2A26] mb-8 text-[14px]">Legal</h4>
            <ul className="space-y-5 text-[14px] text-[#716E68]">
              <li><a href="#" className="hover:text-[#2C2A26] transition-colors">Privacy Policy</a></li>
              <li><a href="#" className="hover:text-[#2C2A26] transition-colors">Terms of Service</a></li>
              <li><a href="#" className="hover:text-[#2C2A26] transition-colors">Data Security</a></li>
            </ul>
          </div>
        </div>
        <div className="max-w-7xl mx-auto border-t border-[#D5D1C6] pt-10 flex flex-col md:flex-row items-center justify-between text-[11px] text-[#A19D94] uppercase tracking-[0.2em] font-medium">
          <p className="mb-6 md:mb-0">© {new Date().getFullYear()} CouncilFlow. All rights reserved.</p>
          <div className="flex space-x-8">
            <a href="#" className="hover:text-[#2C2A26] transition-colors">Twitter</a>
            <a href="#" className="hover:text-[#2C2A26] transition-colors">LinkedIn</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
