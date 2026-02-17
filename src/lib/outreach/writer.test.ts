import { afterEach, describe, expect, it, vi } from "vitest";

import { generateOutreachDrafts } from "./writer";

const ORIGINAL_ENV = { ...process.env };
const ORIGINAL_FETCH = global.fetch;

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  global.fetch = ORIGINAL_FETCH;
  vi.restoreAllMocks();
});

describe("outreach writer", () => {
  it("generates exactly three variants with required fields", async () => {
    const drafts = await generateOutreachDrafts({
      company_name: "Acme Legal",
      domain: "acme.com",
      primary_contact_name: "Jordan",
      primary_contact_title: "General Counsel",
    });

    expect(drafts).toHaveLength(3);
    expect(drafts.map((draft) => draft.variant)).toEqual(["direct", "warm", "content_led"]);
    expect(drafts.every((draft) => draft.subject.length >= 5)).toBe(true);
    expect(drafts.every((draft) => draft.body.length >= 30)).toBe(true);
  });

  it("uses OpenAI writer when configured", async () => {
    process.env.OUTREACH_WRITER_PROVIDER = "openai";
    process.env.OPENAI_API_KEY = "test-key";
    process.env.OPENAI_WRITER_MODEL = "gpt-4.1-mini";

    global.fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  drafts: [
                    {
                      variant: "direct",
                      subject: "Direct subject",
                      body: "Direct body",
                      voice_score: 80,
                    },
                    {
                      variant: "warm",
                      subject: "Warm subject",
                      body: "Warm body",
                      voice_score: 90,
                    },
                    {
                      variant: "content_led",
                      subject: "Content subject",
                      body: "Content body",
                      voice_score: 85,
                    },
                  ],
                }),
              },
            },
          ],
        }),
        { status: 200 },
      ),
    ) as typeof fetch;

    const drafts = await generateOutreachDrafts({
      company_name: "Acme Legal",
      domain: "acme.com",
      primary_contact_name: "Jordan",
      primary_contact_title: "General Counsel",
    });

    expect(drafts).toHaveLength(3);
    expect(drafts[0]?.subject).toBe("Direct subject");
    expect(drafts[1]?.subject).toBe("Warm subject");
    expect(drafts[2]?.subject).toBe("Content subject");
  });

  it("falls back to local templates if OpenAI fails", async () => {
    process.env.OUTREACH_WRITER_PROVIDER = "openai";
    process.env.OPENAI_API_KEY = "test-key";

    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response("provider unavailable", { status: 503 }))
      .mockResolvedValueOnce(new Response("provider unavailable", { status: 503 })) as typeof fetch;

    const drafts = await generateOutreachDrafts({
      company_name: "Acme Legal",
      domain: "acme.com",
      primary_contact_name: "Jordan",
      primary_contact_title: "General Counsel",
    });

    expect(drafts).toHaveLength(3);
    expect(drafts.map((draft) => draft.variant)).toEqual(["direct", "warm", "content_led"]);
    expect(drafts.every((draft) => draft.subject.length >= 5)).toBe(true);
  });

  it("uses fallback OpenAI model when primary model fails", async () => {
    process.env.OUTREACH_WRITER_PROVIDER = "openai";
    process.env.OPENAI_API_KEY = "test-key";
    process.env.OPENAI_WRITER_MODEL = "gpt-4.1-mini";
    process.env.OPENAI_WRITER_FALLBACK_MODEL = "gpt-4o-mini";

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("rate limited", { status: 429 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    drafts: [
                      {
                        variant: "direct",
                        subject: "Direct via fallback",
                        body: "Body via fallback direct",
                        voice_score: 81,
                      },
                      {
                        variant: "warm",
                        subject: "Warm via fallback",
                        body: "Body via fallback warm",
                        voice_score: 88,
                      },
                      {
                        variant: "content_led",
                        subject: "Content via fallback",
                        body: "Body via fallback content",
                        voice_score: 84,
                      },
                    ],
                  }),
                },
              },
            ],
          }),
          { status: 200 },
        ),
      );

    global.fetch = fetchMock as typeof fetch;

    const drafts = await generateOutreachDrafts({
      company_name: "Acme Legal",
      domain: "acme.com",
      primary_contact_name: "Jordan",
      primary_contact_title: "General Counsel",
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const firstBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as { model: string };
    const secondBody = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body)) as { model: string };
    expect(firstBody.model).toBe("gpt-4.1-mini");
    expect(secondBody.model).toBe("gpt-4o-mini");
    expect(drafts[0]?.subject).toBe("Direct via fallback");
  });
});
