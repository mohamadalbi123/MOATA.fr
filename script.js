const form = document.getElementById("intakeForm");
const note = document.getElementById("formNote");
const requestForm = document.getElementById("requestForm");
const requestNote = document.getElementById("requestNote");
const requestEmail = "mobalbi123@gmail.com";
const storySteps = document.querySelectorAll(".story-step");
const processStepCards = document.querySelectorAll(".process-steps .step-card");
const industryInputs = document.querySelectorAll("input[name='industry']");
const specialtyPanel = document.getElementById("specialtyPanel");
const specialtyOptions = document.getElementById("specialtyOptions");
const specialtyTitle = document.getElementById("specialtyTitle");
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
const googleAuthButton = document.getElementById("googleAuthButton");
const brandColorPicker = document.querySelector("input[name='brandColorPicker']");
const customBrandColor = document.querySelector("input[name='customBrandColor']");
const rulesField = document.getElementById("rulesField");
const headerActions = document.querySelector(".header-actions");
const pricingPlanButtons = document.querySelectorAll("[data-pricing-plan]");
let rulesWereAutoFilled = false;

updateAuthHeader();
guardBuilderForExistingAssistant();

if (storySteps.length) {
  let activeStoryStep = 0;
  setInterval(() => {
    storySteps[activeStoryStep].classList.remove("active");
    activeStoryStep = (activeStoryStep + 1) % storySteps.length;
    storySteps[activeStoryStep].classList.add("active");
  }, 3600);
}

if (processStepCards.length) {
  let activeProcessStep = 0;
  processStepCards[activeProcessStep].classList.add("active");
  setInterval(() => {
    processStepCards[activeProcessStep].classList.remove("active");
    activeProcessStep = (activeProcessStep + 1) % processStepCards.length;
    processStepCards[activeProcessStep].classList.add("active");
    processStepCards[activeProcessStep].scrollIntoView({ behavior: "smooth", block: "center" });
  }, 2600);
}

if (pricingPlanButtons.length) {
  pricingPlanButtons.forEach((button) => {
    button.addEventListener("click", () => setPricingPlan(button.dataset.pricingPlan || "monthly"));
  });
  setPricingPlan("monthly");
}

if (industryInputs.length && questionCards.length) {
  industryInputs.forEach((input) => {
    input.addEventListener("change", () => {
      updateQuestionCards(input.value);
      updateSpecialtyOptions(input.value);
      updateAvoidanceSuggestion(input.value);
    });
  });
  updateQuestionCards("");
  updateSpecialtyOptions("");
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

if (brandColorPicker && customBrandColor) {
  brandColorPicker.addEventListener("input", () => {
    customBrandColor.value = brandColorPicker.value;
  });
  customBrandColor.addEventListener("input", () => {
    if (isHexColor(customBrandColor.value)) {
      brandColorPicker.value = customBrandColor.value;
    }
  });
}

if (rulesField) {
  rulesField.addEventListener("input", () => {
    rulesWereAutoFilled = false;
  });
}

if (requestForm) {
  hydrateBuilderForEdit();
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

if (googleAuthButton) {
  googleAuthButton.addEventListener("click", async () => {
    const result = await signInWithGoogle();
    if (!result.ok) {
      authNote.textContent = result.message;
    }
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
    const cleanValue = value instanceof File ? value.name : value;
    if (data[key]) {
      data[key] = `${data[key]}, ${cleanValue}`;
    } else {
      data[key] = cleanValue;
    }
  }
  return data;
}

async function getCurrentUser() {
  const supabase = await getSupabaseClient();
  if (supabase) {
    const { data: sessionData } = await supabase.auth.getSession();
    if (sessionData?.session?.user) {
      cacheCurrentUser(sessionData.session.user);
      return sessionData.session.user;
    }
    const { data } = await supabase.auth.getUser();
    if (data?.user) {
      cacheCurrentUser(data.user);
      return data.user;
    }
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
  const pendingAssistant = getPendingAssistant();
  if (pendingAssistant) {
    const savedAssistant = await saveAssistant(pendingAssistant);
    localStorage.removeItem("moataPendingAssistant");
    window.location.href = `dashboard.html?id=${encodeURIComponent(savedAssistant.id)}`;
    return;
  }
  await renderDashboard();
}

async function signInWithGoogle() {
  const supabase = await getSupabaseClient();
  if (!supabase) {
    return {
      ok: false,
      message: "Google login is available on the live MOATA site."
    };
  }

  const redirectTo = getAuthRedirectUrl();
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo
    }
  });
  if (error) return { ok: false, message: error.message };
  return { ok: true };
}

function getAuthRedirectUrl() {
  const isLocalFile = window.location.protocol === "file:";
  const isLocalHost = ["localhost", "127.0.0.1"].includes(window.location.hostname);
  if (isLocalFile || isLocalHost) return "https://www.moata.fr/dashboard.html";
  return new URL("dashboard.html", window.location.href).href;
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
    cacheCurrentUser(authData.session.user);
    return { ok: true };
  }

  const { data: authData, error } = await supabase.auth.signInWithPassword({
    email: data.email,
    password: data.password
  });
  if (error) return { ok: false, message: error.message };
  cacheCurrentUser(authData.user);
  return { ok: true };
}

function cacheCurrentUser(user) {
  if (!user) return;
  localStorage.setItem("moataUser", JSON.stringify({
    id: user.id,
    email: user.email,
    user_metadata: user.user_metadata || {},
    app_metadata: user.app_metadata || {}
  }));
}

async function getSupabaseClient() {
  if (window.moataSupabaseClient !== undefined) return window.moataSupabaseClient;
  try {
    const configUrl = window.location.protocol === "file:" ? "https://www.moata.fr/api/config" : "/api/config";
    const response = await fetch(configUrl);
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

async function updateAuthHeader() {
  if (!headerActions) return;
  const currentUser = await getCurrentUser();
  if (!currentUser) return;
  const dashboardLink = dashboardRoot ? "" : `<a class="text-link" href="dashboard.html">Dashboard</a>`;
  headerActions.innerHTML = `
    ${dashboardLink}
    <button class="button button-light header-logout" type="button">Logout</button>
  `;
  headerActions.querySelector(".header-logout")?.addEventListener("click", signOutUser);
}

async function signOutUser() {
  const supabase = await getSupabaseClient();
  if (supabase) await supabase.auth.signOut();
  localStorage.removeItem("moataUser");
  window.location.href = "index.html";
}

async function guardBuilderForExistingAssistant() {
  if (!requestForm) return;
  const currentUser = await getCurrentUser();
  if (!currentUser) return;
  const assistants = await getAssistants();
  if (!assistants.length || !requestNote) return;
  requestNote.textContent = "You already have one MOATA assistant. Submitting this form will update your existing assistant setup.";
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

const specialtyLibrary = {
  "Beauty Salon / Skincare": [
    "Facials and skincare",
    "Advanced skin treatments",
    "Hair removal",
    "Brows and lashes",
    "Nails",
    "Massage and body care",
    "Makeup",
    "Full beauty salon"
  ],
  "Hair Salon": ["Women hair", "Color and balayage", "Hair repair", "Curly hair", "Extensions", "Scalp care", "Full hair salon"],
  "Barber Shop": ["Men haircut", "Beard grooming", "Fade specialist", "Shaving", "Men color", "Full barber shop"],
  "Dental Clinic": ["General dentistry", "Emergency dental", "Cosmetic dentistry", "Implant dentistry", "Orthodontics", "Endodontics", "Periodontics", "Pediatric dentistry", "Oral surgery"],
  "Medical Clinic": [
    "General practitioner / Family medicine",
    "Internal medicine",
    "Pediatrics",
    "Dermatology",
    "Cardiology",
    "Endocrinology / Diabetes",
    "Gastroenterology",
    "Neurology",
    "Psychiatry",
    "Obstetrics and gynecology",
    "Ophthalmology",
    "Orthopedics",
    "ENT / Otolaryngology",
    "Pulmonology",
    "Rheumatology",
    "Urology",
    "Pain medicine",
    "Sports medicine",
    "Urgent care",
    "Other medical specialty"
  ],
  Physiotherapist: ["General physiotherapy", "Sports rehab", "Post-surgery rehab", "Back and neck pain", "Manual therapy", "Massage therapy", "Dry needling"],
  Construction: ["Renovation", "Painting", "Kitchen", "Bathroom", "Flooring", "Roofing", "Masonry", "Landscaping", "Full construction company"],
  Electrician: ["Residential electrical", "Commercial electrical", "Emergency electrical", "Lighting installation", "Panel and wiring", "Inspection and diagnostic"],
  Plumber: ["Residential plumbing", "Commercial plumbing", "Emergency plumbing", "Leak repair", "Drain and blockage", "Water heater", "Bathroom plumbing"],
  "Cleaning Company": ["Home cleaning", "Office cleaning", "Deep cleaning", "Move-in / move-out", "Airbnb cleaning", "Post-construction cleaning"],
  "Auto Repair": ["Mechanical repair", "Vehicle diagnostic", "Brakes and tires", "Oil and maintenance", "Body repair", "EV / hybrid"],
  Veterinary: ["General veterinary", "Emergency veterinary", "Vaccination", "Surgery consultation", "Dental care", "Dermatology", "Nutrition"],
  "Real Estate": ["Residential sales", "Residential rental", "Commercial real estate", "Property management", "Buyer agent", "Seller agent"],
  Lawyer: ["Family law", "Immigration law", "Employment law", "Business law", "Criminal law", "Real estate law", "Personal injury", "Tax law", "Intellectual property"],
  Accountant: ["Tax return", "Bookkeeping", "Payroll", "VAT", "Business setup", "Company accounting", "Financial reporting"],
  "Personal Trainer": ["Weight loss", "Muscle gain", "Strength training", "Posture and mobility", "Online coaching", "Sports performance"]
};

function updateSpecialtyOptions(industry) {
  if (!specialtyPanel || !specialtyOptions || !specialtyTitle) return;
  const options = specialtyLibrary[industry] || [];
  specialtyOptions.innerHTML = "";
  if (!options.length) {
    specialtyPanel.hidden = true;
    return;
  }
  specialtyTitle.textContent = `Choose a more specific ${industry.toLowerCase()} type`;
  options.forEach((option, index) => {
    const label = document.createElement("label");
    label.className = "option-card option-card-compact";
    label.innerHTML = `<input type="radio" name="industrySpecialty" value="${escapeHtml(option)}" ${index === 0 ? "checked" : ""} /><span>${escapeHtml(option)}</span>`;
    specialtyOptions.appendChild(label);
  });
  specialtyPanel.hidden = false;
}

function createAssistantRecord(data) {
  const id = slugify(data.businessName || `assistant-${Date.now()}`) || `assistant-${Date.now()}`;
  const selectedIndustry = data.industrySpecialty ? `${data.industry || "Other"} - ${data.industrySpecialty}` : data.industry || "Other";
  const phone = formatPhoneNumber(data.phoneCountryCode, data.phone);
  return {
    id,
    publicToken: createPublicToken(),
    status: "Setup received",
    createdAt: new Date().toISOString(),
    business: {
      name: data.businessName || "My Business",
      website: data.currentWebsite || "",
      phone,
      whatsapp: data.phoneIsWhatsapp === "Yes" ? phone : "",
      city: data.city || "",
      location: data.location || "",
      bookingUrl: data.bookingUrl || ""
    },
    setup: {
      projectType: data.projectType || "AI Diagnostic Assistant",
      industry: selectedIndustry,
      assistantAppearance: data.assistantAppearance || "Female White Outfit",
      questionCards: data.questionCards || "",
      photoUpload: data.photoUpload || "",
      launchStyle: data.launchStyle || "",
      brandColor: getSelectedBrandColor(data),
      assistantLanguage: data.assistantLanguage || "English",
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
    const { data: existingRows } = await supabase
      .from("assistants")
      .select("id")
      .eq("user_id", currentUser.id)
      .order("created_at", { ascending: false })
      .limit(1);
    const existingId = existingRows?.[0]?.id || null;
    if (existingId) assistant.id = existingId;
    assistant.publicToken = createPublicToken();
    let insertRow = toAssistantRow(assistant, currentUser.id);
    let query = existingId
      ? supabase.from("assistants").update(insertRow).eq("id", existingId)
      : supabase.from("assistants").insert(insertRow);
    let { data, error } = await query.select().single();
    if (error && (error.message?.includes("brand_color") || error.message?.includes("assistant_language"))) {
      delete insertRow.brand_color;
      delete insertRow.assistant_language;
      const retryQuery = existingId
        ? supabase.from("assistants").update(insertRow).eq("id", existingId)
        : supabase.from("assistants").insert(insertRow);
      const retry = await retryQuery.select().single();
      data = retry.data;
      error = retry.error;
    }
    if (error && error.message?.includes("public_token")) {
      delete insertRow.public_token;
      const retryQuery = existingId
        ? supabase.from("assistants").update(insertRow).eq("id", existingId)
        : supabase.from("assistants").insert(insertRow);
      const retry = await retryQuery.select().single();
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
  const existing = getLocalAssistants()[0];
  const assistantToSave = existing ? { ...assistant, id: existing.id, publicToken: createPublicToken() } : assistant;
  localStorage.setItem("moataAssistants", JSON.stringify([assistantToSave]));
}

async function getAssistants() {
  const supabase = await getSupabaseClient();
  const currentUser = await getCurrentUser();
  if (supabase && currentUser) {
    const { data, error } = await supabase
      .from("assistants")
      .select("*")
      .eq("user_id", currentUser.id)
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
    public_token: assistant.publicToken || createPublicToken(),
    brand_color: assistant.setup.brandColor,
    assistant_language: assistant.setup.assistantLanguage,
    customer_free_text: assistant.setup.customerFreeText,
    services: assistant.setup.services,
    rules: assistant.setup.rules,
    status: assistant.status || "Setup received"
  };
}

function fromAssistantRow(row) {
  return {
    id: row.id,
    publicToken: row.public_token || row.id,
    status: row.status || "Setup received",
    subscriptionStatus: row.subscription_status || "inactive",
    subscriptionCurrentPeriodEnd: row.subscription_current_period_end || "",
    billingInterval: row.billing_interval || "",
    stripeCustomerId: row.stripe_customer_id || "",
    stripeSubscriptionId: row.stripe_subscription_id || "",
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
      assistantLanguage: row.assistant_language || "English",
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
  let query = supabase
    .from("assistants")
    .select("*")
    .or(`public_token.eq.${id},and(public_token.is.null,id.eq.${id})`)
    .single();
  let { data, error } = await query;
  if (error?.message?.includes("public_token")) {
    const fallback = await supabase
      .from("assistants")
      .select("*")
      .eq("id", id)
      .single();
    data = fallback.data;
    error = fallback.error;
  }
  if (error || !data) return null;
  return fromAssistantRow(data);
}

async function renderDashboard() {
  const assistant = await getSelectedAssistant();
  const currentUser = await getCurrentUser();
  const userName = getUserDisplayName(currentUser);
  const userEmail = currentUser?.email || "No email available";
  if (!assistant) {
    dashboardRoot.innerHTML = `
      <section class="dashboard-empty">
        <p class="eyebrow">Dashboard</p>
        <h1>Welcome${userName ? `, ${escapeHtml(userName)}` : ""}.</h1>
        <p>Your account is ready. Start by building your first AI diagnostic assistant. After setup, your dashboard will show the public link, embed code, billing, and assistant details.</p>
        <a class="button" href="request.html">Build My Assistant</a>
      </section>
    `;
    return;
  }

  const deliveryToken = assistant.publicToken || assistant.id;
  const publicLink = new URL(`assistant.html?id=${encodeURIComponent(deliveryToken)}`, window.location.href).href;
  const embedCode = `<script src="https://www.moata.fr/widget.js" data-assistant="${deliveryToken}"></script>`;
  const view = new URLSearchParams(window.location.search).get("view") || "dashboard";
  const sectionMap = {
    dashboard: renderDashboardHome,
    account: renderDashboardAccount,
    assistant: renderDashboardAssistant,
    billing: renderDashboardBilling
  };
  const activeSection = sectionMap[view] || renderDashboardHome;
  const dashboardContext = { assistant, currentUser, userName, userEmail, publicLink, embedCode };

  dashboardRoot.innerHTML = `
    <section class="dashboard-hero dashboard-hero-compact">
      <div>
        <p class="eyebrow">Client Portal</p>
        <h1>${escapeHtml(getDashboardTitle(view, userName || assistant.business.name))}</h1>
        <p>${escapeHtml(getDashboardDescription(view))}</p>
      </div>
    </section>
    ${renderDashboardNav(view, assistant.id)}
    ${activeSection(dashboardContext)}
  `;
  bindCopyButtons();
  bindCheckoutButton(currentUser);
  bindBillingPortalButton();
  bindAccountActions(currentUser);
  bindBillingSwitcher();
}

function renderDashboardNav(activeView, assistantId) {
  const navItems = [
    ["assistant", "My Assistant"],
    ["billing", "Billing"],
    ["account", "Account Settings"]
  ];
  return `
    <nav class="dashboard-tabs" aria-label="Dashboard sections">
      ${navItems.map(([view, label]) => {
        const href = getDashboardUrl(view, assistantId);
        return `<a class="${view === activeView ? "active" : ""}" href="${href}">${label}</a>`;
      }).join("")}
    </nav>
  `;
}

function renderDashboardHome({ assistant, userName, userEmail }) {
  return `
    <section class="dashboard-overview-grid">
      ${renderDashboardCard("Account Settings", userName || "MOATA Client", userEmail, getDashboardUrl("account", assistant.id))}
      ${renderDashboardCard("Billing", "€39 / month", "Subscription, checkout, and plan details.", getDashboardUrl("billing", assistant.id))}
      ${renderDashboardCard("My Assistant", assistant.business.name, "Edit setup, test the assistant, copy link, and copy embed code.", getDashboardUrl("assistant", assistant.id))}
    </section>
  `;
}

function renderDashboardCard(label, title, description, href) {
  return `
    <a class="dashboard-action-card" href="${href}">
      <span class="eyebrow">${escapeHtml(label)}</span>
      <strong>${escapeHtml(title)}</strong>
      <small>${escapeHtml(description)}</small>
    </a>
  `;
}

function renderDashboardAccount({ currentUser, userName, userEmail }) {
  const provider = currentUser?.app_metadata?.provider || "email";
  const loginMethod = provider === "google" ? "Google" : "Email and password";
  return `
    <section class="account-settings-grid">
      <article class="dashboard-panel account-profile-card">
        <p class="eyebrow">Profile</p>
        <div class="account-avatar">${escapeHtml((userName || userEmail || "M").slice(0, 1).toUpperCase())}</div>
        <h2>${escapeHtml(userName || "MOATA Client")}</h2>
        <p>${escapeHtml(userEmail)}</p>
      </article>
      <article class="dashboard-panel account-security-card">
        <p class="eyebrow">Sign-in</p>
        <h2>Login details</h2>
        <dl class="dashboard-details">
          <div><dt>Account email</dt><dd>${escapeHtml(userEmail)}</dd></div>
          <div><dt>Login method</dt><dd>${escapeHtml(loginMethod)}</dd></div>
          <div><dt>Password</dt><dd>Send a reset link to your email if you want to change your password.</dd></div>
        </dl>
        <div class="compact-actions">
          <button class="button" id="passwordResetButton" type="button">Send Reset Link</button>
          <a class="button button-light" href="${getDashboardUrl("dashboard")}">Back to Dashboard</a>
        </div>
        <p class="form-note" id="accountNote" aria-live="polite"></p>
      </article>
    </section>
  `;
}

function renderDashboardAssistant({ assistant, publicLink, embedCode }) {
  const canAccessDelivery = isAssistantActive(assistant);
  return `
    <section class="dashboard-single">
      <article class="dashboard-panel">
        <div class="dashboard-assistant-top">
          <img class="dashboard-avatar" src="${getAvatarPath(assistant.setup.assistantAppearance)}" alt="" />
          <div>
            <p class="eyebrow">My Assistant</p>
            <h2>${escapeHtml(assistant.business.name)}</h2>
            <p>${escapeHtml(assistant.setup.industry)} · ${escapeHtml(assistant.setup.assistantLanguage || "English")} · ${escapeHtml(assistant.status)}</p>
          </div>
        </div>
        <dl class="dashboard-details dashboard-details-grid">
          <div><dt>Avatar</dt><dd>${escapeHtml(assistant.setup.assistantAppearance || "-")}</dd></div>
          <div><dt>Brand color</dt><dd><span class="color-dot" style="--dot: ${sanitizeColor(assistant.setup.brandColor || "#050505")}"></span>${escapeHtml(assistant.setup.brandColor || "#050505")}</dd></div>
          <div><dt>Photo upload</dt><dd>${escapeHtml(assistant.setup.photoUpload || "-")}</dd></div>
          <div><dt>Launch style</dt><dd>${escapeHtml(assistant.setup.launchStyle || "-")}</dd></div>
          <div><dt>Questions</dt><dd>${escapeHtml(assistant.setup.questionCards || "-")}</dd></div>
          <div><dt>Services</dt><dd>${escapeHtml(assistant.setup.services || "-")}</dd></div>
          <div><dt>Rules to avoid</dt><dd>${escapeHtml(assistant.setup.rules || "-")}</dd></div>
        </dl>
        ${canAccessDelivery ? `
          <div class="dashboard-code-row">
            <div>
              <strong>Public link</strong>
              <p>Send this link directly to customers or use it as a QR code.</p>
            </div>
            <button class="button button-light copy-button" data-copy="${escapeHtml(publicLink)}" type="button">Copy Link</button>
          </div>
          <code class="dashboard-code">${escapeHtml(publicLink)}</code>
          <div class="dashboard-code-row">
            <div>
              <strong>Embed code</strong>
              <p>Paste this on the business website to open the diagnostic.</p>
            </div>
            <button class="button button-light copy-button" data-copy="${escapeHtml(embedCode)}" type="button">Copy Code</button>
          </div>
          <code class="dashboard-code">${escapeHtml(embedCode)}</code>
        ` : `
          <div class="dashboard-locked-delivery">
            <strong>Activate your assistant</strong>
            <p>Your setup is saved. Complete checkout to publish the live diagnostic link and website embed code.</p>
            <a class="button" href="${getDashboardUrl("billing", assistant.id)}">Go to Billing</a>
          </div>
        `}
        <div class="compact-actions">
          <a class="button button-light" href="request.html?edit=${encodeURIComponent(assistant.id)}">Edit Assistant Setup</a>
        </div>
      </article>
    </section>
  `;
}

function isAssistantActive(assistant) {
  const paidStatus = String(assistant.subscriptionStatus || assistant.status || "").toLowerCase();
  const periodEnd = assistant.subscriptionCurrentPeriodEnd ? new Date(assistant.subscriptionCurrentPeriodEnd) : null;
  const periodIsCurrent = !periodEnd || periodEnd.getTime() > Date.now();
  return ["active", "paid", "live", "trialing"].includes(paidStatus) && periodIsCurrent;
}

function renderDashboardBilling({ assistant }) {
  const isActive = isAssistantActive(assistant);
  const nextBillingDate = formatBillingDate(assistant.subscriptionCurrentPeriodEnd);
  const statusLabel = assistant.subscriptionStatus || assistant.status || "inactive";
  const planLabel = assistant.billingInterval === "yearly" ? "Yearly" : assistant.billingInterval === "monthly" ? "Monthly" : "Not selected";
  return `
    <section class="dashboard-single">
      <article class="dashboard-panel dashboard-billing-card">
        <p class="eyebrow">Billing</p>
        <h2>${isActive ? "Subscription active" : "Activate billing"}</h2>
        <p>${isActive ? "Manage the subscription, payment method, invoices, and cancellation securely through Stripe." : "Activate your assistant monthly or yearly. The assistant stops working automatically when the paid period ends."}</p>
        <dl class="billing-summary">
          <div><dt>Status</dt><dd><span class="status-pill ${isActive ? "active" : ""}">${escapeHtml(statusLabel)}</span></dd></div>
          <div><dt>Plan</dt><dd>${escapeHtml(planLabel)}</dd></div>
          <div><dt>Next billing date</dt><dd>${escapeHtml(nextBillingDate)}</dd></div>
          <div><dt>Payment method</dt><dd>Managed securely in Stripe. Card number and CVC are never stored in MOATA.</dd></div>
        </dl>
        ${isActive ? `
          <div class="compact-actions">
            <button class="button" id="billingPortalButton" type="button" data-assistant-id="${escapeHtml(assistant.id)}">Manage Billing</button>
            <a class="button button-light" href="${getDashboardUrl("dashboard")}">Back to Dashboard</a>
          </div>
          <p class="form-note">Use Manage Billing to update card details, view invoices, change payment method, or cancel the subscription.</p>
        ` : `
          <div class="billing-switcher" role="group" aria-label="Billing period">
            <label><input type="radio" name="billingInterval" value="monthly" checked /> <span>Monthly</span></label>
            <label><input type="radio" name="billingInterval" value="yearly" /> <span>Yearly</span></label>
          </div>
          <p class="billing-price" id="billingPrice">€39 <span>/ month</span></p>
          <p class="form-note" id="billingPlanNote">Pay monthly. Cancel before the next billing period.</p>
          <div class="compact-actions">
            <button class="button" id="checkoutButton" type="button" data-assistant-id="${escapeHtml(assistant.id)}">Continue to Checkout</button>
            <a class="button button-light" href="${getDashboardUrl("dashboard")}">Back to Dashboard</a>
          </div>
        `}
        <p class="form-note" id="checkoutNote" aria-live="polite"></p>
      </article>
    </section>
  `;
}

function getDashboardUrl(view, assistantId = new URLSearchParams(window.location.search).get("id")) {
  const params = new URLSearchParams();
  if (assistantId) params.set("id", assistantId);
  if (view && view !== "dashboard") params.set("view", view);
  const query = params.toString();
  return query ? `dashboard.html?${query}` : "dashboard.html";
}

function getDashboardTitle(view, fallbackName) {
  const titles = {
    dashboard: "Dashboard",
    account: "Account Settings",
    assistant: "My Assistant",
    billing: "Billing"
  };
  return titles[view] || "Dashboard";
}

function getDashboardDescription(view) {
  const descriptions = {
    dashboard: "Choose what you want to manage.",
    account: "Manage your profile, email, login method, and password reset.",
    assistant: "Review your assistant setup, test it, copy the public link, and copy the website embed code.",
    billing: "Manage the MOATA subscription plan and secure checkout."
  };
  return descriptions[view] || "Choose what you want to manage from your MOATA client portal.";
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
      assistantLanguage: "English",
      services: "Initial Consultation\nRecommended Service\nFollow-up Appointment",
      rules: "If unsure, ask the customer to contact the business."
    }
  };
  const data = assistant || fallback;
  if (assistant && !isAssistantActive(data)) {
    assistantPreviewRoot.innerHTML = `
      <section class="assistant-shell">
        <div class="assistant-page-header">
          <p class="eyebrow">Assistant unavailable</p>
          <h1>This diagnostic assistant is not active right now.</h1>
          <p>The business subscription is inactive or the paid period has ended. Please contact the business directly.</p>
        </div>
      </section>
    `;
    return;
  }
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
  const whatsappLink = getWhatsAppLink(data.business.whatsapp, data.business.name);

  assistantPreviewRoot.innerHTML = `
    <section class="assistant-shell" style="--assistant-accent: ${brandColor}">
      <header class="assistant-page-header">
        <p class="eyebrow">${escapeHtml(data.setup.industry)}</p>
        <h1>${escapeHtml(data.business.name)} Assistant</h1>
        <p>${escapeHtml(getAssistantIntro(data.setup.assistantLanguage))}</p>
      </header>
      <form class="assistant-diagnostic" id="assistantDiagnosticForm">
        <div class="assistant-form-header">
          <span>Private diagnostic</span>
          <strong>Answer the questions below.</strong>
        </div>
        <div class="assistant-question-list">
          ${questions.map((question, index) => renderQuestionControl(question, index === 0, index + 1)).join("")}
          ${data.setup.customerFreeText === "Yes" ? `<div class="assistant-question-card"><span class="assistant-question-number">${String(questions.length + 1).padStart(2, "0")}</span><label>Tell us more<textarea name="Additional comments" placeholder="Describe your need in your own words"></textarea></label></div>` : ""}
        </div>
        <button class="button" type="submit" id="assistantRecommend">${escapeHtml(getRecommendationButtonText(data.setup.assistantLanguage))}</button>
      </form>
      <section class="assistant-result" id="assistantResult" hidden>
        <p class="eyebrow">Recommendation</p>
        <h2 id="assistantRecommendationTitle">${escapeHtml(recommendation)}</h2>
        <p id="assistantRecommendationText">MOATA is preparing the recommendation using the business services and your answers.</p>
        <div class="compact-actions">
          ${data.business.bookingUrl ? `<a class="button" href="${escapeHtml(data.business.bookingUrl)}">Continue to Booking</a>` : ""}
          ${whatsappLink ? `<a class="button button-light" href="${escapeHtml(whatsappLink)}">Chat on WhatsApp</a>` : ""}
        </div>
      </section>
      <button class="assistant-floating-avatar" id="assistantRestart" type="button" aria-label="Restart diagnostic">
        <img src="${avatar}" alt="" />
        <span>Restart</span>
      </button>
    </section>
  `;
  const diagnosticForm = document.getElementById("assistantDiagnosticForm");
  document.getElementById("assistantRestart")?.addEventListener("click", () => {
    diagnosticForm?.reset();
    const result = document.getElementById("assistantResult");
    if (result) result.hidden = true;
    diagnosticForm?.scrollIntoView({ behavior: "smooth", block: "start" });
  });
  diagnosticForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const result = document.getElementById("assistantResult");
    const text = document.getElementById("assistantRecommendationText");
    result.hidden = false;
    text.textContent = getLoadingText(data.setup.assistantLanguage);
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
      if (payload.warning) {
        text.textContent += `\n\nNote: ${payload.warning}`;
      }
    } catch (error) {
      text.textContent = `We could not create an AI recommendation right now. Please contact the business or try again. (${error.message})`;
    }
  });
}

function renderQuestionControl(question, required = false, number = 1) {
  const name = escapeHtml(question);
  const requiredAttr = required ? "required" : "";
  const normalized = question.toLowerCase();
  const label = escapeHtml(question);
  const fieldNumber = String(number).padStart(2, "0");
  const wrap = (control) => `
    <div class="assistant-question-card">
      <span class="assistant-question-number">${fieldNumber}</span>
      ${control}
    </div>
  `;

  if (normalized === "gender") {
    return wrap(selectControl(label, name, requiredAttr, ["", "Female", "Male", "Non-binary", "Prefer not to say"]));
  }
  if (normalized === "preferred contact method" || normalized === "contact method") {
    return wrap(selectControl(label, name, requiredAttr, ["", "Email", "Phone", "WhatsApp", "SMS"]));
  }
  if (normalized === "skin type") {
    return wrap(selectControl(label, name, requiredAttr, ["", "Normal", "Dry", "Oily", "Combination", "Sensitive", "Not sure"]));
  }
  if (normalized === "goal" || normalized.includes("what result do you want") || normalized.includes("what do you want to achieve")) {
    return wrap(selectControl(label, name, requiredAttr, ["", "Fix a problem", "Improve appearance", "Maintenance", "Emergency help", "Get advice", "Not sure"]));
  }
  if (normalized === "main concern" || normalized.includes("biggest skin concern") || normalized.includes("what is bothering you")) {
    return wrap(selectControl(label, name, requiredAttr, ["", "Pain or discomfort", "Damage", "Appearance", "Sensitive reaction", "New problem", "Maintenance", "Not sure"]));
  }
  if (normalized.includes("how long") || normalized.includes("when did it start") || normalized.includes("when did symptoms begin")) {
    return wrap(selectControl(label, name, requiredAttr, ["", "Today", "A few days", "1-2 weeks", "More than 1 month", "More than 6 months", "Not sure"]));
  }
  if (normalized === "hair length") {
    return wrap(selectControl(label, name, requiredAttr, ["", "Short", "Medium", "Long", "Very long", "Not sure"]));
  }
  if (normalized === "hair thickness") {
    return wrap(selectControl(label, name, requiredAttr, ["", "Fine", "Medium", "Thick", "Not sure"]));
  }
  if (normalized.includes("hair type")) {
    return wrap(selectControl(label, name, requiredAttr, ["", "Straight", "Wavy", "Curly", "Coily", "Not sure"]));
  }
  if (normalized.includes("property type")) {
    return wrap(selectControl(label, name, requiredAttr, ["", "House", "Apartment", "Office", "Commercial space", "Other"]));
  }
  if (normalized.includes("house or apartment")) {
    return wrap(selectControl(label, name, requiredAttr, ["", "House", "Apartment", "Other"]));
  }
  if (normalized.includes("pain level")) {
    return wrap(selectControl(label, name, requiredAttr, ["", "0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10"]));
  }
  if (isYesNoQuestion(normalized)) {
    return wrap(selectControl(label, name, requiredAttr, ["", "Yes", "No", "Not sure"]));
  }
  if (normalized.includes("urgency") || normalized.includes("urgent")) {
    return wrap(selectControl(label, name, requiredAttr, ["", "Low", "Medium", "High", "Emergency"]));
  }
  if (normalized === "age" || normalized.includes("bedrooms") || normalized.includes("employees") || normalized.includes("height") || normalized.includes("weight") || normalized.includes("mileage") || normalized.includes("year")) {
    return wrap(`<label>${label}<input type="number" name="${name}" ${requiredAttr} min="0" placeholder="Enter number" /></label>`);
  }
  if (normalized === "budget" || normalized.includes("annual revenue")) {
    return wrap(`<label>${label}<input type="number" name="${name}" ${requiredAttr} min="0" placeholder="Enter amount" /></label>`);
  }
  if (normalized.includes("preferred date") || normalized.includes("event date") || normalized.includes("deadline") || normalized.includes("court date")) {
    return wrap(`<label>${label}<input type="date" name="${name}" ${requiredAttr} /></label>`);
  }
  if (normalized.includes("preferred time")) {
    return wrap(`<label>${label}<input type="time" name="${name}" ${requiredAttr} /></label>`);
  }
  if (normalized.includes("upload photo") || normalized.includes("inspiration photo")) {
    return wrap(`<label>${label}<input type="file" name="${name}" ${requiredAttr} accept="image/*" /></label>`);
  }
  if (normalized.includes("upload video")) {
    return "";
  }
  if (normalized.includes("upload document") || normalized.includes("documents")) {
    return wrap(`<label>${label}<input type="file" name="${name}" ${requiredAttr} /></label>`);
  }

  return wrap(`<label>${label}<input name="${name}" ${requiredAttr} placeholder="Your answer" /></label>`);
}

function isYesNoQuestion(normalized) {
  const yesNoSignals = [
    "do you have",
    "are you",
    "have you",
    "is your",
    "upload",
    "sensitive",
    "allerg",
    "pregnant",
    "breastfeeding",
    "dyed",
    "bleached",
    "damaged",
    "fever",
    "swelling",
    "bleeding",
    "broken",
    "sensitivity",
    "injury",
    "surgery",
    "pets",
    "vaccinated",
    "financing approved",
    "vat registered"
  ];
  return yesNoSignals.some((signal) => normalized.includes(signal)) && !normalized.includes("upload photo") && !normalized.includes("upload video") && !normalized.includes("upload document");
}

function selectControl(label, name, requiredAttr, options) {
  return `
    <label>${label}
      <select name="${name}" ${requiredAttr}>
        ${options.map((option) => `<option value="${escapeHtml(option)}">${option ? escapeHtml(option) : "Select one"}</option>`).join("")}
      </select>
    </label>
  `;
}

function sanitizeColor(color = "#050505") {
  return /^#[0-9a-fA-F]{6}$/.test(color) ? color : "#050505";
}

function getSelectedBrandColor(data) {
  if (isHexColor(data.customBrandColor)) return data.customBrandColor;
  if (isHexColor(data.brandColorPicker)) return data.brandColorPicker;
  if (isHexColor(data.brandColor)) return data.brandColor;
  return "#050505";
}

function isHexColor(color = "") {
  return /^#[0-9a-fA-F]{6}$/.test(String(color).trim());
}

function getAssistantIntro(language = "English") {
  const copy = {
    French: "Répondez à quelques questions afin que l'entreprise comprenne votre besoin avant la réservation.",
    Arabic: "أجب عن بعض الأسئلة حتى تتمكن الشركة من فهم احتياجك قبل الحجز.",
    Spanish: "Responde algunas preguntas para que el negocio entienda su necesidad antes de reservar.",
    German: "Beantworten Sie einige Fragen, damit das Unternehmen Ihren Bedarf vor der Buchung versteht.",
    Italian: "Rispondi ad alcune domande così l'attività può capire la tua esigenza prima della prenotazione.",
    Portuguese: "Responda a algumas perguntas para que a empresa entenda sua necessidade antes da reserva.",
    Dutch: "Beantwoord een paar vragen zodat het bedrijf uw behoefte begrijpt voordat u boekt."
  };
  return copy[language] || "Answer a few questions so the business can understand your need before booking.";
}

function getRecommendationButtonText(language = "English") {
  const copy = {
    French: "Afficher la recommandation",
    Arabic: "اعرض التوصية",
    Spanish: "Mostrar recomendación",
    German: "Empfehlung anzeigen",
    Italian: "Mostra raccomandazione",
    Portuguese: "Mostrar recomendação",
    Dutch: "Toon aanbeveling"
  };
  return copy[language] || "Show Recommendation";
}

function getLoadingText(language = "English") {
  const copy = {
    French: "Création de la recommandation...",
    Arabic: "يتم إنشاء التوصية...",
    Spanish: "Creando recomendación...",
    German: "Empfehlung wird erstellt...",
    Italian: "Creazione della raccomandazione...",
    Portuguese: "Criando recomendação...",
    Dutch: "Aanbeveling maken..."
  };
  return copy[language] || "Creating recommendation...";
}

function formatPhoneNumber(countryCode = "", number = "") {
  const cleanNumber = String(number || "").trim();
  if (!cleanNumber) return "";
  if (cleanNumber.startsWith("+")) return cleanNumber;
  return `${countryCode} ${cleanNumber}`.trim();
}

function getWhatsAppLink(phone = "", businessName = "the business") {
  const digits = String(phone || "").replace(/[^\d]/g, "");
  if (!digits) return "";
  const message = encodeURIComponent(`Hello ${businessName}, I completed the diagnostic and would like help choosing the right service.`);
  return `https://wa.me/${digits}?text=${message}`;
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

function setPricingPlan(plan) {
  const isYearly = plan === "yearly";
  document.querySelectorAll("[data-pricing-plan]").forEach((button) => {
    button.classList.toggle("active", button.dataset.pricingPlan === plan);
  });
  const label = document.getElementById("pricingPlanLabel");
  const amount = document.getElementById("pricingAmount");
  const period = document.getElementById("pricingPeriod");
  const note = document.getElementById("pricingSaveNote");
  if (label) label.textContent = isYearly ? "Yearly" : "Monthly";
  if (amount) amount.textContent = isYearly ? "€390" : "€39";
  if (period) period.textContent = isYearly ? "/ year" : "/ month";
  if (note) note.textContent = isYearly ? "Paid yearly. Equivalent to €32.50/month." : "Pay monthly. Cancel before the next billing period.";
}

function bindCheckoutButton(currentUser) {
  document.getElementById("checkoutButton")?.addEventListener("click", async (event) => {
    const note = document.getElementById("checkoutNote");
    note.textContent = "Opening secure checkout...";
    const interval = document.querySelector("input[name='billingInterval']:checked")?.value || "monthly";
    const assistantId = event.currentTarget.dataset.assistantId || "";
    try {
      const response = await fetch("/api/create-checkout-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: currentUser?.email || "", interval, assistantId })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Checkout failed");
      window.location.href = payload.url;
    } catch (error) {
      note.textContent = "Checkout is not ready yet. Check Stripe keys and price ID in Vercel.";
    }
  });
}

function bindBillingPortalButton() {
  document.getElementById("billingPortalButton")?.addEventListener("click", async (event) => {
    const note = document.getElementById("checkoutNote");
    note.textContent = "Opening secure billing portal...";
    try {
      const supabase = await getSupabaseClient();
      const { data: sessionData } = supabase ? await supabase.auth.getSession() : { data: null };
      const accessToken = sessionData?.session?.access_token || "";
      const response = await fetch("/api/create-billing-portal-session", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {})
        },
        body: JSON.stringify({ assistantId: event.currentTarget.dataset.assistantId || "" })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Billing portal failed");
      window.location.href = payload.url;
    } catch (error) {
      note.textContent = "Billing portal is not ready yet. Check the Stripe customer and customer portal settings.";
    }
  });
}

function bindBillingSwitcher() {
  const billingInputs = document.querySelectorAll("input[name='billingInterval']");
  if (!billingInputs.length) return;
  const price = document.getElementById("billingPrice");
  const note = document.getElementById("billingPlanNote");
  const updateBillingCopy = () => {
    const interval = document.querySelector("input[name='billingInterval']:checked")?.value || "monthly";
    if (price) price.innerHTML = interval === "yearly" ? "€390 <span>/ year</span>" : "€39 <span>/ month</span>";
    if (note) note.textContent = interval === "yearly" ? "Paid yearly. Equivalent to €32.50/month." : "Pay monthly. Cancel before the next billing period.";
  };
  billingInputs.forEach((input) => input.addEventListener("change", updateBillingCopy));
  updateBillingCopy();
}

function bindAccountActions(currentUser) {
  document.getElementById("passwordResetButton")?.addEventListener("click", async () => {
    const note = document.getElementById("accountNote");
    const email = currentUser?.email || "";
    if (!email) {
      note.textContent = "No email address is available for this account.";
      return;
    }
    const supabase = await getSupabaseClient();
    if (!supabase) {
      note.textContent = "Password reset is available on the live MOATA site.";
      return;
    }
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: new URL("login.html", window.location.href).href
    });
    note.textContent = error ? error.message : "Password reset email sent.";
  });
}

async function hydrateBuilderForEdit() {
  const editId = new URLSearchParams(window.location.search).get("edit");
  if (!editId) return;
  const assistants = await getAssistants();
  const assistant = assistants.find((item) => item.id === editId) || assistants[0];
  if (!assistant) return;
  fillBuilderForm(assistant);
  if (requestNote) requestNote.textContent = "Editing your saved assistant. Saving will update this assistant and refresh the public link/code after checkout.";
}

function fillBuilderForm(assistant) {
  setFieldValue("businessName", assistant.business.name);
  setFieldValue("currentWebsite", assistant.business.website);
  setPhoneField(assistant.business.phone);
  setCheckboxValue("phoneIsWhatsapp", Boolean(assistant.business.whatsapp && assistant.business.whatsapp === assistant.business.phone));
  setFieldValue("city", assistant.business.city);
  setFieldValue("location", assistant.business.location);
  setFieldValue("bookingUrl", assistant.business.bookingUrl);
  const [baseIndustry, specialty] = splitStoredIndustry(assistant.setup.industry);
  setRadioValue("industry", baseIndustry);
  updateQuestionCards(baseIndustry);
  updateSpecialtyOptions(baseIndustry);
  updateAvoidanceSuggestion(baseIndustry);
  if (specialty) setRadioValue("industrySpecialty", specialty);
  setRadioValue("assistantAppearance", assistant.setup.assistantAppearance);
  setCheckboxGroup("questionCards", assistant.setup.questionCards);
  setRadioValue("photoUpload", assistant.setup.photoUpload);
  setRadioValue("launchStyle", assistant.setup.launchStyle);
  setRadioValue("assistantLanguage", assistant.setup.assistantLanguage);
  setRadioValue("customerFreeText", assistant.setup.customerFreeText);
  setFieldValue("customBrandColor", assistant.setup.brandColor);
  if (brandColorPicker && isHexColor(assistant.setup.brandColor)) brandColorPicker.value = assistant.setup.brandColor;
  setFieldValue("offers", assistant.setup.services);
  setFieldValue("rules", assistant.setup.rules);
  rulesWereAutoFilled = false;
}

function splitStoredIndustry(industry = "") {
  const [base, ...rest] = String(industry).split(" - ");
  return [base || "Other", rest.join(" - ")];
}

function setFieldValue(name, value = "") {
  const field = requestForm?.querySelector(`[name="${CSS.escape(name)}"]`);
  if (field) field.value = value || "";
}

function setPhoneField(phone = "") {
  const match = String(phone).match(/^(\+\d+)\s*(.*)$/);
  if (match) {
    setFieldValue("phoneCountryCode", match[1]);
    setFieldValue("phone", match[2]);
  } else {
    setFieldValue("phone", phone);
  }
}

function setRadioValue(name, value = "") {
  const input = requestForm?.querySelector(`input[name="${CSS.escape(name)}"][value="${CSS.escape(value)}"]`);
  if (input) input.checked = true;
}

function setCheckboxValue(name, checked) {
  const input = requestForm?.querySelector(`input[name="${CSS.escape(name)}"]`);
  if (input) input.checked = checked;
}

function setCheckboxGroup(name, values = "") {
  const selected = String(values)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  requestForm?.querySelectorAll(`input[name="${CSS.escape(name)}"]`).forEach((input) => {
    input.checked = selected.includes(input.value);
  });
}

function updateAvoidanceSuggestion(industry = "") {
  if (!rulesField) return;
  const suggestion = getDefaultAvoidRules(industry);
  if (!suggestion) return;
  if (!rulesField.value.trim() || rulesWereAutoFilled) {
    rulesField.value = suggestion;
    rulesWereAutoFilled = true;
  }
}

function getDefaultAvoidRules(industry = "") {
  const normalized = industry.toLowerCase();
  if (normalized.includes("medical") || normalized.includes("dental") || normalized.includes("veterinary")) {
    return "Avoid diagnosing, prescribing, naming diseases, promising treatment results, or replacing a qualified professional. Recommend appointment/service type only, and ask urgent cases to contact the clinic directly or emergency services.";
  }
  if (normalized.includes("lawyer")) {
    return "Avoid giving legal conclusions, guaranteeing outcomes, drafting legal advice, or replacing a qualified lawyer. Recommend consultation type only and ask urgent deadlines to contact the office directly.";
  }
  if (normalized.includes("accountant")) {
    return "Avoid giving final tax, accounting, or financial advice. Recommend the right service type only and ask customers to confirm details with the accountant.";
  }
  if (normalized.includes("electrician") || normalized.includes("plumber") || normalized.includes("construction") || normalized.includes("auto")) {
    return "Avoid giving dangerous repair instructions, safety guarantees, or final quotes without inspection. Recommend the right service visit and ask urgent safety risks to contact the business directly.";
  }
  if (normalized.includes("beauty") || normalized.includes("hair") || normalized.includes("barber") || normalized.includes("trainer") || normalized.includes("physio")) {
    return "Avoid promising results, giving medical claims, or recommending services not listed by the business. If unsure, ask the customer to book a consultation.";
  }
  return "Avoid recommending services not listed by the business, promising results, or answering outside the business offer. If unsure, ask the customer to contact the business.";
}

function formatBillingDate(value = "") {
  if (!value) return "Not available yet";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not available yet";
  return new Intl.DateTimeFormat("en", { year: "numeric", month: "long", day: "numeric" }).format(date);
}

function getUserDisplayName(user) {
  return user?.user_metadata?.name || user?.user_metadata?.full_name || user?.email?.split("@")[0] || "";
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
    wizardNext.textContent = "Next";
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

function createPublicToken() {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID();
  return `moata-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
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
