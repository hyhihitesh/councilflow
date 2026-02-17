import { z } from "zod";

export function formatZodError(error: z.ZodError) {
  const issue = error.issues[0];
  if (!issue) return "Invalid request payload.";
  const path = issue.path.length ? issue.path.join(".") : "payload";
  return `${path}: ${issue.message}`;
}
