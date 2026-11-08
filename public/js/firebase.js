// Preencha com as credenciais do seu projeto (Console Firebase > Configurações do projeto)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getFunctions } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js";

export const firebaseConfig = {
  apiKey: "SUA_API_KEY",
  authDomain: "SEU_PROJETO.firebaseapp.com",
  projectId: "SEU_PROJETO",
  storageBucket: "SEU_PROJETO.appspot.com",
  appId: "SEU_APP_ID",
};

// Conta única de admin (igual ao Habileads: todos usam a mesma senha).
// No Firebase > Authentication > Usuários, crie um usuário com ESTE e-mail.
export const ADMIN_EMAIL = "admin@edificandocampo.com";

// Enquanto a config acima for a de exemplo, o site mostra um aviso em vez de ficar carregando
export const configured = !firebaseConfig.apiKey.startsWith("SUA_");
export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const functions = getFunctions(app, "southamerica-east1");

export const brl = (cents) => (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export const STATUS = {
  aguardando_pagamento: "Aguardando pagamento",
  pagamento_confirmado: "Pagamento confirmado",
  pedido_confirmado: "Pedido confirmado",
  em_preparacao: "Em preparação",
  pronto: "Pronto para retirada",
  entregue: "Entregue",
  cancelado: "Cancelado",
};
export const FLOW = ["aguardando_pagamento", "pagamento_confirmado", "pedido_confirmado", "em_preparacao", "pronto", "entregue"];

export const esc = (s = "") => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
