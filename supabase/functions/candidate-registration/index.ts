import { serve } from "std/http/server.ts";
import { createClient } from "@supabase/supabase-js";

// H3 fix: restrict CORS to a specific origin configured via env var.
// Falls back to * only for local dev (when env var is unset).
const allowedOrigin = Deno.env.get("ALLOWED_FRONTEND_ORIGIN") || "*";

const corsHeaders = {
  "Access-Control-Allow-Origin": allowedOrigin,
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const fastApiProxyTimeoutMs = Number(
  Deno.env.get("FASTAPI_PROXY_TIMEOUT_MS") || "75000",
);

function detectAllowedMimeType(fileBytes: Uint8Array): string | null {
  if (
    fileBytes.length >= 5 &&
    fileBytes[0] === 0x25 &&
    fileBytes[1] === 0x50 &&
    fileBytes[2] === 0x44 &&
    fileBytes[3] === 0x46 &&
    fileBytes[4] === 0x2d
  ) {
    return "application/pdf";
  }

  if (
    fileBytes.length >= 8 &&
    fileBytes[0] === 0xd0 &&
    fileBytes[1] === 0xcf &&
    fileBytes[2] === 0x11 &&
    fileBytes[3] === 0xe0 &&
    fileBytes[4] === 0xa1 &&
    fileBytes[5] === 0xb1 &&
    fileBytes[6] === 0x1a &&
    fileBytes[7] === 0xe1
  ) {
    return "application/msword";
  }

  if (
    fileBytes.length >= 4 &&
    fileBytes[0] === 0x50 &&
    fileBytes[1] === 0x4b &&
    fileBytes[2] === 0x03 &&
    fileBytes[3] === 0x04
  ) {
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  }

  return null;
}

serve(async (req) => {
  // Handle CORS Preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const path = url.pathname.split("/").pop(); // Gets the last segment (e.g. upload-cv, save-draft, publish)

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");

    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error("Missing Supabase environment variables");
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing Authorization header" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Initialize Supabase client using the user's JWT
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    // Verify the user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ==========================================
    // ROUTE 1: /upload-cv
    // ==========================================
    if (path === "upload-cv") {
      const formData = await req.formData();
      const file = formData.get("file") as File;

      if (!file) {
        return new Response(JSON.stringify({ error: "No file uploaded" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Validate File Size (max 5MB)
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

      // Validate File Type (PDF or Word) using magic bytes instead of trusting the browser-provided MIME type.
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
            error:
              "Invalid file type. Only PDF and Word documents are allowed.",
          }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      // 1. Upload to Supabase Storage (candidate-cvs bucket)
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

      // 2. Register in Database as "parsing"
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

      // 3. Prepare new FormData to proxy to FastAPI
      const fastApiUrl = Deno.env.get("FASTAPI_URL");
      const fastApiKey = Deno.env.get("FASTAPI_API_KEY");

      if (!fastApiUrl || !fastApiKey) {
        throw new Error("Missing FastAPI environment variables for proxying");
      }

      const proxyFormData = new FormData();
      proxyFormData.append("file", file);
      // Inject the user_id securely from the JWT token, ignoring whatever the frontend sent
      proxyFormData.append("user_id", user.id);

      // 3. Proxy to Cloud Run FastAPI
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
        // H1 fix: log full upstream error server-side, return only a generic
        // message to the client to avoid leaking FastAPI paths, LLM errors or PII.
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

      // 4. Return the stream directly to the client
      return new Response(proxyRes.body, {
        status: proxyRes.status,
        headers: {
          ...corsHeaders,
          "Content-Type": proxyRes.headers.get("Content-Type") ||
            "text/event-stream",
        },
      });
    }

    // ==========================================
    // ROUTE 2: /save-draft
    // ==========================================
    if (path === "save-draft") {
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

    // ==========================================
    // ROUTE 3: /publish
    // ==========================================
    if (path === "publish") {
      // H4 fix: guard against race condition where /publish is called before the
      // background CV sync has finished writing parsed_profile_json. Only allow
      // transitioning to pending_validation if the current status is "completed".
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
        .select("id"); // extra guard: DB-level atomic check

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

    // Default Fallback
    return new Response(JSON.stringify({ error: "Endpoint not found" }), {
      status: 404,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Internal Server Error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
