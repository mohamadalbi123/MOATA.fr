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

    const recommendation = await getAiRecommendation(assistant, answers);
    await saveLead(assistantId, answers, recommendation);

    response.status(200).json({ recommendation });
  } catch (error) {
    response.status(500).json({
      error: "Could not create recommendation",
      message: error.message
    });
  }
}

async function getAssistant(id) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) throw new Error("Supabase environment variables are missing");

  const url = `${supabaseUrl}/rest/v1/assistants?id=eq.${encodeURIComponent(id)}&select=*`;
  const response = await fetch(url, {
    headers: {
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${supabaseAnonKey}`
    }
  });
  if (!response.ok) throw new Error("Could not read assistant setup");
  const rows = await response.json();
  return rows[0] || null;
}

async function saveLead(assistantId, answers, recommendation) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) return;

  await fetch(`${supabaseUrl}/rest/v1/customer_leads`, {
    method: "POST",
    headers: {
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${supabaseAnonKey}`,
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
            "Your job is to guide customers toward the correct service or product using only the business information provided.",
            "Never invent services, prices, guarantees, medical/legal/financial conclusions, or unavailable offers.",
            "Respect industry risk. For medical, dental, legal, veterinary, electrical, plumbing, construction, or other safety-sensitive areas, do not diagnose or give dangerous instructions. Recommend the appropriate appointment/service type and tell the customer to contact the professional for urgent or uncertain cases.",
            "If the customer needs urgent help, says there is danger, severe pain, emergency damage, or health/safety risk, recommend contacting the business/emergency service directly.",
            "Return concise customer-facing text with: recommended service, why it fits, what to do next."
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
              city: assistant.city,
              location: assistant.location,
              bookingUrl: assistant.booking_url
            },
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
