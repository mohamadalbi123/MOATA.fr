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
    saveAssistant(assistant);
    downloadJson({
      filename: `${assistant.id}-assistant-setup.json`,
      payload: assistant
    });
    requestNote.textContent = "Assistant setup saved. Opening your dashboard...";
    window.location.href = `dashboard.html?id=${encodeURIComponent(assistant.id)}`;
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
      saveAssistant(pendingAssistant);
      localStorage.removeItem("moataPendingAssistant");
      window.location.href = `dashboard.html?id=${encodeURIComponent(pendingAssistant.id)}`;
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
  renderDashboard();
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
      customerFreeText: data.customerFreeText || "",
      services: data.offers || "",
      rules: data.rules || ""
    }
  };
}

function saveAssistant(assistant) {
  const assistants = getAssistants().filter((item) => item.id !== assistant.id);
  assistants.unshift(assistant);
  localStorage.setItem("moataAssistants", JSON.stringify(assistants));
}

function getAssistants() {
  try {
    return JSON.parse(localStorage.getItem("moataAssistants") || "[]");
  } catch {
    return [];
  }
}

function getSelectedAssistant() {
  const params = new URLSearchParams(window.location.search);
  const id = params.get("id");
  const assistants = getAssistants();
  return assistants.find((assistant) => assistant.id === id) || assistants[0] || null;
}

function renderDashboard() {
  const assistant = getSelectedAssistant();
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
          <div><dt>Photo upload</dt><dd>${escapeHtml(assistant.setup.photoUpload || "-")}</dd></div>
          <div><dt>Launch style</dt><dd>${escapeHtml(assistant.setup.launchStyle || "-")}</dd></div>
          <div><dt>Questions</dt><dd>${escapeHtml(assistant.setup.questionCards || "-")}</dd></div>
        </dl>
      </article>
      <article class="dashboard-panel">
        <h2>Next production step</h2>
        <p>In the real SaaS version this area will show checkout, billing status, customer leads, and the live AI assistant status.</p>
      </article>
    </section>
  `;
  bindCopyButtons();
}

function renderAssistantPreview() {
  const assistant = getSelectedAssistant();
  const fallback = {
    id: "demo",
    business: { name: "MOATA Demo", bookingUrl: "" },
    setup: {
      industry: "Service Business",
      assistantAppearance: "Female White Outfit",
      questionCards: "Main concern, Budget, Upload Photo",
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

  assistantPreviewRoot.innerHTML = `
    <section class="assistant-shell">
      <div class="assistant-panel">
        <img class="assistant-photo" src="${avatar}" alt="" />
        <p class="eyebrow">${escapeHtml(data.setup.industry)}</p>
        <h1>${escapeHtml(data.business.name)} Assistant</h1>
        <p>Answer a few questions so the business can understand your need before booking.</p>
      </div>
      <form class="assistant-diagnostic">
        ${questions.map((question, index) => `
          <label>${escapeHtml(question)}
            <input ${index === 0 ? "required" : ""} placeholder="Your answer" />
          </label>
        `).join("")}
        <button class="button" type="button" id="assistantRecommend">Show Recommendation</button>
      </form>
      <section class="assistant-result" id="assistantResult" hidden>
        <p class="eyebrow">Preview recommendation</p>
        <h2>${escapeHtml(recommendation)}</h2>
        <p>This prototype recommendation is based on the first service in the submitted setup. In production, OpenAI will match the customer answers against all business services and rules.</p>
        ${data.business.bookingUrl ? `<a class="button" href="${escapeHtml(data.business.bookingUrl)}">Continue to Booking</a>` : ""}
      </section>
    </section>
  `;
  document.getElementById("assistantRecommend")?.addEventListener("click", () => {
    document.getElementById("assistantResult").hidden = false;
  });
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
