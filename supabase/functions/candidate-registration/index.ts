import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

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

      // Validate File Type (PDF or Word)
      const allowedTypes = [
        "application/pdf",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/msword",
      ];
      if (!allowedTypes.includes(file.type)) {
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
        .upload(fileName, file, {
          contentType: file.type,
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
          cv_mime_type: file.type,
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

      const proxyRes = await fetch(proxyReq);

      if (!proxyRes.ok) {
        return new Response(
          JSON.stringify({
            error: "Upstream parser failed",
            details: await proxyRes.text(),
          }),
          {
            status: proxyRes.status,
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

      const { error } = await supabase
        .from("candidate_registration_drafts")
        .update({
          user_overrides_json: overrides,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", user.id);

      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
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
      const { error } = await supabase
        .from("candidate_registration_drafts")
        .update({
          parse_status: "pending_validation",
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", user.id);

      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
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
