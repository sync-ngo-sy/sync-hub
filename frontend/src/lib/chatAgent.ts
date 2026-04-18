export function parseChatCandidateIds(raw: string | null | undefined) {
  if (!raw) {
    return [];
  }

  return Array.from(
    new Set(
      raw
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  );
}

export function buildChatHref(candidateIds: string[], question?: string) {
  const ids = Array.from(new Set(candidateIds.map((item) => item.trim()).filter(Boolean)));
  const params = new URLSearchParams();

  if (ids.length) {
    params.set("ids", ids.join(","));
  }

  if (question?.trim()) {
    params.set("q", question.trim());
  }

  const search = params.toString();
  return search ? `/chat?${search}` : "/chat";
}
