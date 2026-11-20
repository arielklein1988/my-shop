// מנעילת סכום מול טרנזילה (Handshake V2), כדי שלקוח לא יוכל לשנות את הסכום בדפדפן.
// נדרש: מודול Token בחשבון טרנזילה + הפעלת Handshake בהגדרות ה-iFrame של המסוף.
//
// משתני סביבה (Netlify > Site configuration > Environment variables):
//   TRANZILA_APP_KEY  - המפתח הציבורי של האפליקציה
//   TRANZILA_SECRET   - המפתח הפרטי (סודי, לא בקוד ולא ב-GitHub)
// שם המסוף נלקח מ-data/site.json (tranzilaTerminal) או ממשתנה TRANZILA_TERMINAL.
//
// הסכום מחושב כאן מהקטלוג (data/site.json), ולא מהסכום שהדפדפן שולח.

const crypto = require("crypto");

const json = (statusCode, obj) => ({
  statusCode,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(obj)
});

// כתובת האתר שלכם כפי ש-Netlify מספק. בכוונה לא נלקחת מכותרת Host של הבקשה
// (אפשר לזייף אותה ולהחזיר קטלוג עם מחירים אחרים).
const siteUrl = () => process.env.DEPLOY_PRIME_URL || process.env.URL;

function computeSum(S, cart) {
  const byId = {};
  (S.products || []).forEach((p) => { byId[String(p.id || p.name)] = p; });
  if (!Array.isArray(cart) || !cart.length || cart.length > 50) throw new Error("עגלה לא תקינה");

  let sub = 0;
  for (const i of cart) {
    const p = byId[String(i.id)];
    const qty = Number(i.qty);
    if (!p || !Number.isInteger(qty) || qty < 1 || qty > 99) throw new Error("מוצר לא תקין בעגלה");
    if (Array.isArray(p.options) && p.options.length && !p.options.includes(i.opt)) throw new Error("אפשרות לא תקינה");
    sub += Number(p.price) * qty;
  }
  const sh = S.shipping;
  const ship = sh && !(sh.freeOver && sub >= sh.freeOver) ? Number(sh.price || 0) : 0;
  return Math.round((sub + ship) * 100) / 100;
}

function authHeaders(appKey, secret) {
  const time = String(Math.floor(Date.now() / 1000));
  const nonce = crypto.randomBytes(20).toString("hex"); // 40 תווים
  // לפי התיעוד: HMAC-SHA256 על המפתח הציבורי, עם מפתח = סוד + זמן + nonce
  const token = crypto.createHmac("sha256", secret + time + nonce).update(appKey).digest("hex");
  return {
    "Content-Type": "application/json",
    "X-tranzila-api-app-key": appKey,
    "X-tranzila-api-request-time": time,
    "X-tranzila-api-nonce": nonce,
    "X-tranzila-api-access-token": token
  };
}

exports.computeSum = computeSum;
exports.authHeaders = authHeaders;

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });

  const appKey = process.env.TRANZILA_APP_KEY;
  const secret = process.env.TRANZILA_SECRET;
  if (!appKey || !secret) return json(500, { error: "חסרים TRANZILA_APP_KEY / TRANZILA_SECRET ב-Netlify" });

  try {
    const { cart } = JSON.parse(event.body || "{}");

    const res = await fetch(siteUrl() + "/data/site.json", { headers: { "Cache-Control": "no-cache" } });
    if (!res.ok) throw new Error("לא ניתן לטעון את הקטלוג");
    const S = await res.json();

    const terminal = process.env.TRANZILA_TERMINAL || S.tranzilaTerminal;
    if (!terminal) throw new Error("חסר שם מסוף טרנזילה");

    const sum = computeSum(S, cart);
    const r = await fetch("https://api.tranzila.com/v2/handshake/create", {
      method: "POST",
      headers: authHeaders(appKey, secret),
      body: JSON.stringify({ terminal_name: terminal, sum })
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.error_code !== 0 || !j.thtk) {
      console.error("Tranzila handshake failed", r.status, j);
      return json(502, { error: "נכשלה יצירת תשלום מול טרנזילה" });
    }
    return json(200, { sum, thtk: j.thtk });
  } catch (err) {
    console.error(err);
    return json(400, { error: err.message });
  }
};
