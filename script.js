const form = document.getElementById("intakeForm");
const note = document.getElementById("formNote");
const requestForm = document.getElementById("requestForm");
const requestNote = document.getElementById("requestNote");
const requestEmail = "mobalbi123@gmail.com";
const storySteps = document.querySelectorAll(".story-step");
const industryInputs = document.querySelectorAll("input[name='industry']");
const questionCards = document.querySelectorAll(".question-card");
const serviceExamples = document.querySelectorAll(".service-examples article");
const wizardSteps = document.querySelectorAll(".wizard-step");
const wizardProgress = document.querySelectorAll(".wizard-progress span");
const wizardBack = document.getElementById("wizardBack");
const wizardNext = document.getElementById("wizardNext");
const formActions = document.querySelector("#requestForm .form-actions");
const dashboardRoot = document.getElementById("dashboardRoot");
const assistantPreviewRoot = document.getElementById("assistantPreviewRoot");
const authForm = document.getElementById("authForm");
const authNote = document.getElementById("authNote");

if (storySteps.length) {
  let activeStoryStep = 0;
  setInterval(() => {
    storySteps[activeStoryStep].classList.remove("active");
    activeStoryStep = (activeStoryStep + 1) % storySteps.length;
    storySteps[activeStoryStep].classList.add("active");
  }, 3600);
}

if (industryInputs.length && questionCards.length) {
  industryInputs.forEach((input) => {
    input.addEventListener("change", () => updateQuestionCards(input.value));
  });
  updateQuestionCards("");
}

if (wizardSteps.length) {
  let currentWizardStep = 0;
  showWizardStep(currentWizardStep);

  wizardBack?.addEventListener("click", () => {
    currentWizardStep = Math.max(0, currentWizardStep - 1);
    showWizardStep(currentWizardStep);
  });

  wizardNext?.addEventListener("click", () => {
    if (!validateWizardStep(wizardSteps[currentWizardStep])) return;
    currentWizardStep = Math.min(wizardSteps.length - 1, currentWizardStep + 1);
    showWizardStep(currentWizardStep);
  });
}

if (form) {
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const data = collectFormData(form);
    downloadJson({
      filename: `${slugify(data.businessName || "moata-client")}-brief.json`,
      payload: {
        createdAt: new Date().toISOString(),
        project: "MOATA assistant intake",
        ...data
      }
    });
    note.textContent = "Assistant brief downloaded. Send this file back to MOATA with any images, logo, or documents.";
  });
}

if (requestForm) {
  requestForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = collectFormData(requestForm);
    const assistant = createAssistantRecord(data);
    if (!(await getCurrentUser())) {
      localStorage.setItem("moataPendingAssistant", JSON.stringify(assistant));
      requestNote.textContent = "Create a free account to save your assistant and open your dashboard.";
      window.location.href = "signup.html?next=finish";
      return;
    }
    const savedAssistant = await saveAssistant(assistant);
    downloadJson({
      filename: `${savedAssistant.id}-assistant-setup.json`,
      payload: savedAssistant
    });
    requestNote.textContent = "Assistant setup saved. Opening your dashboard...";
    window.location.href = `dashboard.html?id=${encodeURIComponent(savedAssistant.id)}`;
  });
}

if (authForm) {
  authForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = collectFormData(authForm);
    const authResult = await authenticateUser(data, authForm.dataset.authMode || "login");
    if (!authResult.ok) {
      authNote.textContent = authResult.message;
      return;
    }
    const pendingAssistant = getPendingAssistant();
    if (pendingAssistant) {
      const savedAssistant = await saveAssistant(pendingAssistant);
      localStorage.removeItem("moataPendingAssistant");
      window.location.href = `dashboard.html?id=${encodeURIComponent(savedAssistant.id)}`;
      return;
    }
    window.location.href = "dashboard.html";
  });
}

if (dashboardRoot) {
  protectDashboard();
}

if (assistantPreviewRoot) {
  renderAssistantPreview();
}

function collectFormData(targetForm) {
  const data = {};
  const formData = new FormData(targetForm);
  for (const [key, value] of formData.entries()) {
    if (data[key]) {
      data[key] = `${data[key]}, ${value}`;
    } else {
      data[key] = value;
    }
  }
  return data;
}

async function getCurrentUser() {
  const supabase = await getSupabaseClient();
  if (supabase) {
    const { data } = await supabase.auth.getUser();
    return data.user || null;
  }
  try {
    return JSON.parse(localStorage.getItem("moataUser") || "null");
  } catch (error) {
    return null;
  }
}

function getPendingAssistant() {
  try {
    return JSON.parse(localStorage.getItem("moataPendingAssistant") || "null");
  } catch (error) {
    return null;
  }
}

async function protectDashboard() {
  if (!(await getCurrentUser())) {
    window.location.href = "login.html?next=dashboard";
    return;
  }
  await renderDashboard();
}

async function authenticateUser(data, mode) {
  const supabase = await getSupabaseClient();
  if (!supabase) {
    localStorage.setItem("moataUser", JSON.stringify({
      email: data.email,
      name: data.name || data.email,
      createdAt: new Date().toISOString()
    }));
    return { ok: true };
  }

  if (mode === "signup") {
    const { data: authData, error } = await supabase.auth.signUp({
      email: data.email,
      password: data.password,
      options: {
        data: {
          name: data.name || ""
        }
      }
    });
    if (error) return { ok: false, message: error.message };
    if (!authData.session) {
      return { ok: false, message: "Account created. Check your email to confirm it, then login to continue." };
    }
    return { ok: true };
  }

  const { error } = await supabase.auth.signInWithPassword({
    email: data.email,
    password: data.password
  });
  if (error) return { ok: false, message: error.message };
  return { ok: true };
}

async function getSupabaseClient() {
  if (window.moataSupabaseClient !== undefined) return window.moataSupabaseClient;
  try {
    const response = await fetch("/api/config");
    if (!response.ok) throw new Error("Config unavailable");
    const config = await response.json();
    if (!config.supabaseUrl || !config.supabaseAnonKey) {
      window.moataSupabaseClient = null;
      return null;
    }
    await loadScript("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.min.js");
    window.moataSupabaseClient = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);
    return window.moataSupabaseClient;
  } catch (error) {
    window.moataSupabaseClient = null;
    return null;
  }
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const existingScript = document.querySelector(`script[src="${src}"]`);
    if (existingScript) {
      resolve();
      return;
    }
    const script = document.createElement("script");
    script.src = src;
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

function updateQuestionCards(industry) {
  questionCards.forEach((card) => {
    const industries = card.dataset.industries || "";
    const industryList = industries
      .split("|")
      .map((item) => item.trim())
      .filter(Boolean);
    const shouldShow = card.classList.contains("universal") || !industry || industry === "Other" || industryList.includes(industry) || industries === industry;
    card.classList.toggle("is-hidden", !shouldShow);
    if (!shouldShow) {
      const input = card.querySelector("input");
      if (input) input.checked = false;
    }
  });
  serviceExamples.forEach((example) => {
    example.classList.toggle("is-visible", example.dataset.industry === industry);
  });
}

function createAssistantRecord(data) {
  const id = slugify(data.businessName || `assistant-${Date.now()}`) || `assistant-${Date.now()}`;
  return {
    id,
    status: "Setup received",
    createdAt: new Date().toISOString(),
    business: {
      name: data.businessName || "My Business",
      website: data.currentWebsite || "",
      phone: data.phone || "",
      whatsapp: data.whatsapp || "",
      city: data.city || "",
      location: data.location || "",
      bookingUrl: data.bookingUrl || ""
    },
    setup: {
      projectType: data.projectType || "AI Diagnostic Assistant",
      industry: data.industry || "Other",
      assistantAppearance: data.assistantAppearance || "Female White Outfit",
      questionCards: data.questionCards || "",
      photoUpload: data.photoUpload || "",
      launchStyle: data.launchStyle || "",
      brandColor: data.brandColor || "#050505",
      customerFreeText: data.customerFreeText || "",
      services: data.offers || "",
      rules: data.rules || ""
    }
  };
}

async function saveAssistant(assistant) {
  const supabase = await getSupabaseClient();
  const currentUser = await getCurrentUser();
  if (supabase && currentUser) {
    let insertRow = toAssistantRow(assistant, currentUser.id);
    let { data, error } = await supabase
      .from("assistants")
      .insert(insertRow)
      .select()
      .single();
    if (error && error.message?.includes("brand_color")) {
      delete insertRow.brand_color;
      const retry = await supabase
        .from("assistants")
        .insert(insertRow)
        .select()
        .single();
      data = retry.data;
      error = retry.error;
    }
    if (error) throw error;
    const savedAssistant = fromAssistantRow(data);
    saveAssistantLocal(savedAssistant);
    return savedAssistant;
  }
  saveAssistantLocal(assistant);
  return assistant;
}

function saveAssistantLocal(assistant) {
  const assistants = getLocalAssistants().filter((item) => item.id !== assistant.id);
  assistants.unshift(assistant);
  localStorage.setItem("moataAssistants", JSON.stringify(assistants));
}

async function getAssistants() {
  const supabase = await getSupabaseClient();
  const currentUser = await getCurrentUser();
  if (supabase && currentUser) {
    const { data, error } = await supabase
      .from("assistants")
      .select("*")
      .order("created_at", { ascending: false });
    if (!error && data) return data.map(fromAssistantRow);
  }
  return getLocalAssistants();
}

function getLocalAssistants() {
  try {
    return JSON.parse(localStorage.getItem("moataAssistants") || "[]");
  } catch {
    return [];
  }
}

function toAssistantRow(assistant, userId) {
  return {
    user_id: userId,
    business_name: assistant.business.name,
    business_website: assistant.business.website,
    phone: assistant.business.phone,
    whatsapp: assistant.business.whatsapp,
    city: assistant.business.city,
    location: assistant.business.location,
    booking_url: assistant.business.bookingUrl,
    industry: assistant.setup.industry,
    avatar: assistant.setup.assistantAppearance,
    question_cards: assistant.setup.questionCards,
    photo_upload: assistant.setup.photoUpload,
    launch_style: assistant.setup.launchStyle,
    brand_color: assistant.setup.brandColor,
    customer_free_text: assistant.setup.customerFreeText,
    services: assistant.setup.services,
    rules: assistant.setup.rules,
    status: assistant.status || "Setup received"
  };
}

function fromAssistantRow(row) {
  return {
    id: row.id,
    status: row.status || "Setup received",
    createdAt: row.created_at,
    business: {
      name: row.business_name || "My Business",
      website: row.business_website || "",
      phone: row.phone || "",
      whatsapp: row.whatsapp || "",
      city: row.city || "",
      location: row.location || "",
      bookingUrl: row.booking_url || ""
    },
    setup: {
      projectType: "AI Diagnostic Assistant",
      industry: row.industry || "Other",
      assistantAppearance: row.avatar || "Female White Outfit",
      questionCards: row.question_cards || "",
      photoUpload: row.photo_upload || "",
      launchStyle: row.launch_style || "",
      brandColor: row.brand_color || "#050505",
      customerFreeText: row.customer_free_text || "",
      services: row.services || "",
      rules: row.rules || ""
    }
  };
}

async function getSelectedAssistant() {
  const params = new URLSearchParams(window.location.search);
  const id = params.get("id");
  const publicAssistant = await getPublicAssistant(id);
  if (publicAssistant) return publicAssistant;
  const assistants = await getAssistants();
  return assistants.find((assistant) => assistant.id === id) || assistants[0] || null;
}

async function getPublicAssistant(id) {
  if (!assistantPreviewRoot || !id) return null;
  const supabase = await getSupabaseClient();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("assistants")
    .select("*")
    .eq("id", id)
    .single();
  if (error || !data) return null;
  return fromAssistantRow(data);
}

async function renderDashboard() {
  const assistant = await getSelectedAssistant();
  const currentUser = await getCurrentUser();
  if (!assistant) {
    dashboardRoot.innerHTML = `
      <section class="dashboard-empty">
        <p class="eyebrow">My AI Assistant</p>
        <h1>No assistant yet.</h1>
        <p>Start by building your first assistant. After setup, this dashboard will show your public link and embed code.</p>
        <a class="button" href="request.html">Build My Assistant</a>
      </section>
    `;
    return;
  }

  const publicLink = new URL(`assistant.html?id=${encodeURIComponent(assistant.id)}`, window.location.href).href;
  const embedCode = `<script src="https://moata.com/widget.js" data-assistant="${assistant.id}"></script>`;
  dashboardRoot.innerHTML = `
    <section class="dashboard-hero">
      <div>
        <p class="eyebrow">My AI Assistant</p>
        <h1>${escapeHtml(assistant.business.name)}</h1>
        <p>${escapeHtml(assistant.setup.industry)} assistant · ${escapeHtml(assistant.status)}</p>
      </div>
      <a class="button" href="request.html">Build Another</a>
    </section>
    <section class="dashboard-grid">
      <article class="dashboard-panel">
        <h2>Public diagnostic link</h2>
        <p>Use this if the business does not have a website. Send it by WhatsApp, Instagram, SMS, email, or QR code.</p>
        <textarea readonly>${publicLink}</textarea>
        <button class="button copy-button" data-copy="${escapeHtml(publicLink)}" type="button">Copy Link</button>
        <a class="button button-light" href="${publicLink}">Open Preview</a>
      </article>
      <article class="dashboard-panel">
        <h2>Website embed code</h2>
        <p>For WordPress, Wix, Shopify, Squarespace, or custom websites, this is the code the business will paste.</p>
        <textarea readonly>${escapeHtml(embedCode)}</textarea>
        <button class="button copy-button" data-copy="${escapeHtml(embedCode)}" type="button">Copy Code</button>
      </article>
      <article class="dashboard-panel">
        <h2>Assistant setup</h2>
        <dl>
          <div><dt>Avatar</dt><dd>${escapeHtml(assistant.setup.assistantAppearance)}</dd></div>
          <div><dt>Brand color</dt><dd><span class="color-dot" style="--dot: ${sanitizeColor(assistant.setup.brandColor || "#050505")}"></span>${escapeHtml(assistant.setup.brandColor || "#050505")}</dd></div>
          <div><dt>Photo upload</dt><dd>${escapeHtml(assistant.setup.photoUpload || "-")}</dd></div>
          <div><dt>Launch style</dt><dd>${escapeHtml(assistant.setup.launchStyle || "-")}</dd></div>
          <div><dt>Questions</dt><dd>${escapeHtml(assistant.setup.questionCards || "-")}</dd></div>
        </dl>
      </article>
      <article class="dashboard-panel">
        <h2>Activate subscription</h2>
        <p>Start the €39/month MOATA plan to use the live assistant, hosted diagnostic page, website embed code, and future updates.</p>
        <button class="button" id="checkoutButton" type="button">Continue to Checkout</button>
        <p class="form-note" id="checkoutNote" aria-live="polite"></p>
      </article>
    </section>
  `;
  bindCopyButtons();
  bindCheckoutButton(currentUser);
}

async function renderAssistantPreview() {
  const assistant = await getSelectedAssistant();
  const fallback = {
    id: "demo",
    business: { name: "MOATA Demo", bookingUrl: "" },
    setup: {
      industry: "Service Business",
      assistantAppearance: "Female White Outfit",
      questionCards: "Main concern, Budget, Upload Photo",
      brandColor: "#050505",
      services: "Initial Consultation\nRecommended Service\nFollow-up Appointment",
      rules: "If unsure, ask the customer to contact the business."
    }
  };
  const data = assistant || fallback;
  const questions = (data.setup.questionCards || "Main concern, Budget, Upload Photo")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 6);
  const services = (data.setup.services || "")
    .split(/\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
  const recommendation = services[0] || "The right service from this business";
  const avatar = getAvatarPath(data.setup.assistantAppearance);
  const brandColor = sanitizeColor(data.setup.brandColor || "#050505");

  assistantPreviewRoot.innerHTML = `
    <section class="assistant-shell" style="--assistant-accent: ${brandColor}">
      <div class="assistant-panel">
        <img class="assistant-photo" src="${avatar}" alt="" />
        <p class="eyebrow">${escapeHtml(data.setup.industry)}</p>
        <h1>${escapeHtml(data.business.name)} Assistant</h1>
        <p>Answer a few questions so the business can understand your need before booking.</p>
      </div>
      <form class="assistant-diagnostic" id="assistantDiagnosticForm">
        ${questions.map((question, index) => `
          <label>${escapeHtml(question)}
            <input name="${escapeHtml(question)}" ${index === 0 ? "required" : ""} placeholder="Your answer" />
          </label>
        `).join("")}
        ${data.setup.customerFreeText === "Yes" ? `<label>Tell us more<textarea name="Additional comments" placeholder="Describe your need in your own words"></textarea></label>` : ""}
        <button class="button" type="submit" id="assistantRecommend">Show Recommendation</button>
      </form>
      <section class="assistant-result" id="assistantResult" hidden>
        <p class="eyebrow">Recommendation</p>
        <h2 id="assistantRecommendationTitle">${escapeHtml(recommendation)}</h2>
        <p id="assistantRecommendationText">MOATA is preparing the recommendation using the business services and your answers.</p>
        ${data.business.bookingUrl ? `<a class="button" href="${escapeHtml(data.business.bookingUrl)}">Continue to Booking</a>` : ""}
      </section>
    </section>
  `;
  document.getElementById("assistantDiagnosticForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const result = document.getElementById("assistantResult");
    const text = document.getElementById("assistantRecommendationText");
    result.hidden = false;
    text.textContent = "Creating recommendation...";
    const answers = collectFormData(event.currentTarget);
    try {
      const response = await fetch("/api/recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assistantId: data.id, answers })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message || payload.error || "Recommendation failed");
      text.textContent = payload.recommendation;
    } catch (error) {
      text.textContent = "We could not create an AI recommendation right now. Please contact the business or try again.";
    }
  });
}

function sanitizeColor(color = "#050505") {
  return /^#[0-9a-fA-F]{6}$/.test(color) ? color : "#050505";
}

function getAvatarPath(appearance = "") {
  if (appearance.includes("Male") && appearance.includes("Casual")) return "assets/avatar-male-casual.png";
  if (appearance.includes("Male")) return "assets/avatar-male-white.png";
  if (appearance.includes("Casual")) return "assets/avatar-female-casual.png";
  return "assets/avatar-female-white.png";
}

function bindCopyButtons() {
  document.querySelectorAll(".copy-button").forEach((button) => {
    button.addEventListener("click", async () => {
      await navigator.clipboard.writeText(button.dataset.copy || "");
      button.textContent = "Copied";
    });
  });
}

function bindCheckoutButton(currentUser) {
  document.getElementById("checkoutButton")?.addEventListener("click", async () => {
    const note = document.getElementById("checkoutNote");
    note.textContent = "Opening secure checkout...";
    try {
      const response = await fetch("/api/create-checkout-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: currentUser?.email || "" })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Checkout failed");
      window.location.href = payload.url;
    } catch (error) {
      note.textContent = "Checkout is not ready yet. Check Stripe keys and price ID in Vercel.";
    }
  });
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function showWizardStep(index) {
  wizardSteps.forEach((step, stepIndex) => {
    step.classList.toggle("active", stepIndex === index);
  });

  const currentTitle = wizardSteps[index]?.dataset.stepTitle;
  wizardProgress.forEach((item) => {
    item.classList.toggle("active", item.textContent.trim() === currentTitle);
  });

  if (wizardBack) wizardBack.disabled = index === 0;
  if (wizardNext) {
    wizardNext.hidden = index === wizardSteps.length - 1;
  }
  if (formActions) {
    formActions.hidden = index !== wizardSteps.length - 1;
  }
}

function validateWizardStep(step) {
  const fields = [...step.querySelectorAll("input, select, textarea")];
  for (const field of fields) {
    if (!field.checkValidity()) {
      field.reportValidity();
      return false;
    }
  }
  return true;
}

function downloadJson({ filename, payload }) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json"
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function slugify(value) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function formatEmailBody(payload) {
  return Object.entries(payload)
    .map(([key, value]) => `${toLabel(key)}:\n${value || "-"}\n`)
    .join("\n");
}

function toLabel(value) {
  return value
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (letter) => letter.toUpperCase());
}
