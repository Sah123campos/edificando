// Painel do DEV: visitas e quem está no site agora. Só a conta dev@ consegue ler (ver firestore.rules).
import { firebaseConfig, esc, ligarAppCheck } from "./firebase.js?v=1794261000";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, collection, onSnapshot, query, where, orderBy, limit, Timestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// Instância separada ("dev"): o login do DEV fica guardado à parte e não se mistura
// com o login de admin das outras abas (que deslogaria qualquer conta que não seja admin).
const app = initializeApp(firebaseConfig, "dev");
ligarAppCheck(app);
const db = getFirestore(app);

const DEV_EMAIL = "dev@edificandocampo.com";
const ONLINE_MS = 240000; // "no site" se a aba deu sinal nos últimos 4 min (avisos a cada 3 min)
const auth = getAuth(app);
const $ = (s) => document.querySelector(s);
let visitas = {}, online = [], chart, unsubs = [];

// Este aparelho é do DEV: não conta como visita nem aparece em "ao vivo"
try { localStorage.setItem("naoContar", "1"); } catch {}

$("#loginForm").onsubmit = async (e) => {
  e.preventDefault();
  try { await signInWithEmailAndPassword(auth, DEV_EMAIL, $("#pass").value); }
  catch (err) {
    const c = err?.code || "";
    $("#loginErr").textContent =
      c.includes("invalid-credential") || c.includes("wrong-password") ? "Senha incorreta." :
      c.includes("too-many-requests") ? "Muitas tentativas. Espere alguns minutos e tente de novo." :
      c.includes("network") ? "Sem conexão com o Firebase. Verifique a internet." :
      "Não foi possível entrar (" + c + ").";
  }
};
$("#logout").onclick = () => signOut(auth);
$("#showPass").onchange = (e) => { $("#pass").type = e.target.checked ? "text" : "password"; };

onAuthStateChanged(auth, (u) => {
  unsubs.forEach((f) => f()); unsubs = [];
  const dev = u && u.email === DEV_EMAIL;
  $("#login").classList.toggle("hidden", !!dev);
  $("#app").classList.toggle("hidden", !dev);
  $("#logout").classList.toggle("hidden", !u);
  if (u && !dev) { $("#loginErr").textContent = "Esta conta não é a do DEV."; return signOut(auth); }
  if (!dev) return;
  const erro = () => { $("#onlineCount").textContent = "sem permissão para ler os dados"; };
  unsubs.push(onSnapshot(collection(db, "visitas"), (s) => {
    visitas = Object.fromEntries(s.docs.map((d) => [d.id, d.data()])); renderVisitas();
  }, erro));
  unsubs.push(onSnapshot(query(collection(db, "usoAdmin"), orderBy("quando", "desc"), limit(100)), (s) => {
    renderUsoAdmin(s.docs.map((d) => d.data()));
  }, () => { $("#admCount").textContent = "sem permissão (cole as regras novas no Firestore)"; }));
  const inicioDoDia = new Date(hojeBR() + "T00:00:00-03:00");
  unsubs.push(onSnapshot(query(collection(db, "online"), where("visto", ">=", Timestamp.fromDate(inicioDoDia))), (s) => {
    online = s.docs.map((d) => ({ id: d.id, ...d.data() })); renderOnline();
  }, erro));
});

const hojeBR = () => new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
const hora = (t) => t?.toDate?.().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) || "—";

function renderVisitas() {
  const dias0 = Object.keys(visitas).filter((k) => k !== "total");
  const soma = (c) => dias0.reduce((t, d) => t + (visitas[d][c] || 0), 0);
  const kp = [["Visitas hoje", visitas[hojeBR()]?.visitas || 0], ["Visitas no total", Math.max(soma("visitas"), visitas.total?.visitas || 0)], ["Visitantes únicos", Math.max(soma("unicos"), visitas.total?.unicos || 0)]];
  $("#kpis").innerHTML = kp.map(([l, n]) => `<div class="kpi"><small>${l}</small><b>${n}</b></div>`).join("");
  const dias = Object.keys(visitas).filter((k) => k !== "total").sort().slice(-30);
  chart?.destroy();
  chart = new Chart($("#chartVisits"), {
    type: "line",
    data: { labels: dias.map((d) => d.split("-").reverse().slice(0, 2).join("/")),
            datasets: [{ label: "Visitas", data: dias.map((d) => visitas[d].visitas || 0), borderColor: "#7A55A6", backgroundColor: "#A98BD1", tension: .3 }] },
    options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } },
  });
}

function renderOnline() {
  const agora = Date.now();
  const lista = online.filter((o) => o.visto?.toDate).map((o) => ({ ...o, on: agora - o.visto.toMillis() < ONLINE_MS }))
    .sort((a, b) => (b.on - a.on) || (b.visto.toMillis() - a.visto.toMillis()));
  const n = lista.filter((o) => o.on).length;
  $("#onlineCount").textContent = n === 1 ? "1 pessoa no site agora" : `${n} pessoas no site agora`;
  $("#onlineList").innerHTML = lista.length ? lista.map((o) => {
    const min = Math.max(1, Math.round((o.visto.toMillis() - (o.entrou?.toMillis?.() || o.visto.toMillis())) / 60000));
    return `<div class="online-row"><span><b>${esc(o.nome || "Sem nome (ainda não digitou)")}</b> · ${o.on ? "🟢 No site" : "⚪ Saiu às " + hora(o.visto)}</span>
      <small>${o.aparelho === "celular" ? "📱 Celular" : "💻 Computador"} · ${o.pagina === "pedido" ? "vendo o pedido" : "na loja"} · entrou ${hora(o.entrou)} · ${min} min</small></div>`;
  }).join("") : "<p style='color:var(--muted)'>Ninguém visitou hoje ainda.</p>";
}
setInterval(() => online.length && renderOnline(), 30000);

const ICONES = { "Entrou na área de admin": "🔑", "Confirmou pagamento": "✅", "Cancelou pedido": "🚫", "Excluiu pedido": "🗑", "Mudou status": "➡️", "Criou sabor": "➕", "Editou sabor": "✏️", "Excluiu sabor": "🗑", "Mudou configurações": "⚙️" };
function renderUsoAdmin(lista) {
  const hoje = hojeBR();
  const dia = (t) => t?.toDate?.().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
  const quando = (t) => { if (!t?.toDate) return "agora"; const d = dia(t);
    return (d === hoje ? "hoje" : t.toDate().toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })) + " " + hora(t); };
  const nHoje = lista.filter((x) => dia(x.quando) === hoje).length;
  $("#admCount").textContent = nHoje === 1 ? "1 registro hoje" : `${nHoje} registros hoje`;
  $("#admList").innerHTML = lista.length ? lista.map((x) => `<div class="online-row">
      <span>${ICONES[x.acao] || "•"} <b>${esc(x.acao)}</b>${x.detalhe && x.acao !== "Entrou na área de admin" ? " · " + esc(x.detalhe) : ""}</span>
      <small>${quando(x.quando)} · ${x.aparelho === "celular" ? "📱 Celular" : "💻 Computador"} · ${esc(x.nome || "nome não informado")}${x.acao === "Entrou na área de admin" ? " · pela " + (x.detalhe === "painel" ? "tela do painel" : "loja (menu ☰)") : ""}</small></div>`).join("")
    : "<p style='color:var(--muted)'>Ninguém usou a área de admin ainda.</p>";
}
