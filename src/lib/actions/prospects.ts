"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export async function addProspectAction(formData: FormData) {
  const supabase = await createClient();
  const company_name = formData.get("company_name") as string;
  const domain = formData.get("domain") as string;
  const primary_contact_name = formData.get("primary_contact_name") as string;
  const primary_contact_email = formData.get("primary_contact_email") as string;
  const primary_contact_title = formData.get("primary_contact_title") as string;
  const linkedin_url = formData.get("linkedin_url") as string;
  const firm_id = formData.get("firm_id") as string;

  const { error } = await supabase.from("prospects").insert({
    firm_id,
    company_name,
    domain,
    primary_contact_name,
    primary_contact_email,
    primary_contact_title,
    linkedin_url,
    status: "researched",
    pipeline_stage: "researched",
  });

  if (error) {
    redirect(`/dashboard?error=${encodeURIComponent(error.message)}#manual-ingestion`);
  }

  redirect("/dashboard?message=Prospect%20ingested%20successfully#manual-ingestion");
}
