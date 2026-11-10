// Mostra no painel quem está no site: a aba grava quando a pessoa entra e quando sai ou troca de app.
// O painel calcula o tempo pela hora de entrada e de saída (2 ou 3 gravações por visita).
// Guarda um código aleatório da aba, a página, o tipo de aparelho e o nome que a pessoa digitou na entrada.
import { db, configured } from "./firebase.js?v=1794316471";
import { doc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const VIVO = 600000;   // a cada 10 min confirma que a aba segue aberta (caso o aviso de saída se perca)
const MAX_VIVO = 3;    // até ~30 min

function iniciar() {
  let id = sessionStorage.getItem("sessao");
  if (!id) { id = crypto.randomUUID().replace(/-/g, ""); sessionStorage.setItem("sessao", id); }
  const ref = doc(db, "online", id);
  const pagina = location.pathname.includes("pedido") ? "pedido" : "loja";
  const aparelho = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent) ? "celular" : "computador";

  let estado = null, vivos = 0;
  // on=true: entrou ou voltou para a aba; on=false: saiu, fechou ou trocou de app
  const gravar = (on, forcar) => {
    if (on && document.hidden) return;
    if (!on && estado !== true) return;          // só marca saída de quem está marcado como no site
    if (on && estado === true && !forcar) return;
    const criada = sessionStorage.getItem("sessaoCriada") === id;
    if (!criada && !on) return;
    let nome = ""; try { nome = (localStorage.getItem("ec_name") || "").trim().slice(0, 80); } catch {}
    const dados = criada
      ? { visto: serverTimestamp(), pagina, on }
      : { entrou: serverTimestamp(), visto: serverTimestamp(), pagina, aparelho, on: true };
    if (nome.length >= 2) dados.nome = nome;
    estado = on;
    setDoc(ref, dados, { merge: true })
      .then(() => sessionStorage.setItem("sessaoCriada", id))
      // se falhar, tenta do outro jeito na próxima vez (criar ou só atualizar)
      .catch(() => { estado = null; criada ? sessionStorage.removeItem("sessaoCriada") : sessionStorage.setItem("sessaoCriada", id); });
  };
  gravar(true);
  setInterval(() => { if (!document.hidden && vivos < MAX_VIVO) { vivos++; gravar(true, true); } }, VIVO);
  document.addEventListener("visibilitychange", () => gravar(!document.hidden));
  window.addEventListener("pagehide", () => gravar(false));
  window.addEventListener("nome-definido", () => gravar(true, true));
}

try { if (configured && !localStorage.getItem("naoContar")) iniciar(); } catch {}
