export default async function handler(request, response) {
  if (request.method !== "POST") {
    response.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
    const { email = "", interval = "monthly", assistantId = "" } = request.body || {};
    const billingInterval = interval === "yearly" ? "yearly" : "monthly";
    const stripePriceId = billingInterval === "yearly" ? process.env.STRIPE_YEARLY_PRICE_ID : process.env.STRIPE_PRICE_ID;
    if (!stripeSecretKey || !stripePriceId) {
      response.status(500).json({ error: "Stripe environment variables are missing" });
      return;
    }

    const origin = request.headers.origin || `https://${request.headers.host}`;
    const body = new URLSearchParams({
      mode: "subscription",
      "line_items[0][price]": stripePriceId,
      "line_items[0][quantity]": "1",
      success_url: `${origin}/dashboard.html?id=${encodeURIComponent(assistantId)}&view=billing&payment=success`,
      cancel_url: `${origin}/dashboard.html?id=${encodeURIComponent(assistantId)}&view=billing&payment=cancelled`,
      allow_promotion_codes: "true",
      client_reference_id: assistantId,
      "metadata[assistant_id]": assistantId,
      "metadata[billing_interval]": billingInterval,
      "subscription_data[metadata][assistant_id]": assistantId,
      "subscription_data[metadata][billing_interval]": billingInterval
    });

    if (email) body.append("customer_email", email);

    const stripeResponse = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${stripeSecretKey}`,
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body
    });

    const session = await stripeResponse.json();
    if (!stripeResponse.ok) {
      response.status(stripeResponse.status).json({ error: session.error?.message || "Stripe checkout failed" });
      return;
    }

    response.status(200).json({ url: session.url });
  } catch (error) {
    response.status(500).json({ error: error.message });
  }
}
