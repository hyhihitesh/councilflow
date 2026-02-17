import { afterEach, describe, expect, it, vi } from "vitest";

import { publishLinkedInPost } from "@/lib/content/publish/linkedin";

describe("linkedin publish", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.LINKEDIN_AUTHOR_URN;
    delete process.env.LINKEDIN_ACCESS_TOKEN;
    delete process.env.LINKEDIN_PUBLISH_URL;
    delete process.env.LINKEDIN_API_VERSION;
  });

  it("fails when config is missing", async () => {
    const result = await publishLinkedInPost({ text: "hello world" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("linkedin_config_missing");
    }
  });

  it("publishes successfully and returns provider post id", async () => {
    process.env.LINKEDIN_AUTHOR_URN = "urn:li:person:abc123";
    process.env.LINKEDIN_ACCESS_TOKEN = "token";

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        return new Response("", {
          status: 201,
          headers: {
            "x-restli-id": "urn:li:ugcPost:12345",
          },
        });
      }),
    );

    const result = await publishLinkedInPost({ text: "hello world" });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.postId).toContain("ugcPost");
    }
  });
});

