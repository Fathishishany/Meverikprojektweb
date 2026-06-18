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
  checkUrlParams();
  setInterval(loadMyTickets, 12000);
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
      ? `<p class="payment-status payment-status--paid">✓ Paid</p>`
      : `<button type="button" class="btn btn--accent" id="pay-btn">Pay now</button>`;

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
  if (!ticketParam) return;

  const paymentParam = urlParams.get("payment");
  const sessionId = urlParams.get("session_id");

  if (paymentParam === "success" && sessionId) {
    confirmPayment(ticketParam, sessionId);
  } else {
    openTicketChat(ticketParam);
  }
}