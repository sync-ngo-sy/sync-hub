import { asRecord, asString, type JsonRecord } from "../_shared/utils.ts";

export function jsonResponse(status: number, payload: JsonRecord) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json",
    },
  });
}

export function candidateIdFromPayload(payload: JsonRecord) {
  const direct = asString(payload.candidate_id) ??
    asString(payload.candidate_pk) ??
    asString(payload.id);
  if (direct) {
    return direct;
  }

  const nestedCandidates = [
    asRecord(payload.candidate),
    asRecord(payload.object),
    asRecord(payload.data),
    asRecord(payload.payload),
  ];

  for (const record of nestedCandidates) {
    const nested = asString(record.candidate_id) ??
      asString(record.candidate_pk) ??
      asString(record.id);
    if (nested) {
      return nested;
    }
  }

  return null;
}

export function requestSecret(req: Request, url: URL) {
  return (
    req.headers.get("x-webhook-secret") ??
      req.headers.get("x-manatal-webhook-secret") ??
      url.searchParams.get("secret")
  );
}
