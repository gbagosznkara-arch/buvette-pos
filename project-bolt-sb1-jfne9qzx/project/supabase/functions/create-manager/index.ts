import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

function randomCode(): string {
  // 6-digit numeric code
  return String(Math.floor(100000 + Math.random() * 900000));
}

function randomPassword(): string {
  // Strong random password — the manager never sees this
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";
  let pwd = "";
  const bytes = new Uint8Array(20);
  crypto.getRandomValues(bytes);
  for (let i = 0; i < 20; i++) {
    pwd += chars[bytes[i] % chars.length];
  }
  return pwd;
}

interface CreateBody {
  full_name?: string;
  phone?: string;
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
    const body: CreateBody = await req.json();
    const fullName = (body.full_name || "").trim();
    const phone = (body.phone || "").trim();

    if (!fullName) {
      return new Response(
        JSON.stringify({ error: "Le nom est requis" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = req.headers.get("Authorization")?.replace("Bearer ", "") || "";

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Verify the caller is an owner
    const callerClient = createClient(supabaseUrl, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: caller } = await callerClient.auth.getUser();
    if (!caller.user) {
      return new Response(
        JSON.stringify({ error: "Non autorisé" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const { data: callerProfile } = await adminClient
      .from("profiles")
      .select("role")
      .eq("id", caller.user.id)
      .maybeSingle();

    if (!callerProfile || callerProfile.role !== "owner") {
      return new Response(
        JSON.stringify({ error: "Réservé au propriétaire" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Generate a unique email for this manager (they log in with code, not email)
    const email = `manager_${Date.now()}@buvette.local`;
    const password = randomPassword();

    // Create the auth user with email confirmed
    const { data: userData, error: createError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName, phone },
    });

    if (createError || !userData.user) {
      return new Response(
        JSON.stringify({ error: createError?.message || "Erreur création" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // The trigger creates a profile as 'manager' (since an owner already exists).
    // Force the role to manager just in case.
    await adminClient
      .from("profiles")
      .update({ role: "manager", full_name: fullName, phone })
      .eq("id", userData.user.id);

    // Generate a unique code
    let code = randomCode();
    let attempts = 0;
    while (attempts < 10) {
      const { data: existing } = await adminClient
        .from("manager_codes")
        .select("id")
        .eq("code", code)
        .maybeSingle();
      if (!existing) break;
      code = randomCode();
      attempts++;
    }

    // Insert the code with the secret password
    const { error: codeError } = await adminClient
      .from("manager_codes")
      .insert({
        code,
        profile_id: userData.user.id,
        secret_password: password,
        active: true,
      });

    if (codeError) {
      return new Response(
        JSON.stringify({ error: "Erreur création du code" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        code,
        full_name: fullName,
        phone,
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
