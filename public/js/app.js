import { db, configured, brl, esc } from "./firebase.js?v=1794235000";
import { collection, onSnapshot, doc, getDoc, setDoc, increment, runTransaction, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const $ = (s) => document.querySelector(s);
const PLACEHOLDER = "img/panqueca.svg";
let products = [];
let settings = { pix: true, presencial: false, salesOpen: true };
// Pedidos aceitos até 22/11/2026 23:59 (horário de Brasília)
const DEADLINE = new Date("2026-11-22T23:59:59-03:00");
if (Date.now() > DEADLINE) settings.salesOpen = false;
let cart = JSON.parse(sessionStorage.getItem("cart") || "{}"); // {productId: qty} — só conveniência; preço real é validado no servidor

const save = () => sessionStorage.setItem("cart", JSON.stringify(cart));
const toast = (m) => { const t = $("#toast"); t.textContent = m; t.classList.add("show"); setTimeout(() => t.classList.remove("show"), 2000); };

let allProducts = [];
const isAdmin = () => document.body.classList.contains("is-admin");
const applyProducts = () => {
  products = allProducts.filter((p) => isAdmin() || p.active !== false).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  for (const id of Object.keys(cart)) if (!products.find((p) => p.id === id && p.active !== false)) delete cart[id];
  renderMenu(); renderCart();
};
window.addEventListener("admin-change", applyProducts);

const fail = (msg) => { $("#menu").innerHTML = `<div class="notice">${msg}</div>`; };
if (!configured) {
  fail("O cardápio ainda não foi conectado ao banco de dados. <br><small>Admin: preencha <code>public/js/firebase.js</code> com a configuração do seu projeto Firebase.</small>");
} else {
  contarVisita();
  const timer = setTimeout(() => products.length || fail("Não foi possível carregar o cardápio. Verifique sua internet e recarregue a página."), 12000);
  getDoc(doc(db, "config", "loja")).then((s) => {
    if (s.exists()) settings = { ...settings, ...s.data() };
    if (Date.now() > DEADLINE) settings.salesOpen = false;
    if (settings.about) $("#aboutText").textContent = settings.about;
    $("#closedNotice").classList.toggle("hidden", settings.salesOpen !== false);
    renderMenu();
  }).catch(() => {});
  onSnapshot(collection(db, "products"), (snap) => {
    clearTimeout(timer);
    allProducts = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    applyProducts();
  }, (err) => { clearTimeout(timer); console.error(err); fail("Erro ao carregar o cardápio (" + esc(err.code || err.message) + ")."); });
}

// Boas-vindas: pede o nome completo uma vez por aparelho e guarda para o pedido
(function boasVindas() {
  let salvo = ""; try { salvo = localStorage.getItem("ec_name") || ""; } catch {}
  if (salvo || isAdmin()) return;
  $("#welcome").classList.remove("hidden");
  $("#wName").focus();
  $("#welcomeForm").onsubmit = (e) => {
    e.preventDefault();
    const nome = $("#wName").value.trim().replace(/\s+/g, " ");
    if (nome.split(" ").length < 2 || nome.length < 5) { $("#wErr").textContent = "Digite seu nome e sobrenome."; return; }
    try { localStorage.setItem("ec_name", nome); } catch {}
    $("#welcome").classList.add("hidden");
    window.dispatchEvent(new Event("nome-definido"));
  };
})();

// Contador de visitas: soma 1 por aba aberta e 1 visitante único por aparelho (o painel mostra os números)
function contarVisita() {
  try {
    if (sessionStorage.getItem("visitou") || localStorage.getItem("naoContar")) return;
    sessionStorage.setItem("visitou", "1");
    let novo = 0;
    try { if (!localStorage.getItem("visitante")) { localStorage.setItem("visitante", "1"); novo = 1; } } catch {}
    const dia = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" }); // AAAA-MM-DD
    const dados = { visitas: increment(1), unicos: increment(novo) };
    for (const id of ["total", dia]) setDoc(doc(db, "visitas", id), dados, { merge: true }).catch(() => {});
  } catch {}
}

const stockLeft = (p) => (p.stock == null ? Infinity : Math.max(0, p.stock - (p.sold || 0)));
const available = (p) => p.active !== false && p.available !== false && stockLeft(p) > 0 && settings.salesOpen !== false;

function renderMenu() {
  if (!configured) return;
  if (!products.length) { $("#menu").innerHTML = isAdmin() ? `<div class="notice">Nenhum sabor ainda. Abra o menu ☰ e toque em <strong>+ Novo sabor</strong>.</div>` : "<p>Nenhum sabor disponível ainda.</p>"; return; }
  $("#menu").innerHTML = products.map((p) => {
    const q = cart[p.id] || 0, ok = available(p), left = stockLeft(p);
    return `<article class="card ${ok ? "" : "unavailable"}">
      <button class="edit-btn" data-edit="${p.id}" aria-label="Editar ${esc(p.name)}">✎</button>
      ${p.active === false ? `<span class="badge off inactive-tag">Oculto do cardápio</span>` : ""}
      <img src="${esc(p.imageUrl || PLACEHOLDER)}" alt="Panqueca de ${esc(p.name)}" loading="lazy">
      <div class="card-body">
        <div class="row"><h3>${esc(p.name)}</h3>
          ${ok ? (left < 15 ? `<span class="badge">Restam ${left}</span>` : `<span class="badge ok">Disponível</span>`) : `<span class="badge off">Esgotado</span>`}</div>
        <p class="desc">${esc(p.description || "")}</p>
        <div class="row"><span class="price">${brl(p.priceCents)}</span>
          ${!ok ? "" : q === 0
            ? `<button class="btn sm" data-add="${p.id}">Adicionar</button>`
            : `<div class="qty"><button data-dec="${p.id}" aria-label="Diminuir">−</button><span>${q}</span><button data-inc="${p.id}" aria-label="Aumentar">+</button></div>`}
        </div>
        ${q ? `<small style="color:var(--muted)">Subtotal: ${brl(q * p.priceCents)}</small>` : ""}
      </div></article>`;
  }).join("");
}

function change(id, d) {
  const p = products.find((x) => x.id === id); if (!p) return;
  const n = Math.max(0, Math.min((cart[id] || 0) + d, stockLeft(p), 50));
  if (d > 0 && n === (cart[id] || 0)) toast("Quantidade máxima atingida");
  n ? (cart[id] = n) : delete cart[id];
  save(); renderMenu(); renderCart();
  if (d > 0) { $("#cartbar").classList.remove("bump"); void $("#cartbar").offsetWidth; $("#cartbar").classList.add("bump"); toast(`${p.name} adicionada 🥞`); }
}

const lines = () => Object.entries(cart).map(([id, q]) => ({ p: products.find((x) => x.id === id), q })).filter((l) => l.p);
const total = () => lines().reduce((s, l) => s + l.q * l.p.priceCents, 0);

function renderCart() {
  const ls = lines(), count = ls.reduce((s, l) => s + l.q, 0);
  $("#cartCount").textContent = count; $("#cartTotal").textContent = brl(total());
  $("#cartbar").classList.toggle("show", count > 0);
  $("#cartItems").innerHTML = ls.length ? ls.map(({ p, q }) => `
    <div class="item"><img src="${esc(p.imageUrl || PLACEHOLDER)}" alt="">
      <div class="info"><strong>${esc(p.name)}</strong><br><small>${brl(p.priceCents)} · subtotal ${brl(q * p.priceCents)}</small></div>
      <div class="qty"><button data-dec="${p.id}">−</button><span>${q}</span><button data-inc="${p.id}">+</button></div>
    </div>`).join("") : "<p>Seu carrinho está vazio.</p>";
  $("#cartSheetTotal").textContent = brl(total());
  if (!count) closeAll();
}

// Sheets
const open = (id) => { $("#overlay").classList.add("open"); document.querySelectorAll(".sheet").forEach((s) => s.classList.toggle("open", s.id === id)); };
const closeAll = () => { $("#overlay").classList.remove("open"); document.querySelectorAll(".sheet").forEach((s) => s.classList.remove("open")); };

document.addEventListener("click", (e) => {
  const t = e.target.closest("[data-add],[data-inc],[data-dec],[data-close]"); if (!t) return;
  if (t.dataset.add || t.dataset.inc) change(t.dataset.add || t.dataset.inc, 1);
  else if (t.dataset.dec) change(t.dataset.dec, -1);
  else closeAll();
});
$("#cartbar").onclick = () => open("cartSheet");
$("#overlay").onclick = closeAll;
$("#backToCart").onclick = () => open("cartSheet");
$("#goCheckout").onclick = () => {
  const opts = [settings.pix !== false && ["pix", "PIX", "QR Code ou copia e cola — confirmação automática"],
                settings.presencial && ["presencial", "Pagar na retirada", "Dinheiro ou cartão no dia"]].filter(Boolean);
  $("#payOptions").innerHTML = opts.map(([v, t, d], i) => `<label class="pay-opt"><input type="radio" name="pay" value="${v}" ${i ? "" : "checked"}><div><strong>${t}</strong><br><small>${d}</small></div></label>`).join("");
  $("#summary").innerHTML = lines().map(({ p, q }) => `${q}× ${esc(p.name)} — ${brl(q * p.priceCents)}`).join("<br>");
  $("#checkoutTotal").textContent = brl(total());
  $("#name").value ||= localStorage.getItem("ec_name") || "";
  $("#phone").value ||= localStorage.getItem("ec_phone") || "";
  open("checkoutSheet");
};

// Máscara de telefone
$("#phone").addEventListener("input", (e) => {
  const d = e.target.value.replace(/\D/g, "").slice(0, 11);
  e.target.value = d.length > 6 ? `(${d.slice(0, 2)}) ${d.slice(2, d.length - 4)}-${d.slice(-4)}` : d.length > 2 ? `(${d.slice(0, 2)}) ${d.slice(2)}` : d;
});

$("#checkoutForm").onsubmit = async (e) => {
  e.preventDefault();
  const name = $("#name").value.trim(), phone = $("#phone").value.replace(/\D/g, "");
  const pay = document.querySelector("input[name=pay]:checked")?.value;
  if (name.length < 3) return toast("Informe seu nome");
  if (phone.length < 10) return toast("Informe um WhatsApp válido");
  if (!pay) return toast("Escolha a forma de pagamento");
  const btn = $("#submitOrder"); btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Enviando…';
  try {
    // O pedido vai direto para o banco; as regras do Firestore conferem preço, total e prazo.
    const items = lines().map(({ p, q }) => ({ productId: p.id, name: p.name, priceCents: p.priceCents, qty: q }));
    const totalCents = items.reduce((t, i) => t + i.qty * i.priceCents, 0);
    const token = [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, "0")).join("");
    const counterRef = doc(db, "config", "counter");
    await runTransaction(db, async (tx) => {
      const c = await tx.get(counterRef);
      const number = (c.exists() ? c.data().value : 0) + 1;
      const id = String(number), now = serverTimestamp();
      const base = { number, items, totalCents, paymentMethod: pay, status: "aguardando_pagamento", paymentStatus: "pendente" };
      c.exists() ? tx.update(counterRef, { value: number }) : tx.set(counterRef, { value: number });
      const payer = $("#payer").value.trim().slice(0, 80);
      tx.set(doc(db, "orders", id), { ...base, name, phone, token, createdAt: now, updatedAt: now, ...(payer && payer.toLowerCase() !== name.toLowerCase() ? { payerName: payer } : {}) });
      tx.set(doc(db, "publicOrders", token), { ...base, orderId: id, firstName: name.split(" ")[0].slice(0, 40) });
    });
    localStorage.setItem("ec_name", name); localStorage.setItem("ec_phone", phone);
    cart = {}; save();
    location.href = `pedido.html?t=${token}`;
  } catch (err) {
    console.error(err); toast(err.code === "permission-denied" ? "Não foi possível registrar: confira o carrinho e tente de novo." : "Não foi possível criar o pedido. Tente novamente."); btn.disabled = false; btn.textContent = "Confirmar pedido";
  }
};
renderCart();
