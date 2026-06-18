/**
 * script.js (Marketing-Homepage)
 * ANFORDERUNGEN ERFÜLLT: M2, M4, M7
 * 
 * M2: Frontend in HTML5, CSS, JavaScript (index.html, style.css, script.js)
 * M4: Asynchrone Datenübertragung - alle fetch() sind async, nutzen await
 * M7: Frontend konsumiert GET /api/packages und GET /api/session Endpoints
 *
 * Diese Seite ist eine reine Marketing-Landingpage.
 * Bestell-/Tracking-/Chat-System lebt auf dashboard.html (dashboard.js).
 * Hier: Mobile-Navigation, Pakete anzeigen (GET /api/packages),
 * Login-Status für Navbar + CTA-Links (GET /api/session).
 * ----------------------------------------------------------------------
 */

const API_BASE = "";

// ---- Mobile-Navigation (Hamburger-Menue) -----------------------------------

const navToggle = document.getElementById("nav-toggle");
const mainNav = document.getElementById("main-nav");

navToggle.addEventListener("click", () => {
  const isOpen = mainNav.classList.toggle("is-open");
  navToggle.setAttribute("aria-expanded", String(isOpen));
});

mainNav.querySelectorAll("a").forEach((link) => {
  link.addEventListener("click", () => {
    mainNav.classList.remove("is-open");
    navToggle.setAttribute("aria-expanded", "false");
  });
});

// M4: async/await Pattern | M7: GET /api/session + POST /api/logout
// ============================================================================
// LOGIN-STATUS: Navbar (oben rechts) + Ziel der CTA-Buttons/Links
// ============================================================================

const navAuth = document.getElementById("nav-auth");
const navOrderLink = document.getElementById("nav-order-link");
const heroOrderBtn = document.getElementById("hero-order-btn");
const heroTrackBtn = document.getElementById("hero-track-btn");

let isLoggedInCustomer = false;

// Eingeloggt -> direkt ins Dashboard. Nicht eingeloggt -> erst einloggen.
// packageId optional: wird durchgereicht, damit das Paket auf der
// naechsten Seite (bzw. nach dem Login) gleich vorausgewaehlt ist.
function appLink(packageId) {
  const suffix = packageId ? `?package=${encodeURIComponent(packageId)}` : "";
  return isLoggedInCustomer ? `dashboard.html${suffix}` : `login.html${suffix}`;
}

function applyAppLinks() {
  navOrderLink.setAttribute("href", appLink());
  heroOrderBtn.setAttribute("href", appLink());
  heroTrackBtn.setAttribute("href", appLink());
}

// M7: GET /api/session (M9 Session-Check) | M4: await fetch()
async function checkSession() {
  try {
    // M4: await fetch() - asynchrone Datenübertragung
    const res = await fetch(`${API_BASE}/api/session`);
    const data = await res.json();
    isLoggedInCustomer = Boolean(data.loggedIn && data.role === "customer");

    if (isLoggedInCustomer) {
      navAuth.innerHTML = `
        <span class="nav-auth__name">Hi, ${data.username}</span>
        <button type="button" class="nav-auth__logout" id="nav-logout-btn">Log out</button>
      `;
      document.getElementById("nav-logout-btn").addEventListener("click", async () => {
        // M7: POST /api/logout | M4: await fetch()
        await fetch(`${API_BASE}/api/logout`, { method: "POST" });
        window.location.reload();
      });
    } else {
      navAuth.innerHTML = `<a href="login.html" class="nav-auth__link">Log in</a>`;
    }
  } catch (err) {
    isLoggedInCustomer = false;
  } finally {
    applyAppLinks();
  }
}

// M7: GET /api/packages | M4: async/await
// ---- Pakete laden (GET /api/packages) --------------------------------------

const packageGrid = document.getElementById("package-grid");

async function loadPackages() {
  try {
    // M4: await fetch() - asynchrone Datenübertragung
    // M7: GET Ressource konsumieren (Pakete mit umgerechneten Preisen)
    const res = await fetch(`${API_BASE}/api/packages`);
    if (!res.ok) throw new Error(`Server antwortete mit Status ${res.status}`);
    const data = await res.json();
    renderPackages(data.packages);
  } catch (err) {
    packageGrid.innerHTML = `<p class="muted center">Pakete konnten nicht geladen werden (${err.message}).</p>`;
  }
}

function renderPackages(packages) {
  packageGrid.innerHTML = packages
    .map((pkg, index) => {
      const featured = index === 1 ? " package-card--featured" : "";
      const converted =
        pkg.prices && pkg.prices.USD !== null
          ? `≈ $${pkg.prices.USD} · £${pkg.prices.GBP} · CHF ${pkg.prices.CHF}`
          : "live conversion unavailable right now";

      return `
        <article class="package-card${featured}">
          <p class="package-card__name">${pkg.name}</p>
          <p class="package-card__tagline">${pkg.tagline}</p>
          <p class="package-card__price">€${pkg.priceEUR}<small> one-time</small></p>
          <p class="package-card__converted">${converted}</p>
          <ul class="package-card__features">
            ${pkg.features.map((f) => `<li>${f}</li>`).join("")}
          </ul>
          <a href="${appLink(pkg.id)}" class="btn btn--ghost btn--full">Choose ${pkg.name}</a>
        </article>
      `;
    })
    .join("");
}

// Erst den Login-Status klaeren, DANN die Pakete rendern - sonst wuerden
// die "Choose X"-Links kurz auf login.html zeigen, auch wenn man schon
// eingeloggt ist.
checkSession().then(loadPackages);