import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface LoginBody {
  code?: string;
  device_id?: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const body: LoginBody = await req.json();
    const code = (body.code || "").trim();
    const deviceId = (body.device_id || "").trim();

    if (!code) {
      return new Response(
        JSON.stringify({ error: "Code requis" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    if (!deviceId) {
      return new Response(
        JSON.stringify({ error: "Appareil non identifié" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Find the code with its profile
    const { data: codeRow, error: codeError } = await adminClient
      .from("manager_codes")
      .select("id, code, profile_id, device_id, active, secret_password")
      .eq("code", code)
      .maybeSingle();

    if (codeError || !codeRow) {
      return new Response(
        JSON.stringify({ error: "Code invalide" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!codeRow.active) {
      return new Response(
        JSON.stringify({ error: "Ce code a été désactivé" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Load the profile
    const { data: profile } = await adminClient
      .from("profiles")
      .select("id, full_name, role, active")
      .eq("id", codeRow.profile_id)
      .maybeSingle();

    if (!profile || !profile.active) {
      return new Response(
        JSON.stringify({ error: "Ce compte gérante est désactivé" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check device binding — code is locked to first device that uses it
    if (codeRow.device_id && codeRow.device_id !== deviceId) {
      return new Response(
        JSON.stringify({ error: "Ce code est déjà utilisé sur un autre appareil" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Bind the code to this device on first use
    if (!codeRow.device_id) {
      await adminClient
        .from("manager_codes")
        .update({ device_id: deviceId })
        .eq("id", codeRow.id);
    }

    // Find the user's email
    const { data: usersList } = await adminClient.auth.admin.listUsers();
    const user = usersList.users.find((u) => u.id === codeRow.profile_id);

    if (!user || !user.email) {
      return new Response(
        JSON.stringify({ error: "Compte gérante introuvable" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Sign in with the secret password stored at code creation time
    // to get a real session for this user.
    const signInRes = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": serviceRoleKey,
      },
      body: JSON.stringify({
        email: user.email,
        password: codeRow.secret_password,
      }),
    });

    if (!signInRes.ok) {
      return new Response(
        JSON.stringify({ error: "Impossible de se connecter" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const session = await signInRes.json();

    return new Response(
      JSON.stringify({
        access_token: session.access_token,
        refresh_token: session.refresh_token,
        expires_in: session.expires_in,
        expires_at: session.expires_at,
        user: {
          id: user.id,
          email: user.email,
        },
        profile: {
          id: profile.id,
          full_name: profile.full_name,
          role: profile.role,
        },
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch {
    return new Response(
      JSON.stringify({ error: "Erreur serveur" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
