// Mostra no painel quem está no site agora: cada aba avisa "ainda estou aqui" a cada 3 min, por até 30 min.
// Guarda um código aleatório da aba, a página, o tipo de aparelho e o nome que a pessoa digitou na entrada.
import { db, configured } from "./firebase.js?v=1794252681";
import { doc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const BATIDA = 180000;      // 3 min entre avisos (economiza a cota grátis do Firebase)
const MAX_BATIDAS = 10;    // depois de ~30 min a aba para de avisar

function iniciar() {
  let id = sessionStorage.getItem("sessao");
  if (!id) { id = crypto.randomUUID().replace(/-/g, ""); sessionStorage.setItem("sessao", id); }
  const ref = doc(db, "online", id);
  const pagina = location.pathname.includes("pedido") ? "pedido" : "loja";
  const aparelho = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent) ? "celular" : "computador";

  let batidas = 0, ultima = 0;
  const bater = () => {
    if (document.hidden || batidas >= MAX_BATIDAS) return;
    if (Date.now() - ultima < 60000) return; // no máximo 1 aviso por minuto, mesmo trocando de aba
    batidas++; ultima = Date.now();
    const criada = sessionStorage.getItem("sessaoCriada") === id;
    let nome = ""; try { nome = (localStorage.getItem("ec_name") || "").trim().slice(0, 80); } catch {}
    const dados = criada
      ? { visto: serverTimestamp(), pagina }
      : { entrou: serverTimestamp(), visto: serverTimestamp(), pagina, aparelho };
    if (nome.length >= 2) dados.nome = nome;
    setDoc(ref, dados, { merge: true })
      .then(() => sessionStorage.setItem("sessaoCriada", id))
      // se falhar, tenta do outro jeito na próxima batida (criar ou só atualizar)
      .catch(() => (criada ? sessionStorage.removeItem("sessaoCriada") : sessionStorage.setItem("sessaoCriada", id)));
  };
  bater();
  setInterval(bater, BATIDA);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) bater(); });
  window.addEventListener("nome-definido", () => { ultima = 0; bater(); });
}

try { if (configured && !localStorage.getItem("naoContar")) iniciar(); } catch {}
