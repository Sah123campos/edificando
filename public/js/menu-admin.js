// Menu hambúrguer + edição de sabores direto na loja (estilo Habileads)
import { app, db, configured, ADMIN_EMAIL, brl, esc } from "./firebase.js?v=1794334307";
import { logAdmin, logEntrada } from "./log-admin.js?v=1794334307";
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { collection, doc, getDoc, addDoc, setDoc, deleteDoc, serverTimestamp, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const $ = (s) => document.querySelector(s);
const toast = (m) => { const t = $("#toast"); t.textContent = m; t.classList.add("show"); setTimeout(() => t.classList.remove("show"), 2400); };
const MAX_SIDE = 800; // foto pequena (~60 KB) guardada direto no sabor, sem precisar de Storage
let isAdmin = false, products = [];

/* ---------- Menu hambúrguer ---------- */
const drawer = $("#drawer"), burger = $("#burger");
const setDrawer = (open) => { drawer.classList.toggle("open", open); burger.classList.toggle("open", open); burger.setAttribute("aria-expanded", open); $("#overlay").classList.toggle("open", open); };
burger.onclick = () => setDrawer(!drawer.classList.contains("open"));
$("#overlay").addEventListener("click", () => setDrawer(false));
drawer.addEventListener("click", (e) => { if (e.target.closest("a")) setDrawer(false); });

if (!configured) {
  $("#drawerAdmin").innerHTML = `<p class="drawer-note">Conecte o Firebase em <code>js/firebase.js</code> para ativar a área do admin.</p>`;
} else {
  const auth = getAuth(app);

  onAuthStateChanged(auth, async (u) => {
    isAdmin = !!u && (await getDoc(doc(db, "admins", u.uid)).catch(() => null))?.exists?.();
    if (isAdmin) logEntrada(db, "loja");
    if (u && !isAdmin) { toast("Conta sem permissão de admin"); signOut(auth); }
    document.body.classList.toggle("is-admin", isAdmin);
    renderDrawer(u);
    window.dispatchEvent(new Event("admin-change"));
  });

  function renderDrawer(u) {
    $("#drawerAdmin").innerHTML = isAdmin ? `
      <p class="drawer-note">Você está no modo admin ✔</p>
      <button class="btn block" id="dNew">+ Novo sabor</button>
      <a class="btn block" href="admin.html" style="text-align:center;text-decoration:none">📊 Ir para o painel admin</a>
      <button class="btn ghost block" id="dOut">Sair</button>` : `
      <form id="dLogin"><input type="hidden" autocomplete="username" value="${ADMIN_EMAIL}">
        <label>Senha de admin</label><input id="dPass" type="password" required autocomplete="current-password">
        <button class="btn block" style="margin-top:12px">Entrar como admin</button></form>`;
    $("#dLogin")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      try { await signInWithEmailAndPassword(auth, ADMIN_EMAIL, $("#dPass").value); location.href = "admin.html"; }
      catch { toast("Senha incorreta"); }
    });
    $("#dNew")?.addEventListener("click", () => { setDrawer(false); openEditor(null); });
    $("#dOut")?.addEventListener("click", () => signOut(auth));
  }

  // Admin vê também sabores inativos para poder reativá-los
  onSnapshot(collection(db, "products"), (s) => { products = s.docs.map((d) => ({ id: d.id, ...d.data() })); });
  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-edit]"); if (!b || !isAdmin) return;
    openEditor(products.find((p) => p.id === b.dataset.edit));
  });

  /* ---------- Editor de sabor ---------- */
  const form = $("#editForm");
  $("#eImg").onchange = () => { const f = $("#eImg").files[0]; if (f) $("#ePreview").src = URL.createObjectURL(f); };

  function openEditor(p) {
    $("#eTitle").textContent = p ? "Editar sabor" : "Novo sabor";
    $("#eId").value = p?.id || ""; $("#eName").value = p?.name || ""; $("#eDesc").value = p?.description || "";
    $("#ePrice").value = p ? (p.priceCents / 100).toFixed(2) : ""; $("#eStock").value = p?.stock ?? "";
    $("#eActive").checked = p ? p.active !== false : true; $("#eAvail").checked = p ? p.available !== false : true;
    $("#ePreview").src = p?.imageUrl || "img/panqueca.svg"; $("#eImg").value = "";
    $("#eDelete").classList.toggle("hidden", !p);
    $("#overlay").classList.add("open");
    document.querySelectorAll(".sheet").forEach((s) => s.classList.toggle("open", s.id === "editSheet"));
  }
  const closeEditor = () => { $("#overlay").classList.remove("open"); $("#editSheet").classList.remove("open"); };
  $("#eCancel").onclick = closeEditor;

  form.onsubmit = async (e) => {
    e.preventDefault();
    const btn = $("#eSave"); btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Salvando…';
    try {
      const id = $("#eId").value, stock = $("#eStock").value;
      const price = Math.round(parseFloat(String($("#ePrice").value).replace(",", ".")) * 100);
      if (!$("#eName").value.trim() || !(price > 0)) throw new Error("Informe nome e preço");
      const data = { name: $("#eName").value.trim(), description: $("#eDesc").value.trim(), priceCents: price,
        stock: stock === "" ? null : parseInt(stock, 10), active: $("#eActive").checked, available: $("#eAvail").checked, updatedAt: serverTimestamp() };
      const docRef = id ? doc(db, "products", id) : await addDoc(collection(db, "products"), { ...data, sold: 0, order: products.length });
      const file = $("#eImg").files[0];
      if (file) data.imageUrl = await toDataUrl(file);
      await setDoc(docRef, data, { merge: true });
      toast("Sabor salvo! 🥞"); logAdmin(db, id ? "Editou sabor" : "Criou sabor", `${data.name} · ${brl(data.priceCents)}${file ? " · trocou a foto" : ""}`); closeEditor();
    } catch (err) { toast(err.message || "Erro ao salvar"); }
    btn.disabled = false; btn.textContent = "Salvar";
  };

  $("#eDelete").onclick = async () => {
    const id = $("#eId").value;
    if (!id || !confirm("Excluir este sabor do cardápio? Pedidos antigos continuam guardados.")) return;
    try { const nm = $("#eName").value; await deleteDoc(doc(db, "products", id)); toast("Sabor excluído"); logAdmin(db, "Excluiu sabor", nm); closeEditor(); } catch (err) { toast(err.message); }
  };
}

// Mesma ideia do Habileads: reduz a foto no navegador. Aqui ela vira texto (data URL)
// e fica no próprio documento do sabor — ideal para poucos sabores.
async function toDataUrl(file) {
  const bmp = await createImageBitmap(file).catch(() => { throw new Error("Não consegui ler essa imagem"); });
  const c = document.createElement("canvas");
  for (const [side, q] of [[MAX_SIDE, 0.8], [640, 0.7], [480, 0.6]]) {
    const scale = Math.min(1, side / Math.max(bmp.width, bmp.height));
    c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
    c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
    let url = c.toDataURL("image/webp", q);
    if (!url.startsWith("data:image/webp")) url = c.toDataURL("image/jpeg", q);
    if (url.length < 700_000) { bmp.close?.(); return url; }
  }
  bmp.close?.(); throw new Error("Foto muito grande, tente outra");
}
export { brl };
