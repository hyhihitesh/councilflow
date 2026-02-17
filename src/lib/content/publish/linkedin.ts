export type LinkedInPublishSuccess = {
  ok: true;
  provider: "linkedin";
  endpoint: string;
  postId: string;
};

export type LinkedInPublishFailure = {
  ok: false;
  provider: "linkedin";
  endpoint: string;
  code:
    | "linkedin_config_missing"
    | "linkedin_auth_missing"
    | "linkedin_request_failed"
    | "linkedin_network_error";
  status?: number;
  message: string;
};

export type LinkedInPublishResult = LinkedInPublishSuccess | LinkedInPublishFailure;

type PublishInput = {
  text: string;
  accessToken?: string | null;
};

function resolveAuthorUrn() {
  return process.env.LINKEDIN_AUTHOR_URN?.trim() ?? "";
}

function resolveAccessToken(inputToken?: string | null) {
  return process.env.LINKEDIN_ACCESS_TOKEN?.trim() || inputToken?.trim() || "";
}

function resolveEndpoint() {
  return process.env.LINKEDIN_PUBLISH_URL?.trim() || "https://api.linkedin.com/v2/ugcPosts";
}

function resolveVersion() {
  return process.env.LINKEDIN_API_VERSION?.trim() || "";
}

export async function publishLinkedInPost(input: PublishInput): Promise<LinkedInPublishResult> {
  const endpoint = resolveEndpoint();
  const authorUrn = resolveAuthorUrn();
  const accessToken = resolveAccessToken(input.accessToken);

  if (!authorUrn) {
    return {
      ok: false,
      provider: "linkedin",
      endpoint,
      code: "linkedin_config_missing",
      message: "LINKEDIN_AUTHOR_URN is required to publish via LinkedIn API.",
    };
  }

  if (!accessToken) {
    return {
      ok: false,
      provider: "linkedin",
      endpoint,
      code: "linkedin_auth_missing",
      message: "No LinkedIn access token available for publish action.",
    };
  }

  const payload = {
    author: authorUrn,
    lifecycleState: "PUBLISHED",
    specificContent: {
      "com.linkedin.ugc.ShareContent": {
        shareCommentary: {
          text: input.text,
        },
        shareMediaCategory: "NONE",
      },
    },
    visibility: {
      "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC",
    },
  };

  try {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "X-Restli-Protocol-Version": "2.0.0",
    };

    const version = resolveVersion();
    if (version) headers["LinkedIn-Version"] = version;

    const response = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const text = (await response.text()).slice(0, 300);
      return {
        ok: false,
        provider: "linkedin",
        endpoint,
        code: "linkedin_request_failed",
        status: response.status,
        message: `LinkedIn publish failed (${response.status}): ${text}`,
      };
    }

    const location = response.headers.get("x-restli-id") || response.headers.get("location");
    let postId = location?.trim() ?? "";

    if (!postId) {
      const body = (await response.text()).trim();
      postId = body || "published";
    }

    return {
      ok: true,
      provider: "linkedin",
      endpoint,
      postId,
    };
  } catch (error) {
    return {
      ok: false,
      provider: "linkedin",
      endpoint,
      code: "linkedin_network_error",
      message: error instanceof Error ? error.message : "Unknown LinkedIn network error",
    };
  }
}

