// Registra o uso da área de admin para o DEV acompanhar (coleção "usoAdmin").
// Como a senha de admin é compartilhada, identifica pelo aparelho e pelo nome digitado na entrada da loja.
import { addDoc, collection, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

export function logAdmin(db, acao, detalhe = "") {
  try {
    if (localStorage.getItem("naoContar")) return; // aparelho do DEV não registra
    let nome = ""; try { nome = (localStorage.getItem("ec_name") || "").trim().slice(0, 80); } catch {}
    const aparelho = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent) ? "celular" : "computador";
    const dados = { quando: serverTimestamp(), acao: String(acao).slice(0, 60), detalhe: String(detalhe).slice(0, 160), aparelho };
    if (nome.length >= 2) dados.nome = nome;
    addDoc(collection(db, "usoAdmin"), dados).catch(() => {});
  } catch {}
}

// Entrada no painel: no máximo um registro por aba
export function logEntrada(db, onde) {
  try {
    const k = "adminLogado:" + onde;
    if (sessionStorage.getItem(k)) return;
    sessionStorage.setItem(k, "1");
    logAdmin(db, "Entrou na área de admin", onde);
  } catch {}
}
