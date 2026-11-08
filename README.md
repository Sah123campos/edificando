# Panquecas · Edificando Campo

Plataforma de vendas estilo delivery: cardápio → carrinho → checkout → PIX automático → acompanhamento do pedido. Painel admin com dashboard, produção e entrega.

**Stack:** HTML/CSS/JS puro (mobile-first) · Firebase Hosting, Firestore, Auth, Cloud Functions (Node 20) · PIX via Mercado Pago com webhook assinado.

## Estrutura
```
public/            index.html (loja) · pedido.html (acompanhamento) · admin.html
  js/firebase.js   ← colocar a config do projeto
functions/         createOrder · mpWebhook · syncOrder
firestore.rules
```

## Instalação
1. Crie um projeto no Firebase (plano **Blaze** — exigido para Functions chamarem a API do Mercado Pago; o uso deste evento fica dentro da cota gratuita).
2. Ative **Firestore** e **Authentication (E-mail/senha)**. (As fotos ficam comprimidas dentro do próprio sabor — não precisa de Storage.)
3. Cole a config web em `public/js/firebase.js`.
4. No Mercado Pago (conta da igreja): *Suas integrações → Criar aplicação* → copie o **Access Token de produção**. Em *Webhooks*, configure a URL
   `https://southamerica-east1-SEU_PROJETO.cloudfunctions.net/mpWebhook`, evento **Pagamentos**, e copie a **assinatura secreta**.
5. Terminal:
   ```bash
   npm i -g firebase-tools && firebase login
   firebase use SEU_PROJETO
   firebase functions:secrets:set MP_ACCESS_TOKEN
   firebase functions:secrets:set MP_WEBHOOK_SECRET
   cd functions && npm i && cd ..
   firebase deploy
   ```
6. **Criar administrador:** em Authentication, adicione o usuário (e-mail/senha). Copie o UID e crie no Firestore o documento `admins/{UID}` com qualquer campo (ex.: `nome: "Samuel"`).
7. Na loja, abra o menu ☰ → *Entrar como admin* → **+ Novo sabor** (ou toque em ✎ num sabor para editar). O painel completo fica em `/admin`. Cadastre os sabores (com foto) e ajuste *Configurações*. Divulgue o link da loja.

## Fluxo de status
`aguardando_pagamento → pagamento_confirmado → pedido_confirmado → em_preparacao → pronto → entregue` (ou `cancelado`).

## Segurança
- Preços, estoque e total são calculados **no servidor**; o cliente só envia IDs e quantidades.
- PIX só vira "pago" quando o webhook (com assinatura HMAC validada) é confirmado consultando a API do Mercado Pago, conferindo ID e valor. As regras impedem o admin de marcar PIX como pago manualmente; pagamento presencial é confirmado no painel.
- Telefone e nome completo ficam em `orders` (só admin). O link do comprador lê `publicOrders/{id}_{token}` com token aleatório de 128 bits, sem telefone e sem listagem.
- Estoque é reservado na criação e devolvido ao cancelar (PIX expira em 1 h).

## Testar antes do evento
Use o **Access Token de teste** do Mercado Pago e usuários de teste para simular um pagamento aprovado, depois troque pelo de produção.
