import { addProspectAction } from "@/lib/actions/prospects";

interface ManualIngestionFormProps {
  firmId: string;
}

export function ManualIngestionForm({ firmId }: ManualIngestionFormProps) {
  return (
    <section
      id="manual-ingestion"
      className="mt-8 bg-white border border-[#EBE8E0] p-8 rounded-sm reveal-up shadow-sm mb-12"
    >
      <div className="mb-8">
        <h2 className="text-xl font-light tracking-tight">Manual Firm Ingestion</h2>
        <p className="mt-2 text-sm text-[#716E68]">Directly inject prospects into the research pipeline.</p>
      </div>

      <form action={addProspectAction} className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <input type="hidden" name="firm_id" value={firmId} />
        <div className="space-y-4">
          <div>
            <label className="block text-[10px] uppercase tracking-widest font-medium text-[#A19D94] mb-1.5">
              Firm Name
            </label>
            <input
              type="text"
              name="company_name"
              required
              placeholder="e.g. Acme Corp"
              className="input-base"
            />
          </div>
          <div>
            <label className="block text-[10px] uppercase tracking-widest font-medium text-[#A19D94] mb-1.5">
              Domain / URL
            </label>
            <input
              type="text"
              name="domain"
              required
              placeholder="acme.com"
              className="input-base"
            />
          </div>
          <div>
            <label className="block text-[10px] uppercase tracking-widest font-medium text-[#A19D94] mb-1.5">
              LinkedIn URL
            </label>
            <input
              type="url"
              name="linkedin_url"
              placeholder="https://linkedin.com/company/..."
              className="input-base"
            />
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-[10px] uppercase tracking-widest font-medium text-[#A19D94] mb-1.5">
              Primary Contact Name
            </label>
            <input
              type="text"
              name="primary_contact_name"
              placeholder="John Smith"
              className="input-base"
            />
          </div>
          <div>
            <label className="block text-[10px] uppercase tracking-widest font-medium text-[#A19D94] mb-1.5">
              Contact Email
            </label>
            <input
              type="email"
              name="primary_contact_email"
              placeholder="john@acme.com"
              className="input-base"
            />
          </div>
          <div>
            <label className="block text-[10px] uppercase tracking-widest font-medium text-[#A19D94] mb-1.5">
              Contact Title
            </label>
            <input
              type="text"
              name="primary_contact_title"
              placeholder="CEO"
              className="input-base"
            />
          </div>
        </div>

        <div className="md:col-span-2 pt-4 border-t border-[#F7F6F2] flex justify-end">
          <button type="submit" className="btn-primary px-8">
            Ingest Prospect
          </button>
        </div>
      </form>
    </section>
  );
}
