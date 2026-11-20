// חוזר מעמוד התשלום של טרנזילה (success / fail).
// טרנזילה מחזירה את הלקוח בבקשת POST, ואתר סטטי ב-Netlify לא יכול לקבל POST,
// לכן הפונקציה הזו מקבלת אותו ומפנה (302) לדף result.html.
// שימו לב: זו הודעה ללקוח בלבד. אישור התשלום האמיתי הוא ב-MY.TRANZILA.

exports.handler = async (event) => {
  const query = event.queryStringParameters || {};
  let body = {};
  if (event.body) {
    const raw = event.isBase64Encoded ? Buffer.from(event.body, "base64").toString("utf8") : event.body;
    body = Object.fromEntries(new URLSearchParams(raw));
  }

  // Response=000 הוא קוד אישור של טרנזילה. אם הוא חסר נסמכים על הכתובת שהאתר שלח.
  const code = body.Response || query.Response;
  const ok = query.status === "ok" && (code === undefined || code === "000");

  const cid = String(query.cid || "shop").replace(/[^\w-]/g, "");
  return {
    statusCode: 302,
    headers: { Location: "/result.html?status=" + (ok ? "ok" : "fail") + "&cid=" + cid },
    body: ""
  };
};
