// Painel do DEV: visitas e quem está no site agora. Só a conta dev@ consegue ler (ver firestore.rules).
import { app, db } from "./firebase.js?v=1794233000";
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { collection, onSnapshot, query, where, Timestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const DEV_EMAIL = "dev@edificandocampo.com";
const ONLINE_MS = 90000; // "no site" se a aba deu sinal nos últimos 90 s
const auth = getAuth(app);
const $ = (s) => document.querySelector(s);
let visitas = {}, online = [], chart, unsubs = [];

// Este aparelho é do DEV: não conta como visita nem aparece em "ao vivo"
try { localStorage.setItem("naoContar", "1"); } catch {}

$("#loginForm").onsubmit = async (e) => {
  e.preventDefault();
  try { await signInWithEmailAndPassword(auth, DEV_EMAIL, $("#pass").value); }
  catch { $("#loginErr").textContent = "Senha incorreta."; }
};
$("#logout").onclick = () => signOut(auth);

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
  const inicioDoDia = new Date(hojeBR() + "T00:00:00-03:00");
  unsubs.push(onSnapshot(query(collection(db, "online"), where("visto", ">=", Timestamp.fromDate(inicioDoDia))), (s) => {
    online = s.docs.map((d) => ({ id: d.id, ...d.data() })); renderOnline();
  }, erro));
});

const hojeBR = () => new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
const hora = (t) => t?.toDate?.().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) || "—";

function renderVisitas() {
  const kp = [["Visitas hoje", visitas[hojeBR()]?.visitas || 0], ["Visitas no total", visitas.total?.visitas || 0], ["Visitantes únicos", visitas.total?.unicos || 0]];
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
    return `<div class="online-row"><span>${o.on ? "🟢 No site" : "⚪ Saiu às " + hora(o.visto)}</span>
      <small>${o.aparelho === "celular" ? "📱 Celular" : "💻 Computador"} · ${o.pagina === "pedido" ? "vendo o pedido" : "na loja"} · entrou ${hora(o.entrou)} · ${min} min</small></div>`;
  }).join("") : "<p style='color:var(--muted)'>Ninguém visitou hoje ainda.</p>";
}
setInterval(() => online.length && renderOnline(), 30000);
