import {
  asRecord,
  asString,
  describeError,
  parseIntegerEnv,
  sha256Hex,
} from "./utils.ts";

export type GcsServiceAccountCredentials = {
  client_email?: string;
  private_key?: string;
};

export type GcsSignedUrlResult = {
  url: string;
  expiresAt: string;
};

export type OriginalDocumentRow = {
  id: string;
  tenant_id: string;
  candidate_id: string | null;
  source_uri: string | null;
  storage_path: string | null;
  original_filename: string | null;
};

const DEFAULT_GCS_SIGNED_URL_SECONDS = 10 * 60;

function rfc3986Encode(value: string) {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

function decodeBase64Secret(value: string, envName: string) {
  try {
    const binary = atob(value.replace(/\s/g, ""));
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return new TextDecoder().decode(bytes);
  } catch (error) {
    throw new Error(`${envName} must be valid base64: ${describeError(error)}`);
  }
}

function normalizeSecretValue(value: string) {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

function normalizePrivateKey(privateKey: string) {
  return normalizeSecretValue(privateKey).replace(/\\n/g, "\n");
}

function encodePath(value: string) {
  return value.split("/").map(rfc3986Encode).join("/");
}

function bytesToHex(bytes: ArrayBuffer) {
  return Array.from(new Uint8Array(bytes))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function pemToArrayBuffer(pem: string) {
  const base64 = pem
    .replace(/-----BEGIN PRIVATE KEY-----/g, "")
    .replace(/-----END PRIVATE KEY-----/g, "")
    .replace(/\s/g, "");
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes.buffer;
}

async function signRsaSha256(privateKey: string, value: string) {
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToArrayBuffer(privateKey),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return bytesToHex(
    await crypto.subtle.sign(
      "RSASSA-PKCS1-v1_5",
      key,
      new TextEncoder().encode(value),
    ),
  );
}

function getGcsBucketName() {
  return (
    asString(Deno.env.get("GCS_ORIGINALS_BUCKET")) ??
      asString(Deno.env.get("CV_GCS_BUCKET")) ??
      asString(Deno.env.get("CV_BUCKET_NAME"))
  );
}

function getGcsCredentials() {
  const rawJson = asString(Deno.env.get("GCS_SIGNED_URL_SERVICE_ACCOUNT_JSON"));
  const rawJsonBase64 = asString(
    Deno.env.get("GCS_SIGNED_URL_SERVICE_ACCOUNT_JSON_BASE64"),
  );
  const raw = rawJson
    ? normalizeSecretValue(rawJson)
    : rawJsonBase64
    ? decodeBase64Secret(
      rawJsonBase64,
      "GCS_SIGNED_URL_SERVICE_ACCOUNT_JSON_BASE64",
    )
    : null;
  if (!raw) {
    const clientEmail = asString(Deno.env.get("GCS_SIGNED_URL_CLIENT_EMAIL"));
    const privateKey = asString(Deno.env.get("GCS_SIGNED_URL_PRIVATE_KEY"));
    const privateKeyBase64 = asString(
      Deno.env.get("GCS_SIGNED_URL_PRIVATE_KEY_BASE64"),
    );
    const normalizedPrivateKey = privateKey
      ? normalizePrivateKey(privateKey)
      : privateKeyBase64
      ? normalizePrivateKey(
        decodeBase64Secret(
          privateKeyBase64,
          "GCS_SIGNED_URL_PRIVATE_KEY_BASE64",
        ),
      )
      : null;
    if (!clientEmail && !normalizedPrivateKey) {
      return null;
    }
    if (!clientEmail || !normalizedPrivateKey) {
      throw new Error(
        "GCS signed URL credentials require GCS_SIGNED_URL_CLIENT_EMAIL and a private key secret.",
      );
    }
    return {
      client_email: clientEmail,
      private_key: normalizedPrivateKey,
    };
  }
  const parsed = JSON.parse(raw) as GcsServiceAccountCredentials;
  if (!parsed.client_email || !parsed.private_key) {
    throw new Error(
      "GCS signed URL service account JSON must include client_email and private_key.",
    );
  }
  return {
    client_email: parsed.client_email,
    private_key: normalizePrivateKey(parsed.private_key),
  };
}

export function parseGcsUri(value: string) {
  if (!/^gs:\/\//i.test(value)) {
    return null;
  }
  const withoutScheme = value.slice("gs://".length);
  const slashIndex = withoutScheme.indexOf("/");
  if (slashIndex < 1 || slashIndex === withoutScheme.length - 1) {
    return null;
  }
  return {
    bucket: withoutScheme.slice(0, slashIndex),
    objectName: withoutScheme.slice(slashIndex + 1),
  };
}

export function resolveGcsLocation(document: OriginalDocumentRow) {
  const configuredBucket = getGcsBucketName();
  const sourceUri = asString(document.source_uri);
  const storagePath = asString(document.storage_path);

  const sourceGcsUri = sourceUri ? parseGcsUri(sourceUri) : null;
  if (sourceGcsUri) {
    return sourceGcsUri;
  }

  const storageGcsUri = storagePath ? parseGcsUri(storagePath) : null;
  if (storageGcsUri) {
    return storageGcsUri;
  }

  if (!configuredBucket || !storagePath) {
    return null;
  }

  const objectName = storagePath.startsWith(`${configuredBucket}/`)
    ? storagePath.slice(configuredBucket.length + 1)
    : storagePath;
  return { bucket: configuredBucket, objectName };
}

async function createRemoteGcsSignedUrl(
  bucket: string,
  objectName: string,
): Promise<GcsSignedUrlResult | null> {
  const signerUrl = asString(Deno.env.get("GCS_SIGNER_SERVICE_URL"));
  const signerSecret = asString(Deno.env.get("GCS_SIGNER_SHARED_SECRET"));
  if (!signerUrl && !signerSecret) {
    return null;
  }
  if (!signerUrl || !signerSecret) {
    throw new Error(
      "GCS signer service requires GCS_SIGNER_SERVICE_URL and GCS_SIGNER_SHARED_SECRET.",
    );
  }

  const expiresSeconds = parseIntegerEnv(
    "GCS_SIGNED_URL_EXPIRES_SECONDS",
    DEFAULT_GCS_SIGNED_URL_SECONDS,
    60,
    3600,
  );
  const response = await fetch(`${signerUrl.replace(/\/+$/, "")}/sign`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${signerSecret}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ bucket, objectName, expiresSeconds }),
  });

  const payload = asRecord(await response.json().catch(() => ({})));
  if (!response.ok) {
    throw new Error(
      `GCS signer service failed (${response.status}): ${
        describeError(
          payload,
        )
      }`,
    );
  }

  const url = asString(payload.url);
  const expiresAt = asString(payload.expiresAt) ?? asString(payload.expires_at);
  if (!url || !expiresAt) {
    throw new Error("GCS signer service returned an invalid response.");
  }
  return { url, expiresAt };
}

export async function createGcsSignedUrl(bucket: string, objectName: string) {
  const remoteSignedUrl = await createRemoteGcsSignedUrl(bucket, objectName);
  if (remoteSignedUrl) {
    return remoteSignedUrl;
  }

  const credentials = getGcsCredentials();
  if (!credentials) {
    throw new Error(
      "GCS signed URL access is not configured. Set GCS_SIGNER_SERVICE_URL and GCS_SIGNER_SHARED_SECRET, or configure service account signing credentials.",
    );
  }

  const expiresSeconds = parseIntegerEnv(
    "GCS_SIGNED_URL_EXPIRES_SECONDS",
    DEFAULT_GCS_SIGNED_URL_SECONDS,
    60,
    3600,
  );
  const now = new Date();
  const timestamp = now
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");
  const datestamp = timestamp.slice(0, 8);
  const algorithm = "GOOG4-RSA-SHA256";
  const credentialScope = `${datestamp}/auto/storage/goog4_request`;
  const credential = `${credentials.client_email}/${credentialScope}`;
  const host = "storage.googleapis.com";
  const canonicalUri = `/${rfc3986Encode(bucket)}/${encodePath(objectName)}`;
  const queryParams = [
    ["X-Goog-Algorithm", algorithm],
    ["X-Goog-Credential", credential],
    ["X-Goog-Date", timestamp],
    ["X-Goog-Expires", String(expiresSeconds)],
    ["X-Goog-SignedHeaders", "host"],
  ];
  const canonicalQueryString = queryParams
    .map(([key, value]) => `${rfc3986Encode(key)}=${rfc3986Encode(value)}`)
    .join("&");
  const canonicalHeaders = `host:${host}\n`;
  const canonicalRequest = [
    "GET",
    canonicalUri,
    canonicalQueryString,
    canonicalHeaders,
    "host",
    "UNSIGNED-PAYLOAD",
  ].join("\n");
  const stringToSign = [
    algorithm,
    timestamp,
    credentialScope,
    await sha256Hex(canonicalRequest),
  ].join("\n");
  const signature = await signRsaSha256(credentials.private_key, stringToSign);
  return {
    url:
      `https://${host}${canonicalUri}?${canonicalQueryString}&X-Goog-Signature=${signature}`,
    expiresAt: new Date(now.getTime() + expiresSeconds * 1000).toISOString(),
  };
}
