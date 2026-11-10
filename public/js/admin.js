import { app, db, ADMIN_EMAIL, brl, esc, STATUS, FLOW } from "./firebase.js?v=1794333744";
import { logAdmin, logEntrada } from "./log-admin.js?v=1794333744";
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { collection, onSnapshot, doc, setDoc, addDoc, getDoc, serverTimestamp, orderBy, query, writeBatch } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const auth = getAuth(app);
const $ = (s) => document.querySelector(s);
const toast = (m) => { const t = $("#toast"); t.textContent = m; t.classList.add("show"); setTimeout(() => t.classList.remove("show"), 2200); };
let orders = [], products = [], charts = {}, unsubs = [];

$("#loginForm").onsubmit = async (e) => {
  e.preventDefault();
  try { await signInWithEmailAndPassword(auth, ADMIN_EMAIL, $("#pass").value); }
  catch { $("#loginErr").textContent = "Senha incorreta."; }
};
$("#logout").onclick = () => signOut(auth);

onAuthStateChanged(auth, async (u) => {
  unsubs.forEach((f) => f()); unsubs = [];
  if (!u) { $("#login").classList.remove("hidden"); $("#app").classList.add("hidden"); $("#logout").classList.add("hidden"); return; }
  const adm = await getDoc(doc(db, "admins", u.uid));
  if (!adm.exists()) { $("#loginErr").textContent = "Esta conta não tem permissão de administrador."; return signOut(auth); }
  $("#login").classList.add("hidden"); $("#app").classList.remove("hidden"); $("#logout").classList.remove("hidden"); $("#who").textContent = "Modo admin · na loja, toque em ✎ para editar sabores"; logEntrada(db, "painel");
  unsubs.push(onSnapshot(query(collection(db, "orders"), orderBy("createdAt", "desc")), (s) => { orders = s.docs.map((d) => ({ id: d.id, ...d.data() })); renderAll(); }));
  unsubs.push(onSnapshot(collection(db, "products"), (s) => { products = s.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (a.order ?? 0) - (b.order ?? 0)); renderProducts(); }));
  const c = (await getDoc(doc(db, "config", "loja"))).data() || {};
  $("#cOpen").checked = c.salesOpen !== false; $("#cPix").checked = c.pix !== false; $("#cPres").checked = !!c.presencial; $("#cAbout").value = c.about || "";
});

// Abas
document.querySelectorAll("[data-tab]").forEach((b) => b.onclick = () => {
  document.querySelectorAll("[data-tab]").forEach((x) => x.classList.toggle("on", x === b));
  document.querySelectorAll("[data-view]").forEach((v) => v.classList.toggle("hidden", v.dataset.view !== b.dataset.tab));
});
$("#fStatus").innerHTML += Object.entries(STATUS).map(([k, v]) => `<option value="${k}">${v}</option>`).join("");
$("#search").oninput = renderOrders; $("#fStatus").onchange = renderOrders;

const valid = () => orders.filter((o) => o.status !== "cancelado");
const confirmed = () => valid().filter((o) => o.paymentStatus === "pago" || (o.paymentMethod === "presencial" && o.status !== "aguardando_pagamento"));

function renderAll() { renderDash(); renderOrders(); renderProd(); }

function renderDash() {
  const v = valid(), paid = v.filter((o) => o.paymentStatus === "pago");
  const qty = v.reduce((s, o) => s + o.items.reduce((a, i) => a + i.qty, 0), 0);
  const sum = (arr) => arr.reduce((s, o) => s + o.totalCents, 0);
  const kp = [["Pedidos", v.length], ["Panquecas vendidas", qty], ["Total em pedidos", brl(sum(v))], ["Recebido", brl(sum(paid))],
    ["A receber", brl(sum(v) - sum(paid))], ["Não entregues", v.filter((o) => o.status !== "entregue").length]];
  $("#kpis").innerHTML = kp.map(([l, n]) => `<div class="kpi"><small>${l}</small><b>${n}</b></div>`).join("");
  const byFlavor = {}; v.forEach((o) => o.items.forEach((i) => (byFlavor[i.name] = (byFlavor[i.name] || 0) + i.qty)));
  const byDay = {}; v.forEach((o) => { const d = o.createdAt?.toDate?.().toLocaleDateString("pt-BR") || "—"; byDay[d] = (byDay[d] || 0) + 1; });
  draw("chartFlavors", "bar", byFlavor, "Unidades"); draw("chartDays", "line", Object.fromEntries(Object.entries(byDay).reverse()), "Pedidos");
}
function draw(id, type, data, label) {
  charts[id]?.destroy();
  charts[id] = new Chart(document.getElementById(id), { type, data: { labels: Object.keys(data), datasets: [{ label, data: Object.values(data), backgroundColor: "#A98BD1", borderColor: "#7A55A6", borderRadius: 8, tension: .3 }] },
    options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } } });
}

function orderCard(o, compact) {
  const next = FLOW[FLOW.indexOf(o.status) + 1];
  const canAdvance = next && o.status !== "aguardando_pagamento" && o.status !== "cancelado";
  return `<div class="orow"><div class="row"><strong>#${esc(o.number)} · ${esc(o.name)}</strong>
    <span class="badge ${o.paymentStatus === "pago" ? "ok" : "off"}">${o.paymentStatus === "pago" ? "Pago" : "Pendente"} · ${o.paymentMethod.toUpperCase()}</span></div>
    <small style="color:var(--muted)">${STATUS[o.status]} · ${o.createdAt?.toDate?.().toLocaleString("pt-BR") || ""} · <a href="https://wa.me/55${esc(o.phone)}" target="_blank" rel="noopener">WhatsApp ${esc(o.phone)}</a></small>
    ${o.payerName ? `<div style="font-size:.9rem;color:var(--purple-d)">💳 PIX pago por: <strong>${esc(o.payerName)}</strong></div>` : ""}
    <div>${o.items.map((i) => `${i.qty}× ${esc(i.name)}`).join(" · ")} — <strong>${brl(o.totalCents)}</strong></div>
    <div class="row noprint" style="justify-content:flex-start;margin-top:8px;flex-wrap:wrap">
      ${o.paymentStatus !== "pago" && o.status !== "cancelado" ? `<button class="btn sm sage" data-paid="${o.id}">✔ Confirmar pagamento${o.paymentMethod === "pix" ? ` (PIX de ${brl(o.totalCents)})` : ""}</button>` : ""}
      ${canAdvance ? `<button class="btn sm" data-next="${o.id}" data-to="${next}">→ ${STATUS[next]}</button>` : ""}
      ${!compact && o.status !== "entregue" && o.status !== "cancelado" && o.paymentStatus !== "pago" ? `<button class="btn sm ghost" data-cancel="${o.id}">Cancelar</button>` : ""}
      ${!compact && o.status === "cancelado" ? `<button class="btn sm ghost" style="color:var(--danger);border-color:var(--danger)" data-del="${o.id}">🗑 Excluir</button>` : ""}
    </div></div>`;
}
function renderOrders() {
  const q = $("#search").value.toLowerCase().trim(), f = $("#fStatus").value;
  const list = orders.filter((o) => (!f || o.status === f) && (!q || o.name.toLowerCase().includes(q) || (o.payerName || "").toLowerCase().includes(q) || String(o.number).includes(q)));
  $("#orderList").innerHTML = list.map((o) => orderCard(o)).join("") || "<p>Nenhum pedido.</p>";
}
function renderProd() {
  const c = confirmed().filter((o) => o.status !== "entregue"), tot = {};
  c.forEach((o) => o.items.forEach((i) => (tot[i.name] = (tot[i.name] || 0) + i.qty)));
  $("#prodTable").innerHTML = `<tr><th>Sabor</th><th>A produzir/entregar</th></tr>` + Object.entries(tot).map(([n, q]) => `<tr><td>${esc(n)}</td><td><b>${q}</b></td></tr>`).join("")
    + `<tr><td><b>Total</b></td><td><b>${Object.values(tot).reduce((a, b) => a + b, 0)}</b></td></tr>`;
  $("#deliveryList").innerHTML = c.sort((a, b) => a.number - b.number).map((o) => orderCard(o, true)).join("") || "<p>Nada pendente. 🎉</p>";
}

// Ações nos pedidos: atualiza o pedido e a página que o comprador acompanha
async function setOrder(id, data) {
  const o = orders.find((x) => x.id === id); if (!o) return;
  const patch = { ...data, updatedAt: serverTimestamp() };
  const b = writeBatch(db);
  b.update(doc(db, "orders", id), patch);
  if (o.token) b.update(doc(db, "publicOrders", o.token), { status: patch.status ?? o.status, paymentStatus: patch.paymentStatus ?? o.paymentStatus });
  await b.commit();
}
document.addEventListener("click", async (e) => {
  const b = e.target.closest("[data-next],[data-paid],[data-cancel],[data-del]"); if (!b) return;
  try {
    if (b.dataset.next) { const o = orders.find((x) => x.id === b.dataset.next); await setOrder(b.dataset.next, { status: b.dataset.to }); logAdmin(db, "Mudou status", `Pedido #${o.number} → ${STATUS[b.dataset.to]}`); }
    if (b.dataset.paid) {
      const o = orders.find((x) => x.id === b.dataset.paid);
      if (!confirm(`Confirmar que o pagamento do pedido #${o.number} (${o.payerName || o.name}, ${brl(o.totalCents)}) foi recebido?`)) return;
      await setOrder(b.dataset.paid, { paymentStatus: "pago", status: "pagamento_confirmado", paidAt: serverTimestamp() });
      toast("Pagamento confirmado"); logAdmin(db, "Confirmou pagamento", `Pedido #${o.number} · ${o.name} · ${brl(o.totalCents)}`);
    }
    if (b.dataset.cancel && confirm("Cancelar este pedido?")) { const o = orders.find((x) => x.id === b.dataset.cancel); await setOrder(b.dataset.cancel, { status: "cancelado" }); logAdmin(db, "Cancelou pedido", `Pedido #${o.number} · ${o.name}`); }
    if (b.dataset.del) {
      const o = orders.find((x) => x.id === b.dataset.del);
      if (!confirm(`Excluir de vez o pedido #${o.number} (${o.name})? Isso não pode ser desfeito.`)) return;
      const wb = writeBatch(db);
      wb.delete(doc(db, "orders", o.id));
      if (o.token) wb.delete(doc(db, "publicOrders", o.token));
      await wb.commit(); toast("Pedido excluído"); logAdmin(db, "Excluiu pedido", `Pedido #${o.number} · ${o.name}`);
    }
  } catch (err) { toast("Erro: " + err.message); }
});

// Produtos
const soldOf = (id) => valid().reduce((s, o) => s + o.items.filter((i) => i.productId === id).reduce((a, i) => a + i.qty, 0), 0);
function renderProducts() {
  $("#productList").innerHTML = products.map((p) => `<div class="item"><img src="${esc(p.imageUrl || "img/panqueca.svg")}" alt="">
    <div class="info"><strong>${esc(p.name)}</strong> ${p.active ? "" : '<span class="badge off">inativo</span>'} ${p.available === false ? '<span class="badge off">indisponível</span>' : ""}<br>
    <small>${brl(p.priceCents)} · vendidas ${soldOf(p.id)}${p.stock != null ? ` de ${p.stock}` : ""}</small></div>
    <button class="btn sm ghost" data-edit="${p.id}">Editar</button></div>`).join("") || "<p>Cadastre o primeiro sabor.</p>";
  document.querySelectorAll("[data-edit]").forEach((b) => b.onclick = () => fillForm(products.find((p) => p.id === b.dataset.edit)));
}
function fillForm(p) {
  $("#pId").value = p?.id || ""; $("#pName").value = p?.name || ""; $("#pDesc").value = p?.description || "";
  $("#pPrice").value = p ? (p.priceCents / 100).toFixed(2) : ""; $("#pStock").value = p?.stock ?? ""; $("#pOrder").value = p?.order ?? 0;
  $("#pActive").checked = p ? p.active : true; $("#pAvail").checked = p ? p.available !== false : true; $("#pImg").value = "";
  $("#pfTitle").textContent = p ? `Editar: ${p.name}` : "Novo sabor"; scrollTo({ top: 0, behavior: "smooth" });
}
$("#pReset").onclick = () => fillForm(null);
$("#pForm").onsubmit = async (e) => {
  e.preventDefault();
  const id = $("#pId").value, stock = $("#pStock").value;
  const data = { name: $("#pName").value.trim(), description: $("#pDesc").value.trim(), priceCents: Math.round(parseFloat($("#pPrice").value) * 100),
    stock: stock === "" ? null : parseInt(stock), order: parseInt($("#pOrder").value) || 0, active: $("#pActive").checked, available: $("#pAvail").checked, updatedAt: serverTimestamp() };
  try {
    const r = id ? doc(db, "products", id) : await addDoc(collection(db, "products"), { ...data, sold: 0 });
    const file = $("#pImg").files[0];
    if (file) data.imageUrl = await new Promise((ok, no) => { const fr = new FileReader(); fr.onload = () => fr.result.length < 900_000 ? ok(fr.result) : no(new Error("Foto grande demais — use o menu ☰ da loja, que comprime sozinho")); fr.readAsDataURL(file); });
    await setDoc(r, data, { merge: true }); toast("Sabor salvo!"); logAdmin(db, id ? "Editou sabor" : "Criou sabor", `${data.name} · ${brl(data.priceCents)}`); fillForm(null);
  } catch (err) { toast("Erro: " + err.message); }
};

$("#cfgForm").onsubmit = async (e) => {
  e.preventDefault();
  await setDoc(doc(db, "config", "loja"), { salesOpen: $("#cOpen").checked, pix: $("#cPix").checked, presencial: $("#cPres").checked, about: $("#cAbout").value.trim() }, { merge: true });
  toast("Configurações salvas!"); logAdmin(db, "Mudou configurações", `vendas ${$("#cOpen").checked ? "abertas" : "fechadas"} · PIX ${$("#cPix").checked ? "sim" : "não"} · presencial ${$("#cPres").checked ? "sim" : "não"}`);
};
