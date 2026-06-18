/**
 * external.js
 * ANFORDERUNGEN ERFÜLLT: M8, S1, C1
 * 
 * M8: Das System konsumiert mindestens 1 externe REST API ✓ (haben 3)
 * S1: Das System konsumiert mindestens 2 externe REST APIs ✓ (haben 3)
 * C1: Das System konsumiert mindestens 3 externe REST APIs ✓ (alle 3 hier)
 * 
 * Hier rufen wir die externen REST-Services auf, die unser System
 * "konsumiert". Alle drei brauchen keinen API-Key,
 * das macht sie super geeignet fuer ein Uni-Projekt - kein Key-Management,
 * keine Kosten, jede/r im Team kann den Code 1:1 nachvollziehen.
 *
 *   1) Frankfurter API   -> aktuelle Wechselkurse (EUR -> USD/GBP/CHF)
 *      https://www.frankfurter.app
 *
 *   2) ipapi.co          -> Geolocation: aus welchem Land kommt der
 *      Kunde (anhand seiner IP-Adresse)?
 *
 *   3) goqr.me / QR Server API -> erzeugt uns als Bild einen QR-Code,
 *      mit dem der Kunde seinen Ticket-Status scannen kann.
 *
 * Jede Funktion ist in try/catch gewrappt: faellt ein externer Service
 * mal kurz aus, soll unser eigenes System trotzdem weiterlaufen
 * (einfach mit einem Fallback-Wert statt mit einem Crash).
 * ----------------------------------------------------------------------
 */

const FRANKFURTER_URL = "https://api.frankfurter.app/latest?from=EUR&to=USD,GBP,CHF";

/**
 * 1) Externer Service: Waehrungsrechner
 * Holt aktuelle Kurse und rechnet einen EUR-Preis in USD/GBP/CHF um.
 */
async function convertPrice(priceEUR) {
  try {
    const res = await fetch(FRANKFURTER_URL);
    if (!res.ok) throw new Error(`Frankfurter API status ${res.status}`);
    const data = await res.json(); // { amount, base, date, rates: { USD, GBP, CHF } }

    const rates = data.rates;
    return {
      EUR: priceEUR,
      USD: Math.round(priceEUR * rates.USD * 100) / 100,
      GBP: Math.round(priceEUR * rates.GBP * 100) / 100,
      CHF: Math.round(priceEUR * rates.CHF * 100) / 100,
    };
  } catch (err) {
    console.warn("[external] Waehrungs-API nicht erreichbar:", err.message);
    // Fallback: wir zeigen wenigstens den EUR-Preis weiter an
    return { EUR: priceEUR, USD: null, GBP: null, CHF: null };
  }
}

/**
 * 2) Externer Service: IP-Geolocation
 * Findet anhand der IP-Adresse heraus, aus welchem Land die Anfrage kommt.
 * Bei localhost/Test-IPs (z.B. ::1 oder 127.0.0.1) liefert der Dienst
 * keine sinnvollen Daten - das fangen wir ab.
 */
async function lookupCountry(ip) {
  const isLocal =
    !ip || ip === "::1" || ip === "127.0.0.1" || ip.startsWith("192.168.") || ip.startsWith("10.");

  if (isLocal) {
    return "Lokal / Unbekannt";
  }

  try {
    const res = await fetch(`https://ipapi.co/${ip}/json/`);
    if (!res.ok) throw new Error(`ipapi.co status ${res.status}`);
    const data = await res.json();
    if (data.error) throw new Error(data.reason || "ipapi.co Fehler");
    return data.country_name || "Unbekannt";
  } catch (err) {
    console.warn("[external] Geolocation-API nicht erreichbar:", err.message);
    return "Unbekannt";
  }
}

/**
 * 3) Externer Service: QR-Code-Generator
 * Baut aus dem Ticket-Tracking-Link ein QR-Code-Bild und liefert es
 * als Base64 Data-URL zurueck, damit das Frontend es direkt in einem
 * <img src="..."> anzeigen kann, ohne nochmal selbst nachzufragen.
 */
async function generateQrCode(trackingText) {
  const url = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(
    trackingText
  )}`;

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`QR-Server status ${res.status}`);
    const arrayBuffer = await res.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString("base64");
    return `data:image/png;base64,${base64}`;
  } catch (err) {
    console.warn("[external] QR-Code-API nicht erreichbar:", err.message);
    return null;
  }
}

module.exports = { convertPrice, lookupCountry, generateQrCode };