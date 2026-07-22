import crypto from "crypto";

export const config = {
  api: {
    bodyParser: false
  }
};

export default async function handler(request, response) {
  if (request.method !== "POST") {
    response.status(405).json({ error: "Method not allowed" });
    return;
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  if (!webhookSecret || !stripeSecretKey) {
    response.status(500).json({ error: "Stripe webhook is not configured" });
    return;
  }

  const rawBody = await getRawBody(request);
  const signature = request.headers["stripe-signature"];
  if (!isValidStripeSignature(rawBody, signature, webhookSecret)) {
    response.status(400).json({ error: "Invalid Stripe signature" });
    return;
  }

  const event = JSON.parse(rawBody);

  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      const subscription = await getStripeSubscription(session.subscription, stripeSecretKey);
      await updateAssistantSubscription({
        assistantId: session.metadata?.assistant_id || session.client_reference_id,
        customerId: session.customer,
        subscriptionId: session.subscription,
        status: subscription.status,
        billingInterval: subscription.metadata?.billing_interval || session.metadata?.billing_interval || getSubscriptionInterval(subscription),
        currentPeriodEnd: subscription.current_period_end
      });
    }

    if (event.type === "customer.subscription.updated") {
      const subscription = event.data.object;
      await updateAssistantSubscription({
        assistantId: subscription.metadata?.assistant_id,
        customerId: subscription.customer,
        subscriptionId: subscription.id,
        status: subscription.status,
        billingInterval: subscription.metadata?.billing_interval || getSubscriptionInterval(subscription),
        currentPeriodEnd: subscription.current_period_end
      });
    }

    if (event.type === "invoice.paid") {
      const invoice = event.data.object;
      const subscription = await getStripeSubscription(invoice.subscription, stripeSecretKey);
      await updateAssistantSubscription({
        assistantId: subscription.metadata?.assistant_id,
        customerId: invoice.customer,
        subscriptionId: invoice.subscription,
        status: subscription.status,
        billingInterval: subscription.metadata?.billing_interval || getSubscriptionInterval(subscription),
        currentPeriodEnd: subscription.current_period_end
      });
    }

    if (event.type === "invoice.payment_failed" || event.type === "customer.subscription.deleted") {
      const object = event.data.object;
      const subscriptionId = object.subscription || object.id;
      await updateAssistantSubscription({
        assistantId: object.metadata?.assistant_id,
        customerId: object.customer,
        subscriptionId,
        status: event.type === "customer.subscription.deleted" ? "canceled" : "past_due",
        billingInterval: object.metadata?.billing_interval || "",
        currentPeriodEnd: object.current_period_end || null
      });
    }

    response.status(200).json({ received: true });
  } catch (error) {
    response.status(500).json({ error: error.message });
  }
}

async function getRawBody(request) {
  if (typeof request.text === "function") return request.text();
  const chunks = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
}

function isValidStripeSignature(rawBody, signatureHeader = "", secret) {
  const parts = Object.fromEntries(
    String(signatureHeader)
      .split(",")
      .map((part) => part.split("="))
      .filter(([key, value]) => key && value)
  );
  if (!parts.t || !parts.v1) return false;
  const payload = `${parts.t}.${rawBody}`;
  const expected = crypto.createHmac("sha256", secret).update(payload).digest("hex");
  if (expected.length !== parts.v1.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(parts.v1));
}

async function getStripeSubscription(subscriptionId, stripeSecretKey) {
  if (!subscriptionId) return {};
  const response = await fetch(`https://api.stripe.com/v1/subscriptions/${subscriptionId}`, {
    headers: {
      Authorization: `Bearer ${stripeSecretKey}`
    }
  });
  if (!response.ok) throw new Error("Could not read Stripe subscription");
  return response.json();
}

function getSubscriptionInterval(subscription = {}) {
  return subscription.items?.data?.[0]?.price?.recurring?.interval || "";
}

async function updateAssistantSubscription({ assistantId, customerId, subscriptionId, status, billingInterval, currentPeriodEnd }) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) throw new Error("Supabase service role key is missing");

  const activeStatuses = new Set(["active", "trialing"]);
  const assistantStatus = activeStatuses.has(status) ? "active" : status || "inactive";
  const body = {
    stripe_customer_id: customerId || null,
    stripe_subscription_id: subscriptionId || null,
    subscription_status: status || "inactive",
    billing_interval: billingInterval || null,
    subscription_current_period_end: currentPeriodEnd ? new Date(currentPeriodEnd * 1000).toISOString() : null,
    status: assistantStatus
  };

  let url;
  if (assistantId) {
    url = `${supabaseUrl}/rest/v1/assistants?id=eq.${encodeURIComponent(assistantId)}`;
  } else if (subscriptionId) {
    url = `${supabaseUrl}/rest/v1/assistants?stripe_subscription_id=eq.${encodeURIComponent(subscriptionId)}`;
  } else {
    return;
  }

  const response = await fetch(url, {
    method: "PATCH",
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal"
    },
    body: JSON.stringify(body)
  });
  if (!response.ok) throw new Error("Could not update assistant subscription");
}
