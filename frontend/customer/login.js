/**
 * login.js (eigene Login/Registrierungs-Seite)
 * ANFORDERUNGEN ERFÜLLT: M2, M4, M7
 * 
 * M2: Frontend in HTML5, CSS, JavaScript (login.html, style.css, login.js)
 * M4: Asynchrone Datenübertragung - alle fetch() sind async, nutzen await
 * M7: Frontend konsumiert POST /api/register, POST /api/customer-login,
 *     GET /api/session Endpoints (3 verschiedene Methoden)
 *
 * REST-API Endpunkte (M7):
 *   GET  /api/session          -> pruefen ob schon eingeloggt
 *   POST /api/register         -> neuen Kunden-Account anlegen
 *   POST /api/customer-login   -> mit Email + Passwort einloggen
 * ----------------------------------------------------------------------
 */

const API_BASE = "";

// Falls von der Homepage mit einem gewaehlten Paket hierher verlinkt wurde
// (z.B. login.html?package=starter), nach dem Einloggen gleich mitnehmen.
const urlParams = new URLSearchParams(window.location.search);
const packageParam = urlParams.get("package");
const dashboardUrl = packageParam ? `dashboard.html?package=${encodeURIComponent(packageParam)}` : "dashboard.html";

const alreadyLoggedIn = document.getElementById("already-logged-in");
const alreadyLoggedInText = document.getElementById("already-logged-in-text");
const authForms = document.getElementById("auth-forms");

const tabLogin = document.getElementById("tab-login");
const tabRegister = document.getElementById("tab-register");
const loginFormCustomer = document.getElementById("login-form-customer");
const registerForm = document.getElementById("register-form");
const loginErrorCustomer = document.getElementById("login-error-customer");
const registerError = document.getElementById("register-error");

// M4: async/await Pattern | M7: GET /api/session (M9 Session-Check)
// Falls man schon eingeloggt ist und trotzdem auf login.html landet,
// zeigen wir statt der Formulare einen Hinweis + Link zur Bestellung.
async function checkAlreadyLoggedIn() {
  try {
    // M4: await fetch() - asynchrone Datenübertragung
    const res = await fetch(`${API_BASE}/api/session`);
    const data = await res.json();
    if (data.loggedIn && data.role === "customer") {
      alreadyLoggedInText.textContent = `Hi, ${data.username}!`;
      alreadyLoggedIn.hidden = false;
      authForms.hidden = true;
      document.getElementById("already-logged-in-link").setAttribute("href", dashboardUrl);
    }
  } catch (err) {
    // Bei Fehler einfach die normalen Formulare zeigen
  }
}
checkAlreadyLoggedIn();

// ---- Tabs zwischen Login und Registrierung umschalten ----------------------

tabLogin.addEventListener("click", () => {
  tabLogin.classList.add("is-active");
  tabRegister.classList.remove("is-active");
  loginFormCustomer.hidden = false;
  registerForm.hidden = true;
});
tabRegister.addEventListener("click", () => {
  tabRegister.classList.add("is-active");
  tabLogin.classList.remove("is-active");
  registerForm.hidden = false;
  loginFormCustomer.hidden = true;
});

// M7: POST /api/register | M4: async/await | M9: Account-Erstellung
// ---- Registrierung (POST /api/register) ------------------------------------

registerForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  registerError.hidden = true;

  const payload = {
    name: document.getElementById("register-name").value.trim(),
    email: document.getElementById("register-email").value.trim(),
    password: document.getElementById("register-password").value,
  };

  try {
    // M4: await fetch() - asynchrone Datenübertragung
    // M7: POST Ressource erstellen (Kunden-Account)
    // M9: Session wird direkt nach Registration erstellt
    const res = await fetch(`${API_BASE}/api/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Registration failed");

    // Erfolgreich registriert + eingeloggt -> direkt ins Dashboard
    window.location.href = dashboardUrl;
  } catch (err) {
    registerError.textContent = err.message;
    registerError.hidden = false;
  }
});

// M7: POST /api/customer-login | M4: async/await | M9: Kunden-Login
// ---- Login (POST /api/customer-login) ---------------------------------------

loginFormCustomer.addEventListener("submit", async (event) => {
  event.preventDefault();
  loginErrorCustomer.hidden = true;

  const payload = {
    email: document.getElementById("login-email").value.trim(),
    password: document.getElementById("login-password").value,
  };

  try {
    // M4: await fetch() - asynchrone Datenübertragung
    // M7: POST Kunde-Login Ressource
    // M9: Session wird nach erfolgreichem Login erstellt
    const res = await fetch(`${API_BASE}/api/customer-login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Login failed");

    window.location.href = dashboardUrl;
  } catch (err) {
    loginErrorCustomer.textContent = err.message;
    loginErrorCustomer.hidden = false;
  }
});