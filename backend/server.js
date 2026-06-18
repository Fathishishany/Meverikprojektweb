/**
 * server.js
 * ----------------------------------------------------------------------
 * Meverik Backend (BE).
 * ----------------------------------------------------------------------
 */

require("dotenv").config();

const express = require("express");
const session = require("express-session");
const bcrypt = require("bcryptjs");
const path = require("path");

const db = require("./db");
const external = require("./external");
const { sendData } = require("./xml");

const app = express();
const PORT = process.env.PORT || 3000;

// Wichtig fuer Railway (laeuft hinter einem Reverse-Proxy): ohne das
// wuerde req.protocol immer "http" zurueckgeben, auch wenn die Seite
// per https aufgerufen wird - das wuerde Stripe-Redirect-URLs falsch
// machen.
app.set("trust proxy", 1);

// Stripe nur initialisieren, wenn ein Key gesetzt ist. Ohne diesen Schutz
// wuerde ein fehlender STRIPE_SECRET_KEY den GESAMTEN Server beim Start
// crashen lassen (nicht nur die Bezahlfunktion).
const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
const stripe = stripeSecretKey ? require("stripe")(stripeSecretKey) : null;

app.use(express.json());

app.use(
  session({
    secret: "meverik-uni-projekt-secret-key",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: false,
      maxAge: 1000 * 60 * 60 * 4,
    },
  })
);

// Nur fuer eingeloggte ADMINS
function requireAuth(req, res, next) {
  if (req.session && req.session.userId && req.session.role === "admin") {
    return next();
  }
  res.status(401);
  return sendData(req, res, { error: "Nicht eingeloggt." }, "error");
}

// Fuer eingeloggte Admins ODER eingeloggte Kunden (z.B. Ticket erstellen)
function requireAnyAuth(req, res, next) {
  if (req.session && req.session.userId && (req.session.role === "admin" || req.session.role === "customer")) {
    return next();
  }
  res.status(401);
  return sendData(req, res, { error: "Bitte einloggen oder registrieren, um ein Ticket zu erstellen." }, "error");
}

// Darf diese Session auf dieses Ticket zugreifen? Admin: immer.
// Kunde: nur sein eigenes Ticket (customerId muss zur Session passen).
function canAccessTicket(req, ticket) {
  if (req.session.role === "admin") return true;
  if (req.session.role === "customer") return ticket.customerId === req.session.userId;
  return false;
}

app.use("/customer", express.static(path.join(__dirname, "../frontend/customer")));
app.use("/admin", express.static(path.join(__dirname, "../frontend/admin")));
app.get("/", (req, res) => res.redirect("/customer/index.html"));

// =======================================================================
// API ROUTEN - HTTP Methoden (M6), Externe APIs (M8/S1/C1), XML/JSON (M5/C2)
// =======================================================================

// M6: GET Methode | M5: JSON+XML via sendData | M8/S1/C1: externe API (Frankfurter)
app.get("/api/packages", async (req, res) => {
  const packages = db.getAllPackages();

  const withPrices = await Promise.all(
    packages.map(async (pkg) => ({
      ...pkg,
      prices: await external.convertPrice(pkg.priceEUR),
    }))
  );

  sendData(req, res, { packages: withPrices }, "packages");
});

/**
 * POST /api/tickets - M6: POST Methode | M8/S1/C1: externe APIs
 * Nutzt 2 externe Services (ipapi.co, QR-Server), plus Frankfurter API
 * Jetzt NUR fuer eingeloggte Kunden ODER Admins (requireAnyAuth).
 */
app.post("/api/tickets", requireAnyAuth, async (req, res) => {
  const { customerName, email, businessName, packageId, message } = req.body;

  if (!customerName || !email || !businessName || !packageId) {
    res.status(400);
    return sendData(
      req,
      res,
      { error: "customerName, email, businessName und packageId sind Pflichtfelder." },
      "error"
    );
  }

  if (!db.getPackageById(packageId)) {
    res.status(400);
    return sendData(req, res, { error: `Unbekanntes Paket: ${packageId}` }, "error");
  }

  const clientIp = req.headers["x-forwarded-for"] || req.socket.remoteAddress || "";
  const country = await external.lookupCountry(clientIp.replace("::ffff:", ""));

  // Wenn ein KUNDE (nicht Admin) das Ticket erstellt, merken wir uns
  // dessen Account-ID am Ticket - praktisch fuer spaetere Erweiterungen
  // wie "meine Tickets anzeigen".
  const customerId = req.session.role === "customer" ? req.session.userId : null;

  const ticket = db.createTicket({ customerName, email, businessName, packageId, message, country, customerId });

  const trackingText = `Meverik Ticket ${ticket.id} - Status pruefen auf /customer/dashboard.html?ticket=${ticket.id}`;
  const qrCodeDataUrl = await external.generateQrCode(trackingText);
  const finalTicket = db.patchTicket(ticket.id, { qrCodeDataUrl });

  res.status(201);
  sendData(req, res, { ticket: finalTicket }, "ticket");
});

/**
 * GET /api/tickets/mine
 * Nur fuer eingeloggte KUNDEN - liefert nur die eigenen Tickets
 * (zur Anzeige der "Meine Tickets"-Liste auf der Kundenseite).
 * WICHTIG: muss VOR "/api/tickets/:id" registriert werden, sonst
 * wuerde Express "mine" faelschlicherweise als :id interpretieren.
 */
app.get("/api/tickets/mine", (req, res) => {
  if (!req.session || req.session.role !== "customer") {
    res.status(401);
    return sendData(req, res, { error: "Nicht als Kunde eingeloggt." }, "error");
  }
  const tickets = db.getTicketsByCustomerId(req.session.userId);
  sendData(req, res, { tickets }, "tickets");
});

app.get("/api/tickets/:id", (req, res) => {
  const ticket = db.getTicketById(req.params.id);
  if (!ticket) {
    res.status(404);
    return sendData(req, res, { error: "Ticket nicht gefunden." }, "error");
  }
  sendData(req, res, { ticket }, "ticket");
});

app.get("/api/tickets", requireAuth, (req, res) => {
  let tickets = db.getAllTickets();
  if (req.query.status) {
    tickets = tickets.filter((t) => t.status === req.query.status);
  }
  sendData(req, res, { tickets }, "tickets");
});

/**
 * GET /api/tickets/:id/messages
 * Chat-Verlauf zu einem Ticket. Nur der Admin oder der Kunde,
 * dem das Ticket gehoert, darf das sehen.
 */
app.get("/api/tickets/:id/messages", requireAnyAuth, (req, res) => {
  const ticket = db.getTicketById(req.params.id);
  if (!ticket) {
    res.status(404);
    return sendData(req, res, { error: "Ticket nicht gefunden." }, "error");
  }
  if (!canAccessTicket(req, ticket)) {
    res.status(403);
    return sendData(req, res, { error: "Kein Zugriff auf dieses Ticket." }, "error");
  }
  sendData(req, res, { messages: ticket.messages || [] }, "messages");
});

/**
 * POST /api/tickets/:id/messages
 * Neue Chat-Nachricht zu einem Ticket hinzufuegen (Kunde <-> Admin).
 */
app.post("/api/tickets/:id/messages", requireAnyAuth, (req, res) => {
  const { text } = req.body;
  if (!text || !text.trim()) {
    res.status(400);
    return sendData(req, res, { error: "Nachricht darf nicht leer sein." }, "error");
  }

  const ticket = db.getTicketById(req.params.id);
  if (!ticket) {
    res.status(404);
    return sendData(req, res, { error: "Ticket nicht gefunden." }, "error");
  }
  if (!canAccessTicket(req, ticket)) {
    res.status(403);
    return sendData(req, res, { error: "Kein Zugriff auf dieses Ticket." }, "error");
  }

  const message = {
    sender: req.session.role, // "admin" oder "customer"
    senderName: req.session.username,
    text: text.trim(),
    createdAt: new Date().toISOString(),
  };

  const updatedTicket = db.addMessageToTicket(req.params.id, message);
  res.status(201);
  sendData(req, res, { messages: updatedTicket.messages }, "messages");
});

/**
 * POST /api/tickets/:id/checkout
 * Erstellt eine Stripe Checkout Session fuer das Paket dieses Tickets
 * und gibt die URL zurueck, zu der der Browser weiterleiten soll.
 */
app.post("/api/tickets/:id/checkout", requireAnyAuth, async (req, res) => {
  if (!stripe) {
    res.status(500);
    return sendData(req, res, { error: "Zahlungen sind aktuell nicht konfiguriert (STRIPE_SECRET_KEY fehlt)." }, "error");
  }

  const ticket = db.getTicketById(req.params.id);
  if (!ticket) {
    res.status(404);
    return sendData(req, res, { error: "Ticket nicht gefunden." }, "error");
  }
  if (!canAccessTicket(req, ticket)) {
    res.status(403);
    return sendData(req, res, { error: "Kein Zugriff auf dieses Ticket." }, "error");
  }
  if (ticket.paid) {
    res.status(400);
    return sendData(req, res, { error: "Dieses Ticket ist bereits bezahlt." }, "error");
  }

  const pkg = db.getPackageById(ticket.packageId);
  if (!pkg) {
    res.status(400);
    return sendData(req, res, { error: `Unbekanntes Paket: ${ticket.packageId}` }, "error");
  }

  const baseUrl = `${req.protocol}://${req.get("host")}`;

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: "eur",
            product_data: { name: `Meverik ${pkg.name} – Ticket ${ticket.id}` },
            unit_amount: pkg.priceEUR * 100,
          },
          quantity: 1,
        },
      ],
      success_url: `${baseUrl}/customer/dashboard.html?ticket=${ticket.id}&payment=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/customer/dashboard.html?ticket=${ticket.id}&payment=cancelled`,
      metadata: { ticketId: ticket.id },
    });

    sendData(req, res, { url: session.url }, "checkout");
  } catch (err) {
    res.status(500);
    sendData(req, res, { error: `Stripe-Fehler: ${err.message}` }, "error");
  }
});

/**
 * GET /api/tickets/:id/confirm-payment?session_id=...
 * Wird aufgerufen, nachdem Stripe den Kunden zur success_url zurueck-
 * geschickt hat. Fragt bei Stripe SELBST nach, ob wirklich bezahlt wurde
 * (nie blind dem Frontend/der URL vertrauen), und markiert das Ticket
 * erst dann als bezahlt.
 */
app.get("/api/tickets/:id/confirm-payment", requireAnyAuth, async (req, res) => {
  if (!stripe) {
    res.status(500);
    return sendData(req, res, { error: "Zahlungen sind aktuell nicht konfiguriert (STRIPE_SECRET_KEY fehlt)." }, "error");
  }

  const ticket = db.getTicketById(req.params.id);
  if (!ticket) {
    res.status(404);
    return sendData(req, res, { error: "Ticket nicht gefunden." }, "error");
  }
  if (!canAccessTicket(req, ticket)) {
    res.status(403);
    return sendData(req, res, { error: "Kein Zugriff auf dieses Ticket." }, "error");
  }

  const sessionId = req.query.session_id;
  if (!sessionId) {
    res.status(400);
    return sendData(req, res, { error: "session_id fehlt." }, "error");
  }

  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    if (session.payment_status === "paid" && session.metadata.ticketId === ticket.id) {
      const updated = db.patchTicket(ticket.id, { paid: true, paidAt: new Date().toISOString() });
      return sendData(req, res, { ticket: updated }, "ticket");
    }

    sendData(req, res, { ticket }, "ticket");
  } catch (err) {
    res.status(500);
    sendData(req, res, { error: `Stripe-Fehler: ${err.message}` }, "error");
  }
});

app.put("/api/tickets/:id", requireAuth, (req, res) => {
  const { customerName, email, businessName, packageId, message, status, country } = req.body;

  if (!customerName || !email || !businessName || !packageId || !status) {
    res.status(400);
    return sendData(req, res, { error: "Es fehlen Pflichtfelder fuer das Update." }, "error");
  }

  const updated = db.replaceTicket(req.params.id, {
    customerName,
    email,
    businessName,
    packageId,
    message,
    status,
    country,
  });

  if (!updated) {
    res.status(404);
    return sendData(req, res, { error: "Ticket nicht gefunden." }, "error");
  }
  sendData(req, res, { ticket: updated }, "ticket");
});

// C3: PATCH Methode | M5: JSON+XML via sendData
app.patch("/api/tickets/:id", requireAuth, (req, res) => {
  const updated = db.patchTicket(req.params.id, req.body);
  if (!updated) {
    res.status(404);
    return sendData(req, res, { error: "Ticket nicht gefunden." }, "error");
  }
  sendData(req, res, { ticket: updated }, "ticket");
});

// M6: DELETE Methode | M5: JSON+XML via sendData
app.delete("/api/tickets/:id", requireAuth, (req, res) => {
  const success = db.deleteTicket(req.params.id);
  if (!success) {
    res.status(404);
    return sendData(req, res, { error: "Ticket nicht gefunden." }, "error");
  }
  sendData(req, res, { deleted: true, id: req.params.id }, "result");
});

/**
 * M9: Session Management - POST /api/login (Admin-Login)
 * M9: Session Management - POST /api/register (Kunden-Registrierung)
 * M9: Session Management - GET /api/session (Session-Check)
 * M9: Session Management - POST /api/logout (Logout)
 */

// M9: LOGIN - ADMIN
app.post("/api/login", (req, res) => {
  const { username, password } = req.body;
  const admin = db.findAdminByUsername(username);

  if (!admin || !bcrypt.compareSync(password || "", admin.passwordHash)) {
    res.status(401);
    return sendData(req, res, { error: "Benutzername oder Passwort falsch." }, "error");
  }

  req.session.userId = admin.id;
  req.session.username = admin.username;
  req.session.role = "admin";
  sendData(req, res, { success: true, username: admin.username }, "result");
});

// M9: REGISTER - Kunden-Account anlegen + direkt einloggen
app.post("/api/register", (req, res) => {
  const { name, email, password } = req.body;

  if (!name || !email || !password) {
    res.status(400);
    return sendData(req, res, { error: "name, email und password sind Pflichtfelder." }, "error");
  }

  if (db.findCustomerByEmail(email)) {
    res.status(400);
    return sendData(req, res, { error: "Diese Email ist schon registriert." }, "error");
  }

  const passwordHash = bcrypt.hashSync(password, 10);
  const customer = db.createCustomer({ name, email, passwordHash });

  req.session.userId = customer.id;
  req.session.username = customer.name;
  req.session.role = "customer";

  res.status(201);
  sendData(req, res, { success: true, username: customer.name }, "result");
});

// M9: CUSTOMER-LOGIN - Kunden-Login per Email + Passwort
app.post("/api/customer-login", (req, res) => {
  const { email, password } = req.body;
  const customer = db.findCustomerByEmail(email);

  if (!customer || !bcrypt.compareSync(password || "", customer.passwordHash)) {
    res.status(401);
    return sendData(req, res, { error: "Email oder Passwort falsch." }, "error");
  }

  req.session.userId = customer.id;
  req.session.username = customer.name;
  req.session.role = "customer";
  sendData(req, res, { success: true, username: customer.name }, "result");
});

/**
 * POST /api/logout - funktioniert fuer Admin UND Kunde gleich (zerstoert einfach die Session)
 */
// M9: LOGOUT - Session zerstören
app.post("/api/logout", (req, res) => {
  req.session.destroy(() => {
    sendData(req, res, { success: true }, "result");
  });
});

// M9: SESSION-CHECK - Liefert Login-Status und Rolle ("admin" oder "customer")
app.get("/api/session", (req, res) => {
  if (req.session && req.session.userId) {
    sendData(req, res, { loggedIn: true, username: req.session.username, role: req.session.role }, "session");
  } else {
    sendData(req, res, { loggedIn: false }, "session");
  }
});

app.listen(PORT, () => {
  console.log(`Meverik Backend laeuft auf http://localhost:${PORT}`);
  console.log(`  Kunden-Seite: http://localhost:${PORT}/customer/index.html`);
  console.log(`  Admin-Dashboard: http://localhost:${PORT}/admin/admin.html`);
});