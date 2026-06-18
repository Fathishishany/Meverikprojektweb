/**
 * changes.js (Admin - Change Requests)
 * ----------------------------------------------------------------------
 * Eigene Seite fuer die Verwaltung von Aenderungswuenschen, getrennt von
 * der normalen Ticket-Tabelle in admin.html. Nur fuer eingeloggte Admins
 * - sonst Redirect zurueck zu admin.html (dort ist das Login-Formular).
 *
 *   GET    /api/session             -> bin ich eingeloggt?
 *   POST   /api/logout              -> ausloggen
 *   GET    /api/change-requests     -> alle Change Requests
 *   PATCH  /api/change-requests/:id -> Status aendern
 *   DELETE /api/change-requests/:id -> loeschen
 * ----------------------------------------------------------------------
 */

const API_BASE = "";

const welcomeText = document.getElementById("welcome-text");

async function requireAdminSession() {
  try {
    const res = await fetch(`${API_BASE}/api/session`);
    const data = await res.json();
    if (!data.loggedIn || data.role !== "admin") {
      window.location.href = "admin.html";
      return;
    }
    welcomeText.textContent = `Signed in as ${data.username}`;
    init();
  } catch (err) {
    window.location.href = "admin.html";
  }
}

document.getElementById("logout-btn").addEventListener("click", async () => {
  await fetch(`${API_BASE}/api/logout`, { method: "POST" });
  window.location.href = "admin.html";
});

function init() {
  loadChangeRequests(currentStatusFilter);
}

requireAdminSession();

// ---- Kleine Hilfsfunktionen fuer Anzeige -----------------------------------

function statusLabel(status) {
  switch (status) {
    case "new": return "New";
    case "in_progress": return "In progress";
    case "done": return "Done";
    default: return status;
  }
}

function packageLabel(changePackage) {
  switch (changePackage) {
    case "small": return "Small (€5)";
    case "medium": return "Medium (€25)";
    case "large": return "Large (€50)";
    default: return changePackage;
  }
}

async function readJson(res) {
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `Server status ${res.status}`);
  return data;
}

// ============================================================================
// CHANGE REQUESTS LADEN + ANZEIGEN (GET /api/change-requests)
// ============================================================================

let currentStatusFilter = "";
let changesById = {};

const manifestBody = document.getElementById("manifest-body");
const boardingPasses = document.getElementById("boarding-passes");
const dashboardError = document.getElementById("dashboard-error");
const emptyState = document.getElementById("empty-state");

async function loadChangeRequests(status = "") {
  dashboardError.hidden = true;
  try {
    const res = await fetch(`${API_BASE}/api/change-requests`);
    const data = await readJson(res);
    let list = data.changeRequests;
    if (status) list = list.filter((c) => c.status === status);

    changesById = {};
    list.forEach((c) => (changesById[c.id] = c));

    renderManifest(list);
    renderBoardingPasses(list);
    emptyState.hidden = list.length !== 0;
  } catch (err) {
    dashboardError.textContent = `Could not load change requests: ${err.message}`;
    dashboardError.hidden = false;
    manifestBody.innerHTML = "";
    boardingPasses.innerHTML = "";
  }
}

function statusActionsHtml(c) {
  return ["new", "in_progress", "done"]
    .map((s) => {
      const isCurrent = s === c.status;
      return `<button class="btn-icon" data-action="status" data-id="${c.id}" data-status="${s}" ${isCurrent ? "disabled" : ""}>${statusLabel(s)}</button>`;
    })
    .join("");
}

function renderManifest(list) {
  manifestBody.innerHTML = list
    .map(
      (c) => `
      <tr>
        <td class="id-cell">${c.id}</td>
        <td>${c.ticketId}</td>
        <td>${c.customerName}</td>
        <td>${packageLabel(c.changePackage)}</td>
        <td>${c.description || "—"}</td>
        <td>
          <span class="status-pill status-pill--${c.status}">${statusLabel(c.status)}</span>
          <span class="payment-pill payment-pill--${c.paid ? "paid" : "unpaid"}">${c.paid ? "PAID" : "UNPAID"}</span>
        </td>
        <td>
          <div class="status-actions">${statusActionsHtml(c)}</div>
          <div class="row-actions">
            <button class="btn-icon btn-icon--danger" data-action="delete" data-id="${c.id}">Delete</button>
          </div>
        </td>
      </tr>
    `
    )
    .join("");
}

function renderBoardingPasses(list) {
  boardingPasses.innerHTML = list
    .map(
      (c) => `
      <article class="boarding-pass">
        <div class="boarding-pass__top">
          <span class="boarding-pass__id">${c.id}</span>
          <span class="status-pill status-pill--${c.status}">${statusLabel(c.status)}</span>
        </div>
        <span class="payment-pill payment-pill--${c.paid ? "paid" : "unpaid"}">${c.paid ? "PAID" : "UNPAID"}</span>
        <p class="boarding-pass__business">For ${c.ticketId} — ${packageLabel(c.changePackage)}</p>
        <p class="boarding-pass__meta">${c.customerName}${c.description ? " · " + c.description : ""}</p>
        <div class="status-actions">${statusActionsHtml(c)}</div>
        <div class="row-actions">
          <button class="btn-icon btn-icon--danger" data-action="delete" data-id="${c.id}">Delete</button>
        </div>
      </article>
    `
    )
    .join("");
}

// Ein einziger Klick-Handler fuer Tabelle UND Karten (Event Delegation).
function handleActionClick(event) {
  const btn = event.target.closest("button[data-action]");
  if (!btn) return;

  const id = btn.dataset.id;
  if (btn.dataset.action === "status") {
    patchStatus(id, btn.dataset.status);
  } else if (btn.dataset.action === "delete") {
    deleteChangeRequest(id);
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
  loadChangeRequests(currentStatusFilter);
});

document.getElementById("refresh-btn").addEventListener("click", () => loadChangeRequests(currentStatusFilter));

// ============================================================================
// STATUS AENDERN (PATCH) + LOESCHEN (DELETE)
// ============================================================================

async function patchStatus(id, status) {
  try {
    const res = await fetch(`${API_BASE}/api/change-requests/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    await readJson(res);
    loadChangeRequests(currentStatusFilter);
  } catch (err) {
    dashboardError.textContent = `Status update failed: ${err.message}`;
    dashboardError.hidden = false;
  }
}

async function deleteChangeRequest(id) {
  if (!confirm(`Delete change request ${id}? This cannot be undone.`)) return;

  try {
    const res = await fetch(`${API_BASE}/api/change-requests/${encodeURIComponent(id)}`, { method: "DELETE" });
    await readJson(res);
    loadChangeRequests(currentStatusFilter);
  } catch (err) {
    dashboardError.textContent = `Delete failed: ${err.message}`;
    dashboardError.hidden = false;
  }
}