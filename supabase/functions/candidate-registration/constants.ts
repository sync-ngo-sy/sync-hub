export const allowedOrigin = Deno.env.get("ALLOWED_FRONTEND_ORIGIN") || "*";

export const corsHeaders = {
  "Access-Control-Allow-Origin": allowedOrigin,
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

export const fastApiProxyTimeoutMs = Number(
  Deno.env.get("FASTAPI_PROXY_TIMEOUT_MS") || "75000",
);
