export default async function handler(request, response) {
  if (request.method !== "POST") {
    response.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
    const { assistantId = "" } = request.body || {};
    if (!stripeSecretKey) {
      response.status(500).json({ error: "Stripe secret key is missing" });
      return;
    }
    if (!assistantId) {
      response.status(400).json({ error: "Assistant ID is required" });
      return;
    }

    const currentUser = await getCurrentUser(request);
    const assistant = await getAssistant(assistantId);
    if (!assistant || assistant.user_id !== currentUser.id) {
      response.status(403).json({ error: "You do not have access to this assistant" });
      return;
    }
    if (!assistant?.stripe_customer_id) {
      response.status(400).json({ error: "No Stripe customer found for this assistant" });
      return;
    }

    const origin = request.headers.origin || `https://${request.headers.host}`;
    const body = new URLSearchParams({
      customer: assistant.stripe_customer_id,
      return_url: `${origin}/dashboard.html?id=${encodeURIComponent(assistantId)}&view=billing`
    });

    const stripeResponse = await fetch("https://api.stripe.com/v1/billing_portal/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${stripeSecretKey}`,
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body
    });

    const session = await stripeResponse.json();
    if (!stripeResponse.ok) {
      response.status(stripeResponse.status).json({ error: session.error?.message || "Stripe billing portal failed" });
      return;
    }

    response.status(200).json({ url: session.url });
  } catch (error) {
    response.status(500).json({ error: error.message });
  }
}

async function getCurrentUser(request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const token = String(request.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!supabaseUrl || !serviceRoleKey) throw new Error("Supabase service role key is missing");
  if (!token) throw new Error("User session is required");

  const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${token}`
    }
  });
  if (!response.ok) throw new Error("Could not verify user session");
  return response.json();
}

async function getAssistant(assistantId) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) throw new Error("Supabase service role key is missing");

  const response = await fetch(`${supabaseUrl}/rest/v1/assistants?id=eq.${encodeURIComponent(assistantId)}&select=stripe_customer_id,user_id`, {
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`
    }
  });
  if (!response.ok) throw new Error("Could not read assistant billing details");
  const rows = await response.json();
  return rows[0] || null;
}
