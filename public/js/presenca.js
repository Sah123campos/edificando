// Mostra no painel quem está no site agora: cada aba avisa "ainda estou aqui" a cada 45 s.
// Não guarda nome nem dado pessoal: só um código aleatório da aba, a página e o tipo de aparelho.
import { db, configured } from "./firebase.js?v=1794232000";
import { doc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const BATIDA = 45000;

function iniciar() {
  let id = sessionStorage.getItem("sessao");
  if (!id) { id = crypto.randomUUID().replace(/-/g, ""); sessionStorage.setItem("sessao", id); }
  const ref = doc(db, "online", id);
  const pagina = location.pathname.includes("pedido") ? "pedido" : "loja";
  const aparelho = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent) ? "celular" : "computador";

  const bater = () => {
    if (document.hidden) return;
    const criada = sessionStorage.getItem("sessaoCriada") === id;
    const dados = criada
      ? { visto: serverTimestamp(), pagina }
      : { entrou: serverTimestamp(), visto: serverTimestamp(), pagina, aparelho };
    setDoc(ref, dados, { merge: true })
      .then(() => sessionStorage.setItem("sessaoCriada", id))
      // se falhar, tenta do outro jeito na próxima batida (criar ou só atualizar)
      .catch(() => (criada ? sessionStorage.removeItem("sessaoCriada") : sessionStorage.setItem("sessaoCriada", id)));
  };
  bater();
  setInterval(bater, BATIDA);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) bater(); });
}

try { if (configured) iniciar(); } catch {}
