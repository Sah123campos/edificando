# Edificando Campo · Venda de panquecas

Loja estilo delivery: cardápio → carrinho → checkout → PIX com QR Code e copia e cola → acompanhamento do pedido. Painel da equipe com pedidos, produção e relatórios.

Funciona no **plano grátis (Spark)** do Firebase e no **GitHub Pages**, sem servidor.

- **Site:** https://sah123campos.github.io/edificando/

## Como funciona o pagamento
1. O pedido é salvo direto no Firestore. As regras de segurança conferem nome e preço de cada sabor, o total, a forma de pagamento e a data limite.
2. A página do pedido gera o **PIX copia e cola e o QR Code** (padrão BR Code do Banco Central) com o valor total.
3. A equipe confere o extrato e confirma o pagamento no painel. O comprador não consegue marcar o próprio pedido como pago.

## Arquivos
```
public/index.html    loja
public/pedido.html   acompanhamento do pedido com PIX
public/admin.html    painel da equipe
public/js/           código da loja, do PIX e do painel
firestore.rules      regras de segurança do Firestore
```
