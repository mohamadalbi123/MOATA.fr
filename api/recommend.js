const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
};

export default async function handler(request, response) {
  Object.entries(corsHeaders).forEach(([key, value]) => response.setHeader(key, value));

  if (request.method === "OPTIONS") {
    response.status(204).end();
    return;
  }

  if (request.method !== "POST") {
    response.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const { assistantId, answers = {} } = request.body || {};
    if (!assistantId) {
      response.status(400).json({ error: "Missing assistantId" });
      return;
    }

    const assistant = await getAssistant(assistantId);
    if (!assistant) {
      response.status(404).json({ error: "Assistant not found" });
      return;
    }
    if (!isAssistantActive(assistant)) {
      response.status(402).json({ error: "Assistant subscription is inactive" });
      return;
    }

    let warning = "";
    let recommendation;
    try {
      recommendation = await getAiRecommendation(assistant, answers);
    } catch (error) {
      warning = "The live AI model could not complete this request, so MOATA used a safe service-only fallback.";
      recommendation = getFallbackRecommendation(assistant, answers);
    }

    await saveLead(assistant.id || assistantId, answers, recommendation).catch(() => {});
    await notifyBusiness(assistant, answers, recommendation).catch(() => {});

    response.status(200).json({ recommendation, warning });
  } catch (error) {
    response.status(500).json({
      error: "Could not create recommendation",
      message: error.message
    });
  }
}

function isAssistantActive(assistant = {}) {
  const status = String(assistant.subscription_status || assistant.status || "").toLowerCase();
  const allowedStatus = ["active", "paid", "live", "trialing"].includes(status);
  const periodEnd = assistant.subscription_current_period_end ? new Date(assistant.subscription_current_period_end) : null;
  const periodIsCurrent = !periodEnd || periodEnd.getTime() > Date.now();
  return allowedStatus && periodIsCurrent;
}

async function getAssistant(id) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) throw new Error("Supabase environment variables are missing");

  const publicTokenQuery = `or=(public_token.eq.${encodeURIComponent(id)},and(public_token.is.null,id.eq.${encodeURIComponent(id)}))`;
  let response = await fetch(`${supabaseUrl}/rest/v1/assistants?${publicTokenQuery}&select=*`, {
    headers: {
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${supabaseAnonKey}`
    }
  });
  if (!response.ok) {
    response = await fetch(`${supabaseUrl}/rest/v1/assistants?id=eq.${encodeURIComponent(id)}&select=*`, {
      headers: {
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${supabaseAnonKey}`
      }
    });
  }
  if (!response.ok) throw new Error("Could not read assistant setup");
  const rows = await response.json();
  return rows[0] || null;
}

async function saveLead(assistantId, answers, recommendation) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) return;

  await fetch(`${supabaseUrl}/rest/v1/customer_leads`, {
    method: "POST",
    headers: {
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal"
    },
    body: JSON.stringify({
      assistant_id: assistantId,
      customer_name: answers.Name || answers.name || null,
      customer_email: answers.Email || answers.email || null,
      customer_phone: answers.Phone || answers.phone || null,
      answers,
      recommendation
    })
  });
}

async function notifyBusiness(assistant, answers, recommendation) {
  const resendKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.MOATA_EMAIL_FROM;
  const toEmail = assistant.notification_email || assistant.business_email;
  if (!resendKey || !fromEmail || !toEmail) return;
  const answerSummary = Object.entries(answers || {})
    .filter(([, value]) => String(value || "").trim())
    .map(([key, value]) => `${key}: ${value}`)
    .join("\n");

  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from: fromEmail,
      to: [toEmail],
      subject: `New MOATA diagnostic lead - ${assistant.business_name || "Assistant"}`,
      text: [
        `Business: ${assistant.business_name || ""}`,
        "",
        "Customer answers:",
        answerSummary || "No answers provided.",
        "",
        "Recommendation:",
        recommendation
      ].join("\n")
    })
  });
}

async function getAiRecommendation(assistant, answers) {
  const openAiKey = process.env.OPENAI_API_KEY;
  if (!openAiKey) throw new Error("OpenAI API key is missing");

  const input = [
    {
      role: "system",
      content: [
        {
          type: "input_text",
          text: [
            "You are the MOATA AI Diagnostic Assistant engine.",
            "MOATA builds AI diagnostic assistants for service businesses.",
            "You are not a general chatbot. You are a guided consultation system that turns structured customer answers into a service recommendation.",
            "Your job is to guide customers toward the correct service or product using only the business information provided.",
            "Create a useful consultation result, not generic marketing text. Interpret the customer's answers, identify the likely need, constraints, urgency, and fit, then match that to the business offer.",
            "First inspect allowedServices. Recommend exactly one primary service, and optionally one secondary service, from allowedServices only.",
            "If allowedServices is empty, unclear, or does not contain a safe match, do not invent. Tell the customer to contact the business so the team can confirm the right appointment.",
            "Use customerAnswers as structured data. Dropdown answers such as gender, skin type, urgency, contact method, pain level, budget, and uploaded file names are intentional signals.",
            "Never invent services, prices, guarantees, medical/legal/financial conclusions, or unavailable offers.",
            "Respect industry risk. For medical, dental, legal, veterinary, electrical, plumbing, construction, automotive, real estate, accounting, or other safety-sensitive areas, do not diagnose, give regulated advice, or provide dangerous step-by-step instructions. Recommend the appropriate appointment/service type and tell the customer to contact the professional for urgent or uncertain cases.",
            "For medical, dental, veterinary, legal, accounting, and financial use cases: recommend the right appointment category only. Do not name a disease, legal conclusion, tax conclusion, treatment plan, medication, dosage, or guaranteed outcome.",
            "For beauty, skincare, hair, and wellness, do not promise results and do not make medical claims. Explain the fit using the customer's concern, preferences, and selected answers.",
            "If the customer needs urgent help, says there is danger, severe pain, emergency damage, or health/safety risk, recommend contacting the business/emergency service directly.",
            "Use the business leadDestination for the Next step label when possible: Booking link, WhatsApp booking, Phone call, Directions, Email follow-up, or Business follow-up.",
            "If the chosen destination is unavailable because the business did not provide the needed phone, email, address, WhatsApp, or booking URL, tell the customer to contact the business directly.",
            "Answer in the assistantLanguage provided by the business.",
            "Never say 'as an AI'.",
            "Return concise customer-facing text with clear labels: Recommended service, Why this fits, Important note, Next step."
          ].join(" ")
        }
      ]
    },
    {
      role: "user",
      content: [
        {
          type: "input_text",
          text: JSON.stringify({
            business: {
              name: assistant.business_name,
              industry: assistant.industry,
              website: assistant.business_website,
              email: assistant.business_email,
              whatsapp: assistant.whatsapp,
              city: assistant.city,
              location: assistant.location,
              bookingUrl: assistant.booking_url,
              leadDestination: assistant.lead_destination || "Booking link"
            },
            assistantLanguage: assistant.assistant_language || "English",
            allowedServices: assistant.services,
            selectedQuestions: assistant.question_cards,
            businessRules: assistant.rules,
            customerAnswers: answers
          })
        }
      ]
    }
  ];

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${openAiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || "gpt-5",
      input,
      store: false
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText);
  }

  const data = await response.json();
  return data.output_text || "Please contact the business so they can recommend the right service.";
}

function getFallbackRecommendation(assistant, answers = {}) {
  const services = String(assistant.services || "")
    .split(/\n|,/)
    .map((service) => service.trim())
    .filter(Boolean);
  const primaryService = services[0] || "professional consultation";
  const businessName = assistant.business_name || "the business";
  const answerSummary = Object.entries(answers)
    .filter(([, value]) => String(value || "").trim())
    .slice(0, 4)
    .map(([key, value]) => `${key}: ${value}`)
    .join("; ");

  return [
    `Recommended service: ${primaryService}.`,
    `Why it fits: based on your answers${answerSummary ? ` (${answerSummary})` : ""}, this is the closest option from ${businessName}'s listed services.`,
    `Next step: ${getFallbackNextStep(assistant)}.`
  ].join("\n");
}

function getFallbackNextStep(assistant = {}) {
  const destination = assistant.lead_destination || "Booking link";
  if (destination === "WhatsApp booking" && assistant.whatsapp) return "send the business a WhatsApp message so the team can confirm your booking";
  if (destination === "Phone call" && assistant.phone) return "call the business so the team can confirm your appointment";
  if (destination === "Directions" && (assistant.location || assistant.city)) return "get directions and contact the business before visiting if needed";
  if (destination === "Email follow-up" && assistant.business_email) return "email the business so the team can follow up";
  if (destination === "Business follow-up") return "the business can use your submitted answers to follow up with you";
  if (assistant.booking_url) return "book an appointment using the booking link";
  return "contact the business so the team can confirm the final recommendation";
}
