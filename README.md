# Edificando Campo · Venda de panquecas

Loja estilo delivery: cardápio → carrinho → checkout → PIX com QR Code e copia e cola → acompanhamento do pedido. Painel admin com pedidos, produção e relatórios.

Funciona no **plano grátis (Spark)** do Firebase e no **GitHub Pages**, sem servidor.

- **Site:** https://sah123campos.github.io/edificando/
- **Painel:** https://sah123campos.github.io/edificando/public/admin.html
- **Admin:** menu ☰ → senha única da equipe (usuário `admin@edificandocampo.com` no Firebase Authentication, UID em `admins/`).

## Como funciona o pagamento
1. O pedido é salvo direto no Firestore. As regras (`firestore.rules`) conferem nome e preço de cada sabor, o total, a forma de pagamento e a data limite (22/11).
2. A página do pedido gera o **PIX copia e cola e o QR Code** (padrão BR Code do Banco Central) com o valor total, para a chave da igreja (`public/js/pix.js`).
3. A equipe confere o extrato e toca em **Confirmar pagamento** no painel. O comprador não consegue marcar o próprio pedido como pago.

## Arquivos
```
public/index.html    loja + menu ☰ (admin cadastra sabores e fotos)
public/pedido.html   acompanhamento do pedido com PIX
public/admin.html    painel: dashboard, pedidos, produção, sabores, configurações
public/js/firebase.js  config do Firebase
public/js/pix.js       chave PIX, titular e cidade
firestore.rules      regras de segurança (colar no console: Firestore → Regras)
```

## Alterar as regras
Firebase Console → Firestore Database → Regras → colar o conteúdo de `firestore.rules` → Publicar.
