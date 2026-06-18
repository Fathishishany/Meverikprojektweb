/**
 * dashboard.js (Kunden-Dashboard)
 * ANFORDERUNGEN ERFÜLLT: M2, M4, M7, M9
 * 
 * M2: Frontend in HTML5, CSS, JavaScript (dashboard.html, dashboard.css, dashboard.js)
 * M4: Asynchrone Datenübertragung - alle fetch() sind async, nutzen await
 * M7: Frontend konsumiert GET, POST Endpoints (mind. 2 verschiedene Methoden)
 * M9: Session Management - prüft ob Kunde eingeloggt, sonst Umleitung zu Login
 *
 * Diese Seite ist NUR für eingeloggte Kunden. Keine gueltige Session
 * => sofort Umleitung zu login.html
 *
 * HTTP-Methoden gegen das Backend (M7):
 *   GET  /api/session            -> bin ich eingeloggt?
 *   GET  /api/packages           -> Pakete für die Dropdown
 *   GET  /api/tickets/mine       -> eigene Tickets
 *   POST /api/tickets            -> neues Ticket anlegen
 *   GET  /api/tickets/:id        -> Ticket-Detail
 *   GET  /api/tickets/:id/messages   -> Chat-Verlauf laden
 *   POST /api/tickets/:id/messages   -> Chat-Nachricht senden
 * ----------------------------------------------------------------------
 */

const API_BASE = "";

const welcomeText = document.getElementById("welcome-text");
const dashboardGrid = document.getElementById("dashboard-grid");
const myTicketsList = document.getElementById("my-tickets-list");
const orderForm = document.getElementById("order-form");
const orderError = document.getElementById("order-error");
const orderSubmitBtn = document.getElementById("order-submit");
const packageSelect = document.getElementById("packageId");

const ticketChatPanel = document.getElementById("ticket-chat-panel");
const ticketChatInfo = document.getElementById("ticket-chat-info");
const chatMessagesEl = document.getElementById("chat-messages");
const chatForm = document.getElementById("chat-form");
const chatInput = document.getElementById("chat-input");
const chatError = document.getElementById("chat-error");
const closeChatBtn = document.getElementById("close-chat-btn");

const myChangesList = document.getElementById("my-changes-list");
const myChangesError = document.getElementById("my-changes-error");
const changeForm = document.getElementById("change-form");
const changeError = document.getElementById("change-error");
const changeSubmitBtn = document.getElementById("change-submit");
const changeTicketSelect = document.getElementById("change-ticketId");
const changePackageSelect = document.getElementById("change-package");
const changeDescriptionInput = document.getElementById("change-description");

const changeChatPanel = document.getElementById("change-chat-panel");
const changeChatInfo = document.getElementById("change-chat-info");
const changeChatMessagesEl = document.getElementById("change-chat-messages");
const changeChatForm = document.getElementById("change-chat-form");
const changeChatInput = document.getElementById("change-chat-input");
const changeChatError = document.getElementById("change-chat-error");
const closeChangeChatBtn = document.getElementById("close-change-chat-btn");

// ============================================================================
// SESSION-GATE: nur eingeloggte KUNDEN duerfen diese Seite sehen
// ============================================================================

async function requireCustomerSession() {
  try {
    const res = await fetch(`${API_BASE}/api/session`);
    const data = await res.json();
    if (!data.loggedIn || data.role !== "customer") {
      window.location.href = "login.html";
      return;
    }
    welcomeText.textContent = `Hi, ${data.username}`;
    init();
  } catch (err) {
    window.location.href = "login.html";
  }
}

document.getElementById("logout-btn").addEventListener("click", async () => {
  await fetch(`${API_BASE}/api/logout`, { method: "POST" });
  window.location.href = "index.html";
});

function init() {
  loadPackages();
  loadMyTickets();
  loadChangePackages();
  loadMyChanges();
  checkUrlParams();
  setInterval(loadMyTickets, 12000);
  setInterval(loadMyChanges, 12000);
}

requireCustomerSession();

// ============================================================================
// PAKETE LADEN (GET /api/packages) - fuer die Dropdown
// ============================================================================

async function loadPackages() {
  try {
    const res = await fetch(`${API_BASE}/api/packages`);
    const data = await res.json();
    const options = data.packages.map((p) => `<option value="${p.id}">${p.name} — €${p.priceEUR}</option>`);
    packageSelect.insertAdjacentHTML("beforeend", options.join(""));

    // Falls man von der Homepage mit ?package=starter hierher kam, gleich vorauswaehlen.
    const urlParams = new URLSearchParams(window.location.search);
    const pkgParam = urlParams.get("package");
    if (pkgParam) packageSelect.value = pkgParam;
  } catch (err) {
    console.error("Pakete konnten nicht geladen werden:", err);
  }
}

// ============================================================================
// EIGENE TICKETS LADEN + ANZEIGEN (GET /api/tickets/mine)
// ============================================================================

function statusLabel(status) {
  switch (status) {
    case "new": return "Received — waiting to start";
    case "in_progress": return "Building your website now";
    case "done": return "Delivered — your website is live";
    default: return status;
  }
}

// Braucht der Kunde sich das Ticket ansehen? Einfache, zustandslose Regel:
// die LETZTE Nachricht im Chat kam vom Admin -> wartet auf eine Antwort.
function needsCustomerAttention(ticket) {
  const msgs = ticket.messages || [];
  if (msgs.length === 0) return false;
  return msgs[msgs.length - 1].sender === "admin";
}

async function loadMyTickets() {
  try {
    const res = await fetch(`${API_BASE}/api/tickets/mine`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Could not load tickets");
    renderMyTickets(data.tickets);
  } catch (err) {
    myTicketsList.innerHTML = `<p class="muted">Could not load your tickets.</p>`;
  }
}

function renderMyTickets(tickets) {
  if (!tickets || tickets.length === 0) {
    myTicketsList.innerHTML = `<p class="muted">You don't have any tickets yet — request one below.</p>`;
    return;
  }

  myTicketsList.innerHTML = tickets
    .map(
      (t) => `
        <div class="my-ticket-row">
          <span class="my-ticket-row__id">${needsCustomerAttention(t) ? '<span class="unread-dot" title="New message from Meverik"></span>' : ""}${t.id}</span>
          <span class="my-ticket-row__name">${t.businessName}</span>
          <span class="status-pill status-pill--${t.status}">${t.status.toUpperCase()}</span>
          <button type="button" class="btn btn--ghost btn--small" data-open-chat="${t.id}">Chat &amp; details</button>
        </div>
      `
    )
    .join("");

  myTicketsList.querySelectorAll("[data-open-chat]").forEach((btn) => {
    btn.addEventListener("click", () => openTicketChat(btn.dataset.openChat));
  });

  populateChangeTicketSelect(tickets);
}

// Haelt eine laufende Auswahl im Change-Formular am Leben, auch wenn die
// Ticket-Liste im Hintergrund alle 12s neu geladen wird.
function populateChangeTicketSelect(tickets) {
  const previousValue = changeTicketSelect.value;
  const options = (tickets || []).map((t) => `<option value="${t.id}">${t.id} — ${t.businessName}</option>`).join("");
  changeTicketSelect.innerHTML = `<option value="" disabled ${previousValue ? "" : "selected"}>Choose a ticket…</option>${options}`;
  if (previousValue && (tickets || []).some((t) => t.id === previousValue)) {
    changeTicketSelect.value = previousValue;
  }
}

// ============================================================================
// NEUES TICKET ANLEGEN (POST /api/tickets)
// ============================================================================

orderForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  orderError.hidden = true;

  const payload = {
    customerName: document.getElementById("customerName").value.trim(),
    email: document.getElementById("email").value.trim(),
    businessName: document.getElementById("businessName").value.trim(),
    packageId: packageSelect.value,
    message: document.getElementById("message").value.trim(),
  };

  if (!payload.customerName || !payload.email || !payload.businessName || !payload.packageId) {
    orderError.textContent = "Please fill in all required fields.";
    orderError.hidden = false;
    return;
  }

  orderSubmitBtn.disabled = true;
  orderSubmitBtn.textContent = "Submitting…";

  try {
    const res = await fetch(`${API_BASE}/api/tickets`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Unknown error");

    orderForm.reset();
    loadMyTickets();
    openTicketChat(data.ticket.id); // direkt ins neue Ticket springen (inkl. Chat)
  } catch (err) {
    orderError.textContent = `Could not submit your request: ${err.message}`;
    orderError.hidden = false;
  } finally {
    orderSubmitBtn.disabled = false;
    orderSubmitBtn.textContent = "Submit request";
  }
});

// ============================================================================
// TICKET-DETAIL + CHAT
// ============================================================================

let currentChatTicketId = null;
let chatPollInterval = null;

async function openTicketChat(ticketId) {
  currentChatTicketId = ticketId;
  chatError.hidden = true;

  dashboardGrid.hidden = true;
  ticketChatPanel.hidden = false;

  await loadTicketChatInfo(ticketId);
  await loadChatMessages(ticketId);

  if (chatPollInterval) clearInterval(chatPollInterval);
  chatPollInterval = setInterval(() => loadChatMessages(ticketId), 4000);

  ticketChatPanel.scrollIntoView({ behavior: "smooth", block: "start" });
}

function closeTicketChat() {
  if (chatPollInterval) clearInterval(chatPollInterval);
  chatPollInterval = null;
  currentChatTicketId = null;

  ticketChatPanel.hidden = true;
  dashboardGrid.hidden = false;

  loadMyTickets();
}
closeChatBtn.addEventListener("click", closeTicketChat);

async function loadTicketChatInfo(ticketId) {
  try {
    const res = await fetch(`${API_BASE}/api/tickets/${encodeURIComponent(ticketId)}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Ticket not found");

    const t = data.ticket;
    const qrImg = t.qrCodeDataUrl
      ? `<img class="ticket-chat-info__qr" src="${t.qrCodeDataUrl}" alt="QR code for ticket ${t.id}" />`
      : "";
    const paymentHtml = t.paid
      ? `<div class="payment-action"><p class="payment-status payment-status--paid">✓ Paid</p></div>`
      : `<div class="payment-action"><button type="button" class="btn btn--accent" id="pay-btn">Pay now</button></div>`;

    ticketChatInfo.innerHTML = `
      <p class="eyebrow muted">Ticket ${t.id}</p>
      <h3>${t.businessName}</h3>
      <p class="muted">Package: ${t.packageId} · Status: ${statusLabel(t.status)}</p>
      ${paymentHtml}
      ${qrImg}
    `;

    if (!t.paid) {
      document.getElementById("pay-btn").addEventListener("click", () => startCheckout(t.id));
    }
  } catch (err) {
    ticketChatInfo.innerHTML = `<p class="muted">Could not load ticket info.</p>`;
  }
}

// ============================================================================
// AENDERUNGSWUENSCHE (Change Requests)
// ============================================================================

async function loadChangePackages() {
  try {
    const res = await fetch(`${API_BASE}/api/change-packages`);
    const data = await res.json();
    const options = data.changePackages.map((p) => `<option value="${p.id}">${p.name} — €${p.priceEUR}</option>`);
    changePackageSelect.insertAdjacentHTML("beforeend", options.join(""));
  } catch (err) {
    console.error("Change-Pakete konnten nicht geladen werden:", err);
  }
}

function changeStatusLabel(status) {
  switch (status) {
    case "new": return "RECEIVED";
    case "in_progress": return "IN PROGRESS";
    case "done": return "DONE";
    default: return status.toUpperCase();
  }
}

async function loadMyChanges() {
  try {
    const res = await fetch(`${API_BASE}/api/change-requests/mine`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Could not load change requests");
    renderMyChanges(data.changeRequests);
  } catch (err) {
    myChangesList.innerHTML = `<p class="muted">Could not load your change requests.</p>`;
  }
}

function renderMyChanges(changeRequests) {
  if (!changeRequests || changeRequests.length === 0) {
    myChangesList.innerHTML = `<p class="muted">No change requests yet.</p>`;
    myChangesById = {};
    return;
  }

  myChangesById = {};
  changeRequests.forEach((c) => (myChangesById[c.id] = c));

  myChangesList.innerHTML = changeRequests
    .map(
      (c) => `
        <div class="my-change-row">
          <span class="my-change-row__id">${c.id}</span>
          <span class="my-change-row__meta">for ${c.ticketId} · ${c.changePackage}</span>
          <span class="status-pill status-pill--${c.status}">${changeStatusLabel(c.status)}</span>
          <span class="payment-pill payment-pill--${c.paid ? "paid" : "unpaid"}">${c.paid ? "PAID" : "UNPAID"}</span>
          ${c.paid ? "" : `<button type="button" class="btn btn--accent btn--small" data-pay-change="${c.id}">Pay now</button>`}
          <button type="button" class="btn btn--ghost btn--small" data-chat-change="${c.id}">Chat</button>
        </div>
      `
    )
    .join("");

  myChangesList.querySelectorAll("[data-pay-change]").forEach((btn) => {
    btn.addEventListener("click", () => startChangeCheckout(btn.dataset.payChange));
  });
  myChangesList.querySelectorAll("[data-chat-change]").forEach((btn) => {
    btn.addEventListener("click", () => openChangeChat(btn.dataset.chatChange));
  });
}

changeForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  changeError.hidden = true;

  const payload = {
    ticketId: changeTicketSelect.value,
    changePackage: changePackageSelect.value,
    description: changeDescriptionInput.value.trim(),
  };

  if (!payload.ticketId || !payload.changePackage) {
    changeError.textContent = "Please choose a ticket and a change size.";
    changeError.hidden = false;
    return;
  }

  changeSubmitBtn.disabled = true;
  changeSubmitBtn.textContent = "Submitting…";

  try {
    const res = await fetch(`${API_BASE}/api/change-requests`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Unknown error");

    changeForm.reset();
    loadMyChanges();
  } catch (err) {
    changeError.textContent = `Could not submit your change request: ${err.message}`;
    changeError.hidden = false;
  } finally {
    changeSubmitBtn.disabled = false;
    changeSubmitBtn.textContent = "Submit change request";
  }
});

async function startChangeCheckout(changeRequestId) {
  myChangesError.hidden = true;
  try {
    const res = await fetch(`${API_BASE}/api/change-requests/${encodeURIComponent(changeRequestId)}/checkout`, {
      method: "POST",
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Could not start checkout");
    window.location.href = data.url;
  } catch (err) {
    myChangesError.textContent = `Payment could not be started: ${err.message}`;
    myChangesError.hidden = false;
  }
}

async function confirmChangePayment(changeRequestId, sessionId) {
  try {
    await fetch(
      `${API_BASE}/api/change-requests/${encodeURIComponent(changeRequestId)}/confirm-payment?session_id=${encodeURIComponent(sessionId)}`
    );
  } catch (err) {
    // egal - loadMyChanges() zeigt sowieso den aktuellen Stand
  }
  window.history.replaceState({}, "", "dashboard.html");
  loadMyChanges();
}

// ---- Chat zu einem Change Request (gleiches Prinzip wie der Ticket-Chat) --

let myChangesById = {};
let currentChangeChatId = null;
let changeChatPollInterval = null;

function changePackageLabel(id) {
  switch (id) {
    case "small": return "Small Change (€5)";
    case "medium": return "Medium Change (€25)";
    case "large": return "Large Change (€50)";
    default: return id;
  }
}

function openChangeChat(changeRequestId) {
  currentChangeChatId = changeRequestId;
  changeChatError.hidden = true;

  dashboardGrid.hidden = true;
  changeChatPanel.hidden = false;

  renderChangeChatInfo(myChangesById[changeRequestId]);
  loadChangeChatMessages(changeRequestId);

  if (changeChatPollInterval) clearInterval(changeChatPollInterval);
  changeChatPollInterval = setInterval(() => loadChangeChatMessages(changeRequestId), 4000);

  changeChatPanel.scrollIntoView({ behavior: "smooth", block: "start" });
}

function closeChangeChat() {
  if (changeChatPollInterval) clearInterval(changeChatPollInterval);
  changeChatPollInterval = null;
  currentChangeChatId = null;

  changeChatPanel.hidden = true;
  dashboardGrid.hidden = false;

  loadMyChanges();
}
closeChangeChatBtn.addEventListener("click", closeChangeChat);

function renderChangeChatInfo(c) {
  if (!c) {
    changeChatInfo.innerHTML = `<p class="muted">Could not load this change request.</p>`;
    return;
  }
  changeChatInfo.innerHTML = `
    <p class="eyebrow muted">Change Request ${c.id}</p>
    <h3>${changePackageLabel(c.changePackage)}</h3>
    <p class="muted">For ticket ${c.ticketId} · ${changeStatusLabel(c.status)}</p>
    <span class="payment-pill payment-pill--${c.paid ? "paid" : "unpaid"}">${c.paid ? "PAID" : "UNPAID"}</span>
  `;
}

async function loadChangeChatMessages(changeRequestId) {
  try {
    const res = await fetch(`${API_BASE}/api/change-requests/${encodeURIComponent(changeRequestId)}/messages`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Could not load messages");
    renderChangeChatMessages(data.messages);
  } catch (err) {
    // beim Hintergrund-Polling keinen Fehler anzeigen
  }
}

function renderChangeChatMessages(messages) {
  const wasNearBottom =
    changeChatMessagesEl.scrollHeight - changeChatMessagesEl.scrollTop - changeChatMessagesEl.clientHeight < 40;

  if (!messages || messages.length === 0) {
    changeChatMessagesEl.innerHTML = `<p class="muted">No messages yet — say hello!</p>`;
    return;
  }

  changeChatMessagesEl.innerHTML = messages
    .map(() => `
        <div class="chat-message">
          <span class="chat-message__author"></span>
          <p class="chat-message__text"></p>
          <span class="chat-message__time"></span>
        </div>
      `)
    .join("");

  const rows = changeChatMessagesEl.querySelectorAll(".chat-message");
  messages.forEach((m, i) => {
    const row = rows[i];
    const mine = m.sender === "customer";
    if (mine) row.classList.add("chat-message--me");

    row.querySelector(".chat-message__author").textContent = mine ? "You" : m.senderName;
    row.querySelector(".chat-message__text").textContent = m.text;
    row.querySelector(".chat-message__time").textContent = new Date(m.createdAt).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  });

  if (wasNearBottom) {
    changeChatMessagesEl.scrollTop = changeChatMessagesEl.scrollHeight;
  }
}

changeChatForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  changeChatError.hidden = true;

  const text = changeChatInput.value.trim();
  if (!text || !currentChangeChatId) return;

  changeChatInput.value = "";

  try {
    const res = await fetch(`${API_BASE}/api/change-requests/${encodeURIComponent(currentChangeChatId)}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Could not send message");

    renderChangeChatMessages(data.messages);
    changeChatMessagesEl.scrollTop = changeChatMessagesEl.scrollHeight;
  } catch (err) {
    changeChatError.textContent = `Message could not be sent: ${err.message}`;
    changeChatError.hidden = false;
  }
});

// ============================================================================
// BEZAHLUNG (Stripe Checkout)
// ============================================================================

async function startCheckout(ticketId) {
  try {
    const res = await fetch(`${API_BASE}/api/tickets/${encodeURIComponent(ticketId)}/checkout`, {
      method: "POST",
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Could not start checkout");
    window.location.href = data.url; // Weiterleitung zur Stripe-Bezahlseite
  } catch (err) {
    chatError.textContent = `Payment could not be started: ${err.message}`;
    chatError.hidden = false;
  }
}

async function confirmPayment(ticketId, sessionId) {
  try {
    await fetch(
      `${API_BASE}/api/tickets/${encodeURIComponent(ticketId)}/confirm-payment?session_id=${encodeURIComponent(sessionId)}`
    );
  } catch (err) {
    // egal - openTicketChat() unten zeigt sowieso den aktuellen Stand an
  }
  window.history.replaceState({}, "", `dashboard.html?ticket=${ticketId}`);
  openTicketChat(ticketId);
}

async function loadChatMessages(ticketId) {
  try {
    const res = await fetch(`${API_BASE}/api/tickets/${encodeURIComponent(ticketId)}/messages`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Could not load messages");
    renderChatMessages(data.messages);
  } catch (err) {
    // beim Hintergrund-Polling keinen Fehler anzeigen
  }
}

function renderChatMessages(messages) {
  const wasNearBottom =
    chatMessagesEl.scrollHeight - chatMessagesEl.scrollTop - chatMessagesEl.clientHeight < 40;

  if (!messages || messages.length === 0) {
    chatMessagesEl.innerHTML = `<p class="muted">No messages yet — say hello!</p>`;
    return;
  }

  chatMessagesEl.innerHTML = messages
    .map(() => `
        <div class="chat-message">
          <span class="chat-message__author"></span>
          <p class="chat-message__text"></p>
          <span class="chat-message__time"></span>
        </div>
      `)
    .join("");

  // Texte separat per textContent setzen, damit Nutzereingaben nie als
  // HTML interpretiert werden koennen (XSS-Schutz).
  const rows = chatMessagesEl.querySelectorAll(".chat-message");
  messages.forEach((m, i) => {
    const row = rows[i];
    const mine = m.sender === "customer";
    if (mine) row.classList.add("chat-message--me");

    row.querySelector(".chat-message__author").textContent = mine ? "You" : m.senderName;
    row.querySelector(".chat-message__text").textContent = m.text;
    row.querySelector(".chat-message__time").textContent = new Date(m.createdAt).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  });

  if (wasNearBottom) {
    chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;
  }
}

chatForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  chatError.hidden = true;

  const text = chatInput.value.trim();
  if (!text || !currentChatTicketId) return;

  chatInput.value = "";

  try {
    const res = await fetch(`${API_BASE}/api/tickets/${encodeURIComponent(currentChatTicketId)}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Could not send message");

    renderChatMessages(data.messages);
    chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;
  } catch (err) {
    chatError.textContent = `Message could not be sent: ${err.message}`;
    chatError.hidden = false;
  }
});

// ---- Direkt-Link auf ein Ticket, z.B. via QR-Code (?ticket=MV-1000) --------

function checkUrlParams() {
  const urlParams = new URLSearchParams(window.location.search);
  const ticketParam = urlParams.get("ticket");
  const changeParam = urlParams.get("change");
  const paymentParam = urlParams.get("payment");
  const sessionId = urlParams.get("session_id");

  if (changeParam) {
    if (paymentParam === "success" && sessionId) {
      confirmChangePayment(changeParam, sessionId);
    } else {
      window.history.replaceState({}, "", "dashboard.html"); // payment=cancelled o.ae. aufraeumen
    }
    return;
  }

  if (!ticketParam) return;

  if (paymentParam === "success" && sessionId) {
    confirmPayment(ticketParam, sessionId); // bestaetigt bei Stripe + oeffnet danach den Chat
  } else {
    openTicketChat(ticketParam); // normaler Direkt-Link oder payment=cancelled
  }
}