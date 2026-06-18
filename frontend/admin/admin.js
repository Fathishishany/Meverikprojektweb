/**
 * admin.js (Ops-Dashboard, FE Komponente #2)
 * ANFORDERUNGEN ERFÜLLT: S2, M2, M4, M6, M7, C3
 * 
 * S2: Zweite FE-Komponente mit ≥3 BE-Endpoints ✓ (hat 10+ Endpoints!)
 * M2: Frontend in HTML5, CSS, JavaScript (admin.html, admin.css, admin.js)
 * M4: Asynchrone Datenübertragung - alle fetch() sind async, nutzen await
 * M6/M7: Nutzt ALLE 4 HTTP-Methoden (GET, POST, PUT, DELETE, PATCH)
 * C3: Konsumiert PATCH /api/tickets/:id Endpoint
 *
 * REST-API Endpunkte (M6/M7 + S2):
 *   GET    /api/session        -> bin ich eingeloggt?
 *   POST   /api/login          -> Admin-Login (M9)
 *   POST   /api/logout         -> Logout
 *   GET    /api/packages       -> Paketnamen für Dropdowns
 *   GET    /api/tickets        -> alle Tickets (M7)
 *   POST   /api/tickets        -> Ticket erstellen (M7)
 *   PUT    /api/tickets/:id    -> Ticket bearbeiten (M6/M7)
 *   PATCH  /api/tickets/:id    -> Status ändern (C3)
 *   DELETE /api/tickets/:id    -> Ticket löschen (M6/M7)
 *
 * Diese Komponente ist komplett unabhängig vom Kunden-Frontend
 * (eigenes HTML/CSS/JS, eigener Ordner /admin).
 * Damit deckt allein diese eine Komponente alle 4 HTTP-Methoden ab.
 * ----------------------------------------------------------------------
 */

const API_BASE = "";

let packagesCache = [];     // fuer die <select>-Dropdowns und Namensanzeige
let ticketsById = {};       // letzter geladener Zustand, damit das Edit-Modal
                             // nicht extra nachladen muss

// ---- Kleine Hilfsfunktionen fuer Status-Anzeige ----------------------------

function statusLabel(status) {
  switch (status) {
    case "new": return "New";
    case "in_progress": return "In progress";
    case "done": return "Done";
    default: return status;
  }
}

function packageName(packageId) {
  const pkg = packagesCache.find((p) => p.id === packageId);
  return pkg ? pkg.name : packageId;
}

// Braucht der Admin sich das Ticket ansehen? Einfache, zustandslose Regel:
// die LETZTE Nachricht im Chat kam vom Kunden -> wartet auf eine Antwort.
function needsAdminAttention(ticket) {
  const msgs = ticket.messages || [];
  if (msgs.length === 0) return false;
  return msgs[msgs.length - 1].sender === "customer";
}

async function readJson(res) {
  // Hilfsfunktion: liest die JSON-Antwort und wirft bei Fehlerstatus
  // eine Exception mit der Server-Fehlermeldung, damit wir das in einem
  // einzigen try/catch behandeln koennen.
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `Server status ${res.status}`);
  return data;
}

// ============================================================================
// VIEW-WECHSEL: Login <-> Dashboard
// ============================================================================

const viewLogin = document.getElementById("view-login");
const viewDashboard = document.getElementById("view-dashboard");
const welcomeText = document.getElementById("welcome-text");

function showLogin() {
  viewLogin.hidden = false;
  viewDashboard.hidden = true;
}

let ticketsPollInterval = null;

function showDashboard(username) {
  viewLogin.hidden = true;
  viewDashboard.hidden = false;
  welcomeText.textContent = `Signed in as ${username}`;
  loadPackagesForSelects().then(() => loadTickets(currentStatusFilter));

  if (ticketsPollInterval) clearInterval(ticketsPollInterval);
  ticketsPollInterval = setInterval(() => loadTickets(currentStatusFilter), 12000);
}

// M4: async/await Pattern | M7: GET /api/session (M9 Session-Check)
// Beim Laden der Seite fragen wir das Backend: bin ich noch eingeloggt?
// (z.B. wichtig nach einem Seiten-Reload, das Session-Cookie lebt ja weiter)
async function checkSession() {
  try {
    // M4: await fetch() - asynchrone Datenübertragung
    const res = await fetch(`${API_BASE}/api/session`);
    const data = await readJson(res);
    if (data.loggedIn) {
      showDashboard(data.username);
    } else {
      showLogin();
    }
  } catch (err) {
    showLogin();
  }
}

checkSession();

// ============================================================================
// LOGIN (POST /api/login) + LOGOUT (POST /api/logout)
// ============================================================================

const loginForm = document.getElementById("login-form");
const loginError = document.getElementById("login-error");
const loginSubmit = document.getElementById("login-submit");

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  loginError.hidden = true;
  loginSubmit.disabled = true;
  loginSubmit.textContent = "Signing in…";

  try {
    const res = await fetch(`${API_BASE}/api/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: document.getElementById("username").value.trim(),
        password: document.getElementById("password").value,
      }),
    });
    const data = await readJson(res);
    loginForm.reset();
    showDashboard(data.username);
  } catch (err) {
    loginError.textContent = err.message;
    loginError.hidden = false;
  } finally {
    loginSubmit.disabled = false;
    loginSubmit.textContent = "Sign in";
  }
});

document.getElementById("logout-btn").addEventListener("click", async () => {
  try {
    await fetch(`${API_BASE}/api/logout`, { method: "POST" });
  } finally {
    if (ticketsPollInterval) clearInterval(ticketsPollInterval);
    showLogin();
  }
});

// ============================================================================
// M7: GET /api/packages | M4: async/await
// PAKETE LADEN (GET /api/packages) - fuer die Dropdowns in den Formularen
// ============================================================================

async function loadPackagesForSelects() {
  try {
    // M4: await fetch() - asynchrone Datenübertragung
    // M7: GET Ressource konsumieren
    const res = await fetch(`${API_BASE}/api/packages`);
    const data = await readJson(res);
    packagesCache = data.packages;

    const options = packagesCache
      .map((p) => `<option value="${p.id}">${p.name} — €${p.priceEUR}</option>`)
      .join("");
    document.getElementById("nt-packageId").innerHTML = options;
    document.getElementById("ed-packageId").innerHTML = options;
  } catch (err) {
    // Wenn das fehlschlaegt, bleiben die Dropdowns leer - kein Showstopper
    // fuer den Rest des Dashboards.
    console.error("Pakete konnten nicht geladen werden:", err);
  }
}

// ============================================================================
// TICKETS LADEN + ANZEIGEN (GET /api/tickets, optional ?status=)
// ============================================================================

let currentStatusFilter = "";

const manifestBody = document.getElementById("manifest-body");
const boardingPasses = document.getElementById("boarding-passes");
const dashboardError = document.getElementById("dashboard-error");
const emptyState = document.getElementById("empty-state");

async function loadTickets(status = "") {
  dashboardError.hidden = true;
  try {
    const query = status ? `?status=${encodeURIComponent(status)}` : "";
    // M4: await fetch() - asynchrone Datenübertragung
    // M7: GET Ressource konsumieren
    const res = await fetch(`${API_BASE}/api/tickets${query}`);
    const data = await readJson(res);

    ticketsById = {};
    data.tickets.forEach((t) => (ticketsById[t.id] = t));

    renderManifest(data.tickets);
    renderBoardingPasses(data.tickets);
    emptyState.hidden = data.tickets.length !== 0;
  } catch (err) {
    dashboardError.textContent = `Could not load tickets: ${err.message}`;
    dashboardError.hidden = false;
    manifestBody.innerHTML = "";
    boardingPasses.innerHTML = "";
  }
}

function statusActionsHtml(ticket) {
  // Drei kleine Knoepfe fuer den Schnellwechsel des Status per PATCH (C3).
  // Der aktuelle Status wird deaktiviert angezeigt, damit klar ist "du bist
  // hier" und man nicht aus Versehen auf den gleichen Status klickt.
  return ["new", "in_progress", "done"]
    .map((s) => {
      const isCurrent = s === ticket.status;
      return `<button class="btn-icon" data-action="status" data-id="${ticket.id}" data-status="${s}" ${isCurrent ? "disabled" : ""}>${statusLabel(s)}</button>`;
    })
    .join("");
}

function renderManifest(tickets) {
  manifestBody.innerHTML = tickets
    .map(
      (t) => `
      <tr>
<td class="id-cell">${needsAdminAttention(t) ? '<span class="unread-dot" title="New customer message"></span>' : ""}${t.id}</td>        <td>${t.businessName}</td>
        <td>${t.customerName}</td>
        <td>${packageName(t.packageId)}</td>
        <td>${t.country || "—"}</td>
        <td>
          <span class="status-pill status-pill--${t.status}">${statusLabel(t.status)}</span>
          <span class="payment-pill payment-pill--${t.paid ? "paid" : "unpaid"}">${t.paid ? "PAID" : "UNPAID"}</span>
        </td>
        <td>
          <div class="status-actions">${statusActionsHtml(t)}</div>
          <div class="row-actions">
            <button class="btn-icon" data-action="edit" data-id="${t.id}">Edit</button>
            <button class="btn-icon btn-icon--danger" data-action="delete" data-id="${t.id}">Delete</button>
          </div>
        </td>
      </tr>
    `
    )
    .join("");
}

function renderBoardingPasses(tickets) {
  boardingPasses.innerHTML = tickets
    .map(
      (t) => `
      <article class="boarding-pass">
        <div class="boarding-pass__top">
          <span class="boarding-pass__id">${needsAdminAttention(t) ? '<span class="unread-dot" title="New customer message"></span>' : ""}${t.id}</span>
          <span class="status-pill status-pill--${t.status}">${statusLabel(t.status)}</span>
        </div>
        <span class="payment-pill payment-pill--${t.paid ? "paid" : "unpaid"}">${t.paid ? "PAID" : "UNPAID"}</span>
        <p class="boarding-pass__business">${t.businessName}</p>
        <p class="boarding-pass__meta">${t.customerName} · ${packageName(t.packageId)} · ${t.country || "—"}</p>
        <div class="status-actions">${statusActionsHtml(t)}</div>
        <div class="row-actions">
          <button class="btn-icon" data-action="edit" data-id="${t.id}">Edit</button>
          <button class="btn-icon btn-icon--danger" data-action="delete" data-id="${t.id}">Delete</button>
        </div>
      </article>
    `
    )
    .join("");
}

// Ein einziger Klick-Handler fuer Tabelle UND Karten (Event Delegation),
// weil beide die gleichen data-action Buttons verwenden.
function handleActionClick(event) {
  const btn = event.target.closest("button[data-action]");
  if (!btn) return;

  const id = btn.dataset.id;
  if (btn.dataset.action === "status") {
    patchTicketStatus(id, btn.dataset.status);
  } else if (btn.dataset.action === "edit") {
    openEditModal(id);
  } else if (btn.dataset.action === "delete") {
    deleteTicket(id);
  }
}
manifestBody.addEventListener("click", handleActionClick);
boardingPasses.addEventListener("click", handleActionClick);

// ---- Filterleiste -----------------------------------------------------

document.getElementById("filter-group").addEventListener("click", (event) => {
  const btn = event.target.closest(".filter-btn");
  if (!btn) return;
  document.querySelectorAll(".filter-btn").forEach((b) => b.classList.remove("is-active"));
  btn.classList.add("is-active");
  currentStatusFilter = btn.dataset.status;
  loadTickets(currentStatusFilter);
});

document.getElementById("refresh-btn").addEventListener("click", () => loadTickets(currentStatusFilter));

// ============================================================================
// NEUES TICKET ANLEGEN (POST /api/tickets)
// ============================================================================

const newTicketToggle = document.getElementById("new-ticket-toggle");
const newTicketForm = document.getElementById("new-ticket-form");
const newTicketError = document.getElementById("new-ticket-error");

newTicketToggle.addEventListener("click", () => {
  newTicketForm.hidden = !newTicketForm.hidden;
});
document.getElementById("new-ticket-cancel").addEventListener("click", () => {
  newTicketForm.hidden = true;
  newTicketForm.reset();
  newTicketError.hidden = true;
});

newTicketForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  newTicketError.hidden = true;

  const payload = {
    customerName: document.getElementById("nt-customerName").value.trim(),
    email: document.getElementById("nt-email").value.trim(),
    businessName: document.getElementById("nt-businessName").value.trim(),
    packageId: document.getElementById("nt-packageId").value,
    message: document.getElementById("nt-message").value.trim(),
  };

  try {
    // M4: async/await | M7: POST Ressource erstellen | M6: Backend hat POST
    const res = await fetch(`${API_BASE}/api/tickets`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    await readJson(res);
    newTicketForm.reset();
    newTicketForm.hidden = true;
    loadTickets(currentStatusFilter);
  } catch (err) {
    newTicketError.textContent = err.message;
    newTicketError.hidden = false;
  }
});

// ============================================================================
// TICKET BEARBEITEN - Modal (PUT /api/tickets/:id)
// ============================================================================

const editModal = document.getElementById("edit-modal");
const editForm = document.getElementById("edit-form");
const editError = document.getElementById("edit-error");

function openEditModal(id) {
  const t = ticketsById[id];
  if (!t) return;

  document.getElementById("edit-modal-id").textContent = t.id;
  document.getElementById("ed-customerName").value = t.customerName;
  document.getElementById("ed-email").value = t.email;
  document.getElementById("ed-businessName").value = t.businessName;
  document.getElementById("ed-packageId").value = t.packageId;
  document.getElementById("ed-status").value = t.status;
  document.getElementById("ed-country").value = t.country || "";
  document.getElementById("ed-message").value = t.message || "";

  editForm.dataset.editingId = t.id;
  editError.hidden = true;
  editModal.hidden = false;

  openAdminChat(t.id);
}

function closeEditModal() {
  editModal.hidden = true;
  closeAdminChat();
}
document.getElementById("edit-cancel").addEventListener("click", closeEditModal);
editModal.addEventListener("click", (event) => {
  if (event.target === editModal) closeEditModal(); // Klick auf den dunklen Hintergrund schliesst das Modal
});

editForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  editError.hidden = true;

  const id = editForm.dataset.editingId;
  const payload = {
    customerName: document.getElementById("ed-customerName").value.trim(),
    email: document.getElementById("ed-email").value.trim(),
    businessName: document.getElementById("ed-businessName").value.trim(),
    packageId: document.getElementById("ed-packageId").value,
    status: document.getElementById("ed-status").value,
    country: document.getElementById("ed-country").value.trim(),
    message: document.getElementById("ed-message").value.trim(),
  };

  try {
    // M4: async/await | M7: PUT Ressource bearbeiten (komplett) | M6: Backend hat PUT
    const res = await fetch(`${API_BASE}/api/tickets/${encodeURIComponent(id)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    await readJson(res);
    closeEditModal();
    loadTickets(currentStatusFilter);
  } catch (err) {
    editError.textContent = err.message;
    editError.hidden = false;
  }
});

// C3: PATCH Endpunkt (Backend) wird vom Frontend konsumiert
// M4: async/await | M7: PATCH - partielles Update
// ============================================================================

async function patchTicketStatus(id, status) {
  try {
    // C3: PATCH Methode | M4: await fetch()
    const res = await fetch(`${API_BASE}/api/tickets/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    await readJson(res);
    loadTickets(currentStatusFilter);
  } catch (err) {
    dashboardError.textContent = `Status update failed: ${err.message}`;
    dashboardError.hidden = false;
  }
}

// M7: DELETE Ressource löschen | M4: async/await | M6: Backend hat DELETE
// ============================================================================

async function deleteTicket(id) {
  if (!confirm(`Delete ticket ${id}? This cannot be undone.`)) return;

  try {
    const res = await fetch(`${API_BASE}/api/tickets/${encodeURIComponent(id)}`, { method: "DELETE" });
    await readJson(res);
    loadTickets(currentStatusFilter);
  } catch (err) {
    dashboardError.textContent = `Delete failed: ${err.message}`;
    dashboardError.hidden = false;
  }
}

// ============================================================================
// CHAT MIT DEM KUNDEN (im Bearbeiten-Modal)
// ============================================================================

const adminChatMessagesEl = document.getElementById("admin-chat-messages");
const adminChatForm = document.getElementById("admin-chat-form");
const adminChatInput = document.getElementById("admin-chat-input");
const adminChatError = document.getElementById("admin-chat-error");

let adminChatTicketId = null;
let adminChatPollInterval = null;

function openAdminChat(ticketId) {
  adminChatTicketId = ticketId;
  adminChatError.hidden = true;
  adminChatMessagesEl.innerHTML = `<p class="muted">Loading…</p>`;

  loadAdminChatMessages(ticketId);

  if (adminChatPollInterval) clearInterval(adminChatPollInterval);
  adminChatPollInterval = setInterval(() => loadAdminChatMessages(ticketId), 4000);
}

function closeAdminChat() {
  if (adminChatPollInterval) clearInterval(adminChatPollInterval);
  adminChatPollInterval = null;
  adminChatTicketId = null;
}

async function loadAdminChatMessages(ticketId) {
  try {
    const res = await fetch(`${API_BASE}/api/tickets/${encodeURIComponent(ticketId)}/messages`);
    const data = await readJson(res);
    renderAdminChatMessages(data.messages);
  } catch (err) {
    // beim Hintergrund-Polling keinen Fehler anzeigen, einfach beim naechsten Mal nochmal versuchen
  }
}

function renderAdminChatMessages(messages) {
  const wasNearBottom =
    adminChatMessagesEl.scrollHeight - adminChatMessagesEl.scrollTop - adminChatMessagesEl.clientHeight < 40;

  if (!messages || messages.length === 0) {
    adminChatMessagesEl.innerHTML = `<p class="muted">No messages yet.</p>`;
    return;
  }

  adminChatMessagesEl.innerHTML = messages
    .map(() => `
        <div class="chat-message">
          <span class="chat-message__author"></span>
          <p class="chat-message__text"></p>
          <span class="chat-message__time"></span>
        </div>
      `)
    .join("");

  // Texte separat per textContent setzen, damit Nutzereingaben nie als
  // HTML interpretiert werden koennen (XSS-Schutz) - gleiches Prinzip
  // wie auf der Kundenseite.
  const rows = adminChatMessagesEl.querySelectorAll(".chat-message");
  messages.forEach((m, i) => {
    const row = rows[i];
    const mine = m.sender === "admin";
    if (mine) row.classList.add("chat-message--me");

    row.querySelector(".chat-message__author").textContent = mine ? "You" : m.senderName;
    row.querySelector(".chat-message__text").textContent = m.text;
    row.querySelector(".chat-message__time").textContent = new Date(m.createdAt).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  });

  if (wasNearBottom) {
    adminChatMessagesEl.scrollTop = adminChatMessagesEl.scrollHeight;
  }
}

adminChatForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  adminChatError.hidden = true;

  const text = adminChatInput.value.trim();
  if (!text || !adminChatTicketId) return;

  adminChatInput.value = "";

  try {
    const res = await fetch(`${API_BASE}/api/tickets/${encodeURIComponent(adminChatTicketId)}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    const data = await readJson(res);
    renderAdminChatMessages(data.messages);
    adminChatMessagesEl.scrollTop = adminChatMessagesEl.scrollHeight;
  } catch (err) {
    adminChatError.textContent = err.message;
    adminChatError.hidden = false;
  }
});