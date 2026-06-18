/**
 * xml.js
 * ANFORDERUNGEN ERFÜLLT: M5, C2
 * 
 * M5: Endpunkte liefern JSON ODER XML (default: JSON, auf Anfrage: XML)
 * C2: Endpunkte können BEIDES: JSON und XML (Content Negotiation via ?format=xml)
 *
 * Wir bauen das als "Content Negotiation": der Client sagt uns per
 * Header (Accept: application/xml) oder per Query-Parameter
 * (?format=xml), welches Format er haben will - der Server liefert
 * standardmaessig JSON, kann aber auf Wunsch dieselben Daten als
 * XML ausgeben.
 *
 * Dafuer brauchen wir keine externe Bibliothek: ein JSON-Objekt
 * lässt sich mit ein paar Zeilen rekursiv in XML uebersetzen.
 * ----------------------------------------------------------------------
 */

function escapeXml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Wandelt einen beliebigen JS-Wert (Objekt, Array, primitiver Wert)
 * in einen XML-Bruchstueck-String um. tagName ist der Name, unter dem
 * der Wert eingepackt wird (z.B. <ticket>...</ticket>).
 */
function valueToXml(value, tagName) {
  if (value === null || value === undefined) {
    return `<${tagName}/>`;
  }

  if (Array.isArray(value)) {
    // Jeden Eintrag eines Arrays als eigenes <item> in das umschliessende Tag packen
    const items = value.map((entry) => valueToXml(entry, "item")).join("");
    return `<${tagName}>${items}</${tagName}>`;
  }

  if (typeof value === "object") {
    const inner = Object.entries(value)
      .map(([key, val]) => valueToXml(val, key))
      .join("");
    return `<${tagName}>${inner}</${tagName}>`;
  }

  // Primitive Werte (string, number, boolean)
  return `<${tagName}>${escapeXml(value)}</${tagName}>`;
}

function toXml(data, rootName = "response") {
  const body = valueToXml(data, rootName);
  return `<?xml version="1.0" encoding="UTF-8"?>\n${body}`;
}

/**
 * sendData() ist die zentrale Stelle, die wir in JEDEM Endpunkt
 * statt res.json(...) aufrufen. Sie entscheidet anhand vom
 * "format" Query-Parameter (oder vom Accept-Header), ob JSON
 * oder XML zurueckgegeben wird.
 */
function sendData(req, res, data, rootName = "response") {
  const accept = req.headers.accept || "";
  const wantsXml =
    req.query.format === "xml" ||
    (accept.includes("application/xml") && !accept.includes("text/html"));

  if (wantsXml) {
    // Unsere JSON-Antworten sehen meist so aus: { ticket: {...} } oder
    // { packages: [...] }. Wenn wir das 1:1 in XML uebersetzen wuerden,
    // bekaemen wir ein doppeltes Tag: <ticket><ticket>...</ticket></ticket>.
    // Deshalb: wenn das Objekt genau EIN Feld hat und dessen Name exakt
    // dem rootName entspricht, "entpacken" wir es vorher einmal.
    let xmlPayload = data;
    const keys = data && typeof data === "object" && !Array.isArray(data) ? Object.keys(data) : [];
    if (keys.length === 1 && keys[0] === rootName) {
      xmlPayload = data[rootName];
    }
    res.type("application/xml").send(toXml(xmlPayload, rootName));
  } else {
    res.json(data);
  }
}

module.exports = { toXml, sendData };