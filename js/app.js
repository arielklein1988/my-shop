/* =====================================================
   מנוע החנות - לא צריך לגעת בקובץ הזה.
   כל התוכן, העיצוב והמוצרים נמצאים בקובץ התבנית (templates/*.js)
   ===================================================== */
(function () {
  "use strict";

  fetch("data/site.json", { cache: "no-cache" })
    .then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(start)
    .catch((e) => { document.body.textContent = "לא ניתן לטעון את data/site.json (" + e.message + ")"; });

  function start(S) {

  /* ---------- ברירות מחדל לטקסטים (אפשר לדרוס ב-ui בתבנית) ---------- */
  const UI = Object.assign({
    products: "המוצרים", allCategories: "הכל", add: "הוספה לעגלה", added: "נוסף לעגלה ✓",
    cart: "העגלה", empty: "העגלה ריקה", subtotal: "סכום ביניים", shipping: "משלוח", free: "חינם",
    total: "סה״כ", checkout: "המשך להזמנה", back: "חזרה לעגלה", name: "שם מלא", phone: "טלפון",
    address: "כתובת למשלוח", notes: "הערות (לא חובה)", send: "שליחת הזמנה", sending: "שולח…",
    thanksTitle: "תודה על ההזמנה!", thanksText: "נחזור אליך בהקדם.",
    error: "משהו השתבש. נסו שוב או צרו קשר.", option: "בחירה", close: "סגירה",
    contact: "יצירת קשר", faq: "שאלות נפוצות", remove: "הסרה",
    freeOverHint: "משלוח חינם בהזמנה מעל {amount}", waHello: "היי, אני רוצה להזמין:",
    pay: "מעבר לתשלום מאובטח", email: "אימייל", city: "עיר", zip: "מיקוד (לא חובה)",
    payNote: "התשלום מתבצע בעמוד מאובטח של טרנזילה. פרטי האשראי לא נשמרים באתר."
  }, S.ui);

  const PAY = S.checkout === "tranzila";
  const needAddr = PAY || S.askAddress !== false;
  const CURRENCY_CODES = { ILS: 1, USD: 2, EUR: 978, GBP: 826 };
  const hasOpts = (p) => Array.isArray(p.options) && p.options.length > 0;

  const C = S.contact || {};
  const KEY = "cart-" + (S.id || "shop");
  const $ = (sel, el) => (el || document).querySelector(sel);
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fmt = new Intl.NumberFormat(S.locale || "he-IL", {
    style: "currency", currency: S.currency || "ILS",
    minimumFractionDigits: 0, maximumFractionDigits: 2
  });
  const money = (n) => fmt.format(n);
  // גרסה נקייה לשליחה (הודעות והזמנות): בלי תווי כיווניות ובלי רווח קשיח
  const plain = (n) => money(n).replace(/[‎‏]/g, "").replace(/ /g, " ");

  /* ---------- מוצרים ---------- */
  const products = S.products || [];
  const byId = {};
  products.forEach((p) => { p.id = String(p.id || p.name); byId[p.id] = p; });

  /* ---------- עיצוב ---------- */
  function applyTheme() {
    const t = S.theme || {};
    const root = document.documentElement;
    const vars = {
      bg: "--bg", text: "--text", muted: "--muted", card: "--card", border: "--border",
      primary: "--primary", primaryText: "--primary-text", accent: "--accent",
      radius: "--radius", heroBg: "--hero-bg", heroText: "--hero-text"
    };
    Object.keys(vars).forEach((k) => { if (t[k]) root.style.setProperty(vars[k], t[k]); });
    if (t.font) {
      root.style.setProperty("--font", '"' + t.font + '", system-ui, sans-serif');
      const l = document.createElement("link");
      l.rel = "stylesheet";
      l.href = "https://fonts.googleapis.com/css2?family=" + encodeURIComponent(t.font) + ":wght@400;500;600;800&display=swap";
      document.head.appendChild(l);
    }
    root.lang = S.lang || "he";
    root.dir = S.dir || "rtl";
    document.title = S.name + (S.tagline ? " | " + S.tagline : "");
    if (S.description) {
      let m = $('meta[name="description"]');
      if (!m) { m = document.createElement("meta"); m.name = "description"; document.head.appendChild(m); }
      m.content = S.description;
    }
  }

  /* ---------- עגלה ---------- */
  const key = (i) => i.id + "|" + (i.opt || "");
  let cart = (function () {
    try { return (JSON.parse(localStorage.getItem(KEY)) || []).filter((i) => byId[i.id]); }
    catch (e) { return []; }
  })();
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(cart)); } catch (e) {} };

  function totals() {
    const sub = cart.reduce((s, i) => s + byId[i.id].price * i.qty, 0);
    const sh = S.shipping;
    let ship = 0;
    if (sh && sub > 0) ship = sh.freeOver && sub >= sh.freeOver ? 0 : (sh.price || 0);
    return { sub: sub, ship: ship, total: sub + ship };
  }

  function addToCart(id, opt) {
    const found = cart.find((i) => i.id === id && (i.opt || "") === (opt || ""));
    if (found) found.qty++; else cart.push({ id: id, opt: opt || "", qty: 1 });
    save(); updateCount(); toast(UI.added);
  }

  function changeQty(k, delta) {
    const i = cart.find((x) => key(x) === k);
    if (!i) return;
    i.qty += delta;
    if (i.qty <= 0) cart = cart.filter((x) => x !== i);
    save(); updateCount(); renderCart();
  }

  function updateCount() {
    const n = cart.reduce((s, i) => s + i.qty, 0);
    const el = $("#count");
    el.textContent = n;
    el.hidden = n === 0;
  }

  let tt;
  function toast(msg) {
    const t = $("#toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(tt);
    tt = setTimeout(() => t.classList.remove("show"), 1800);
  }

  /* ---------- בניית HTML ---------- */
  const media = (p) => p.image
    ? '<img src="' + esc(p.image) + '" alt="' + esc(p.name) + '" loading="lazy">'
    : '<div class="ph"' + (p.color ? ' style="background:' + esc(p.color) + '"' : "") + ">" + esc(p.emoji || "🛍️") + "</div>";

  const priceHtml = (p) => "<b>" + money(p.price) + "</b>" + (p.oldPrice ? "<s>" + money(p.oldPrice) + "</s>" : "");

  const cardHtml = (p) => `
    <article class="card">
      <button class="media" data-act="open" data-id="${esc(p.id)}" aria-label="${esc(p.name)}">
        ${media(p)}${p.badge ? '<span class="badge">' + esc(p.badge) + "</span>" : ""}
      </button>
      <div class="info">
        <h3>${esc(p.name)}</h3>
        <div class="price">${priceHtml(p)}</div>
        <button class="btn" data-act="${hasOpts(p) ? "open" : "add"}" data-id="${esc(p.id)}">${UI.add}</button>
      </div>
    </article>`;

  const categories = Array.from(new Set(products.map((p) => p.category).filter(Boolean)));
  let filter = "";

  function renderGrid() {
    const list = filter ? products.filter((p) => p.category === filter) : products;
    $("#grid").innerHTML = list.map(cardHtml).join("");
    document.querySelectorAll(".chip").forEach((c) => c.classList.toggle("on", c.dataset.cat === filter));
  }

  function render() {
    const h = S.hero || {};
    const heroStyle = h.image
      ? ' style="background-image:linear-gradient(rgba(0,0,0,.45),rgba(0,0,0,.45)),url(' + esc(h.image) + ')"' : "";
    const nav = [
      '<a href="#products">' + esc(UI.products) + "</a>",
      S.about ? '<a href="#about">' + esc(S.about.title || "") + "</a>" : "",
      (S.faq || []).length ? '<a href="#faq">' + esc(UI.faq) + "</a>" : "",
      '<a href="#contact">' + esc(UI.contact) + "</a>"
    ].join("");

    $("#app").innerHTML = `
      <header class="top"><div class="wrap bar">
        <a class="brand" href="#top">${esc(S.logo || "")} ${esc(S.name)}</a>
        <nav class="nav">${nav}</nav>
        <button class="cartbtn" data-act="cart" aria-label="${esc(UI.cart)}">🛒<span id="count" hidden>0</span></button>
      </div></header>

      <main id="top">
        <section class="hero"${heroStyle}><div class="wrap">
          <h1>${esc(h.title || S.name)}</h1>
          ${h.subtitle ? "<p>" + esc(h.subtitle) + "</p>" : ""}
          <a class="btn auto" href="#products">${esc(h.cta || UI.products)}</a>
        </div></section>

        <section id="products"><div class="wrap">
          <h2>${esc(UI.products)}</h2>
          ${categories.length > 1 ? '<div class="chips">'
            + '<button class="chip on" data-act="filter" data-cat="">' + esc(UI.allCategories) + "</button>"
            + categories.map((c) => '<button class="chip" data-act="filter" data-cat="' + esc(c) + '">' + esc(c) + "</button>").join("")
            + "</div>" : ""}
          <div class="grid" id="grid"></div>
        </div></section>

        ${(S.features || []).length ? `<section class="features"><div class="wrap"><div class="feat-grid">
          ${S.features.map((f) => '<div class="feat"><div class="ic">' + esc(f.icon) + "</div><h3>" + esc(f.title) + "</h3><p>" + esc(f.text) + "</p></div>").join("")}
        </div></div></section>` : ""}

        ${S.about ? `<section class="about" id="about"><div class="wrap">
          <h2>${esc(S.about.title)}</h2><p>${esc(S.about.text)}</p>
        </div></section>` : ""}

        ${(S.faq || []).length ? `<section class="faq" id="faq"><div class="wrap">
          <h2>${esc(UI.faq)}</h2>
          ${S.faq.map((f) => "<details><summary>" + esc(f.q) + "</summary><p>" + esc(f.a) + "</p></details>").join("")}
        </div></section>` : ""}
      </main>

      <footer id="contact"><div class="wrap">
        <strong>${esc(S.name)}</strong>
        <div class="links">
          ${C.whatsapp ? '<a href="https://wa.me/' + esc(C.whatsapp) + '" target="_blank" rel="noopener">WhatsApp</a>' : ""}
          ${C.phone ? '<a href="tel:' + esc(C.phone) + '">' + esc(C.phone) + "</a>" : ""}
          ${C.email ? '<a href="mailto:' + esc(C.email) + '">' + esc(C.email) + "</a>" : ""}
          ${C.instagram ? '<a href="https://instagram.com/' + esc(C.instagram) + '" target="_blank" rel="noopener">Instagram</a>' : ""}
        </div>
        ${C.address ? "<div>" + esc(C.address) + "</div>" : ""}
        <div>© ${new Date().getFullYear()} ${esc(S.name)}</div>
      </div></footer>

      ${C.whatsapp ? '<a class="wa" href="https://wa.me/' + esc(C.whatsapp) + '" target="_blank" rel="noopener" aria-label="WhatsApp">💬</a>' : ""}
      <div id="toast" role="status"></div>

      <dialog id="pdlg"><div class="dbox">
        <div class="dhead"><span></span><button class="x" data-act="close" aria-label="${esc(UI.close)}">✕</button></div>
        <div id="pbody"></div>
      </div></dialog>

      <dialog id="cdlg"><div class="dbox">
        <div class="dhead"><h2>${esc(UI.cart)}</h2><button class="x" data-act="close" aria-label="${esc(UI.close)}">✕</button></div>
        <div id="items"></div>
        <div id="csum" class="sum"></div>
        <button class="btn big" id="gocheck" data-act="to-checkout">${esc(UI.checkout)}</button>
        <form id="oform" hidden>
          <label class="field">${esc(UI.name)}<input name="name" required autocomplete="name"></label>
          <label class="field">${esc(UI.phone)}<input name="phone" type="tel" required autocomplete="tel"></label>
          ${PAY ? '<label class="field">' + esc(UI.email) + '<input name="email" type="email" required autocomplete="email"></label>' : ""}
          ${needAddr ? '<label class="field">' + esc(UI.address) + '<input name="address" required autocomplete="street-address"></label>' : ""}
          ${PAY ? '<label class="field">' + esc(UI.city) + '<input name="city" required autocomplete="address-level2"></label>'
            + '<label class="field">' + esc(UI.zip) + '<input name="zip" inputmode="numeric" autocomplete="postal-code"></label>' : ""}
          <label class="field">${esc(UI.notes)}<textarea name="notes"></textarea></label>
          <button class="btn big" type="submit">${esc(PAY ? UI.pay : UI.send)}</button>
          ${PAY ? '<p class="hint">' + esc(UI.payNote) + "</p>" : ""}
          <button class="link" type="button" data-act="to-cart">${esc(UI.back)}</button>
        </form>
        <div id="thanks" class="thanks" hidden>
          <h2>${esc(UI.thanksTitle)}</h2><p>${esc(UI.thanksText)}</p>
          <button class="btn big" style="margin-top:16px" data-act="close">${esc(UI.close)}</button>
        </div>
      </div></dialog>`;
  }

  /* ---------- חלון מוצר ---------- */
  function openProduct(id) {
    const p = byId[id];
    if (!p) return;
    $("#pbody").innerHTML = `
      <div class="pmedia">${media(p)}</div>
      <div class="pinfo">
        <h2>${esc(p.name)}</h2>
        <div class="price">${priceHtml(p)}</div>
        ${p.description ? '<p class="desc">' + esc(p.description) + "</p>" : ""}
        ${hasOpts(p) ? '<label class="field">' + esc(p.optionLabel || UI.option)
          + '<select id="popt">' + p.options.map((o) => "<option>" + esc(o) + "</option>").join("") + "</select></label>" : ""}
        <button class="btn big" data-act="add-modal" data-id="${esc(p.id)}">${esc(UI.add)}</button>
      </div>`;
    $("#pdlg").showModal();
  }

  /* ---------- חלון עגלה ---------- */
  function showStep(step) {
    const has = cart.length > 0;
    const checkout = step === "checkout" && has;
    $("#items").hidden = checkout;
    $("#gocheck").hidden = checkout || !has;
    $("#oform").hidden = !checkout;
    $("#csum").hidden = !has;
    $("#thanks").hidden = true;
  }

  function renderCart() {
    const has = cart.length > 0;
    $("#items").innerHTML = has
      ? '<ul class="lines">' + cart.map((i) => {
          const p = byId[i.id], k = esc(key(i));
          return `<li class="line">
            <div class="thumb">${media(p)}</div>
            <div class="lname"><b>${esc(p.name)}</b>${i.opt ? "<small>" + esc(i.opt) + "</small>" : ""}<span>${money(p.price)}</span></div>
            <div class="qty">
              <button data-act="dec" data-key="${k}" aria-label="-">−</button>
              <span>${i.qty}</span>
              <button data-act="inc" data-key="${k}" aria-label="+">+</button>
            </div></li>`;
        }).join("") + "</ul>"
      : '<p class="empty">' + esc(UI.empty) + "</p>";

    const t = totals();
    const sh = S.shipping;
    $("#csum").innerHTML =
      "<div><span>" + UI.subtotal + "</span><span>" + money(t.sub) + "</span></div>"
      + (sh ? "<div><span>" + UI.shipping + "</span><span>" + (t.ship ? money(t.ship) : UI.free) + "</span></div>" : "")
      + '<div class="total"><span>' + UI.total + "</span><span>" + money(t.total) + "</span></div>"
      + (sh && sh.freeOver && t.ship ? '<p class="hint">' + esc(UI.freeOverHint.replace("{amount}", money(sh.freeOver))) + "</p>" : "");
    showStep("cart");
  }

  /* ---------- שליחת הזמנה ---------- */
  function finish() {
    cart = []; save(); updateCount();
    $("#items").hidden = true; $("#gocheck").hidden = true;
    $("#oform").hidden = true; $("#csum").hidden = true;
    $("#oform").reset();
    $("#thanks").hidden = false;
  }

  /* ---------- סליקה בטרנזילה (DirectNG) ---------- */
  async function payTranzila(f, data, t, orderText) {
    const btn = f.querySelector('button[type="submit"]');
    btn.disabled = true; btn.textContent = UI.sending;
    try {
      if (!S.tranzilaTerminal) throw new Error("חסר שם מסוף טרנזילה (tranzilaTerminal)");

      // 1. שמירת ההזמנה אצל בעל החנות (Netlify Forms). לא חוסם את התשלום אם נכשל.
      await fetch("/", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams(Object.assign({ "form-name": "order" }, data,
          { order: orderText + "\n[ממתין לתשלום בטרנזילה]" })).toString()
      }).catch(() => {});

      // 2. סכום. במצב מאובטח השרת מחשב את הסכום מהקטלוג ומנעל אותו מול טרנזילה (handshake)
      let sum = t.total, thtk = "";
      if (S.secureHandshake) {
        const res = await fetch("/.netlify/functions/handshake", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cart: cart.map((i) => ({ id: i.id, opt: i.opt, qty: i.qty })) })
        });
        const j = await res.json().catch(() => ({}));
        if (!res.ok || !j.thtk) throw new Error(j.error || res.status);
        sum = j.sum; thtk = j.thtk;
      }

      // 3. מעבר לעמוד התשלום של טרנזילה
      const ret = (s) => location.origin + "/.netlify/functions/tranzila-return?status=" + s
        + "&cid=" + encodeURIComponent(S.id || "shop");
      const fields = {
        sum: sum.toFixed(2),
        currency: CURRENCY_CODES[S.currency || "ILS"] || 1,
        tranmode: "A",
        cred_type: 1,
        lang: S.lang === "he" || !S.lang ? "he" : "en",
        contact: data.name, company: data.name, email: data.email, phone: data.phone,
        address: data.address, city: data.city, zip: data.zip, country: "IL",
        pdesc: orderText.replace(/\n/g, "; ").slice(0, 200),
        success_url_address: ret("ok"),
        fail_url_address: ret("fail")
      };
      if (thtk) { fields.thtk = thtk; fields.new_process = 1; }

      const form = document.createElement("form");
      form.method = "POST";
      form.action = "https://directng.tranzila.com/" + encodeURIComponent(S.tranzilaTerminal) + "/iframenew.php";
      Object.keys(fields).forEach((k) => {
        if (fields[k] === "" || fields[k] == null) return;
        const i = document.createElement("input");
        i.type = "hidden"; i.name = k; i.value = fields[k];
        form.appendChild(i);
      });
      document.body.appendChild(form);
      form.submit();
    } catch (err) {
      console.error(err);
      alert(UI.error);
      btn.disabled = false; btn.textContent = UI.pay;
    }
  }

  async function submitOrder(e) {
    e.preventDefault();
    const f = e.target;
    const data = Object.fromEntries(new FormData(f));
    const t = totals();
    const lines = cart.map((i) => {
      const p = byId[i.id];
      return "• " + p.name + (i.opt ? " (" + i.opt + ")" : "") + " × " + i.qty + " — " + plain(p.price * i.qty);
    });
    const orderText = lines.join("\n") + "\n" + UI.total + ": " + plain(t.total);

    if (PAY) {
      await payTranzila(f, data, t, orderText);
    } else if (S.checkout === "form") {
      const btn = f.querySelector('button[type="submit"]');
      btn.disabled = true; btn.textContent = UI.sending;
      try {
        const body = new URLSearchParams(Object.assign({ "form-name": "order" }, data, { order: orderText }));
        const res = await fetch("/", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: body.toString()
        });
        if (!res.ok) throw new Error(res.status);
        finish();
      } catch (err) {
        alert(UI.error);
      }
      btn.disabled = false; btn.textContent = UI.send;
    } else {
      const msg = UI.waHello + "\n" + orderText + "\n\n" + data.name + "\n" + data.phone
        + (data.address ? "\n" + data.address : "") + (data.notes ? "\n" + data.notes : "");
      window.open("https://wa.me/" + C.whatsapp + "?text=" + encodeURIComponent(msg), "_blank");
      finish();
    }
  }

  /* ---------- אירועים ---------- */
  document.addEventListener("click", (e) => {
    const el = e.target.closest("[data-act]");
    if (!el) {
      if (e.target.tagName === "DIALOG") e.target.close(); // לחיצה על הרקע
      return;
    }
    const d = el.dataset;
    switch (d.act) {
      case "open": openProduct(d.id); break;
      case "add": addToCart(d.id); break;
      case "add-modal": {
        const sel = $("#popt");
        addToCart(d.id, sel ? sel.value : "");
        $("#pdlg").close();
        break;
      }
      case "cart": renderCart(); $("#cdlg").showModal(); break;
      case "close": el.closest("dialog").close(); break;
      case "inc": changeQty(d.key, 1); break;
      case "dec": changeQty(d.key, -1); break;
      case "filter": filter = d.cat; renderGrid(); break;
      case "to-checkout": showStep("checkout"); break;
      case "to-cart": showStep("cart"); break;
    }
  });

  /* ---------- הפעלה ---------- */
  applyTheme();
  render();
  renderGrid();
  updateCount();
  $("#oform").addEventListener("submit", submitOrder);
  }
})();
