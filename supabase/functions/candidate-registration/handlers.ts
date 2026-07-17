import { corsHeaders, fastApiProxyTimeoutMs } from "./constants.ts";
import { detectAllowedMimeType } from "./helpers.ts";

export async function handleUploadCv(
  req: Request,
  user: any,
  supabase: any,
): Promise<Response> {
  const formData = await req.formData();
  const file = formData.get("file") as File;

  if (!file) {
    return new Response(JSON.stringify({ error: "No file uploaded" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const MAX_SIZE = 5 * 1024 * 1024;
  if (file.size > MAX_SIZE) {
    return new Response(
      JSON.stringify({ error: "File exceeds 5MB limit" }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  const fileBytes = new Uint8Array(await file.arrayBuffer());

  const allowedTypes = [
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/msword",
  ];
  const detectedType = detectAllowedMimeType(fileBytes);
  if (
    !detectedType || !allowedTypes.includes(detectedType) ||
    (file.type && file.type !== detectedType)
  ) {
    return new Response(
      JSON.stringify({
        error: "Invalid file type. Only PDF and Word documents are allowed.",
      }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  const fileName = `${user.id}/${Date.now()}-${
    file.name.replace(/[^a-zA-Z0-9.-]/g, "_")
  }`;
  const { error: uploadError } = await supabase.storage
    .from("candidate-cvs")
    .upload(fileName, new Blob([fileBytes], { type: detectedType }), {
      contentType: detectedType,
      upsert: true,
    });

  if (uploadError) {
    return new Response(
      JSON.stringify({
        error: "Storage upload failed: " + uploadError.message,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  const { error: dbError } = await supabase
    .from("candidate_registration_drafts")
    .upsert({
      user_id: user.id,
      cv_storage_path: fileName,
      cv_original_filename: file.name,
      cv_mime_type: detectedType,
      cv_size_bytes: file.size,
      parse_status: "parsing",
      parse_started_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id" });

  if (dbError) {
    return new Response(
      JSON.stringify({
        error: "Failed to register draft: " + dbError.message,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  const fastApiUrl = Deno.env.get("FASTAPI_URL");
  const fastApiKey = Deno.env.get("FASTAPI_API_KEY");

  if (!fastApiUrl || !fastApiKey) {
    throw new Error("Missing FastAPI environment variables for proxying");
  }

  const proxyFormData = new FormData();
  proxyFormData.append("file", file);
  proxyFormData.append("user_id", user.id);

  const proxyReq = new Request(
    `${fastApiUrl.replace(/\/+$/, "")}/api/v1/parse-cv-fast`,
    {
      method: "POST",
      headers: {
        "X-API-Key": fastApiKey,
      },
      body: proxyFormData,
    },
  );

  const proxyController = new AbortController();
  const proxyTimeout = setTimeout(
    () => proxyController.abort(),
    fastApiProxyTimeoutMs,
  );
  let proxyRes: Response;

  try {
    proxyRes = await fetch(proxyReq, { signal: proxyController.signal });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      return new Response(
        JSON.stringify({
          error: "CV parsing timed out. Please try again later.",
        }),
        {
          status: 504,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }
    throw error;
  } finally {
    clearTimeout(proxyTimeout);
  }

  if (!proxyRes.ok) {
    const upstreamError = await proxyRes.text();
    console.error(
      `[upload-cv] Upstream parser error (${proxyRes.status}):`,
      upstreamError,
    );
    return new Response(
      JSON.stringify({
        error: "CV parsing failed. Please try again later.",
      }),
      {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  return new Response(proxyRes.body, {
    status: proxyRes.status,
    headers: {
      ...corsHeaders,
      "Content-Type": proxyRes.headers.get("Content-Type") ||
        "text/event-stream",
    },
  });
}

export async function handleSaveDraft(
  req: Request,
  user: any,
  supabase: any,
): Promise<Response> {
  const body = await req.json();
  const overrides = body.overrides || body.user_overrides_json;

  if (!overrides) {
    return new Response(
      JSON.stringify({ error: "Missing overrides data" }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  const { data: updatedDrafts, error } = await supabase
    .from("candidate_registration_drafts")
    .update({
      user_overrides_json: overrides,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", user.id)
    .select("id");

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (!updatedDrafts?.length) {
    return new Response(
      JSON.stringify({ error: "Draft not found" }),
      {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export async function handlePublish(
  req: Request,
  user: any,
  supabase: any,
): Promise<Response> {
  const { data: currentDraft, error: fetchError } = await supabase
    .from("candidate_registration_drafts")
    .select("parse_status")
    .eq("user_id", user.id)
    .single();

  if (fetchError || !currentDraft) {
    return new Response(
      JSON.stringify({ error: "Draft not found" }),
      {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  if (currentDraft.parse_status !== "completed") {
    return new Response(
      JSON.stringify({
        error: "Draft is not ready to publish",
        current_status: currentDraft.parse_status,
      }),
      {
        status: 409,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  const { data: updatedDrafts, error } = await supabase
    .from("candidate_registration_drafts")
    .update({
      parse_status: "pending_validation",
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", user.id)
    .eq("parse_status", "completed")
    .select("id");

  if (error) {
    return new Response(
      JSON.stringify({ error: "Failed to publish draft" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  if (!updatedDrafts?.length) {
    return new Response(
      JSON.stringify({ error: "Draft is not ready to publish" }),
      {
        status: 409,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  return new Response(
    JSON.stringify({
      success: true,
      message: "Draft marked as pending_validation",
    }),
    {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    },
  );
}
