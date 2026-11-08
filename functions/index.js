const { onCall, onRequest, HttpsError } = require("firebase-functions/v2/https");
const { onDocumentWritten } = require("firebase-functions/v2/firestore");
const { defineSecret } = require("firebase-functions/params");
const { setGlobalOptions } = require("firebase-functions/v2");
const admin = require("firebase-admin");
const crypto = require("crypto");

admin.initializeApp();
const db = admin.firestore();
const FieldValue = admin.firestore.FieldValue;
setGlobalOptions({ region: "southamerica-east1", maxInstances: 10 });

const MP_TOKEN = defineSecret("MP_ACCESS_TOKEN");      // Access Token de produção do Mercado Pago
const MP_WEBHOOK_SECRET = defineSecret("MP_WEBHOOK_SECRET"); // "Assinatura secreta" das notificações
const MP = "https://api.mercadopago.com";

/* ------------------------------------------------------------------ *
 * Cria o pedido. Preços e estoque vêm SEMPRE do banco, nunca do cliente.
 * ------------------------------------------------------------------ */
exports.createOrder = onCall({ secrets: [MP_TOKEN], enforceAppCheck: false }, async (req) => {
  const { name, phone, paymentMethod, items } = req.data || {};
  const cleanName = String(name || "").trim().slice(0, 80);
  const cleanPhone = String(phone || "").replace(/\D/g, "");
  if (cleanName.length < 3) throw new HttpsError("invalid-argument", "Informe seu nome.");
  if (cleanPhone.length < 10 || cleanPhone.length > 11) throw new HttpsError("invalid-argument", "WhatsApp inválido.");
  if (!Array.isArray(items) || !items.length || items.length > 30) throw new HttpsError("invalid-argument", "Carrinho vazio.");

  const cfg = (await db.doc("config/loja").get()).data() || {};
  if (cfg.salesOpen === false) throw new HttpsError("failed-precondition", "As vendas estão encerradas.");
  const allowed = { pix: cfg.pix !== false, presencial: !!cfg.presencial };
  if (!allowed[paymentMethod]) throw new HttpsError("invalid-argument", "Forma de pagamento indisponível.");

  const merged = {};
  for (const i of items) {
    const q = parseInt(i.qty, 10);
    if (!i.productId || typeof i.productId !== "string" || !(q > 0 && q <= 50)) throw new HttpsError("invalid-argument", "Item inválido.");
    merged[i.productId] = (merged[i.productId] || 0) + q;
  }

  const token = crypto.randomBytes(16).toString("hex"); // dá acesso ao link público do pedido
  const orderRef = db.collection("orders").doc();

  const order = await db.runTransaction(async (tx) => {
    const counterRef = db.doc("config/counter");
    const refs = Object.keys(merged).map((id) => db.doc(`products/${id}`));
    const [counter, ...snaps] = await Promise.all([tx.get(counterRef), ...refs.map((r) => tx.get(r))]);
    const lines = snaps.map((s) => {
      const p = s.data(), qty = merged[s.id];
      if (!s.exists || !p.active || p.available === false) throw new HttpsError("failed-precondition", `Sabor indisponível: ${p?.name || s.id}`);
      if (p.stock != null && (p.sold || 0) + qty > p.stock) throw new HttpsError("resource-exhausted", `Restam apenas ${p.stock - (p.sold || 0)} de ${p.name}.`);
      return { productId: s.id, name: p.name, priceCents: p.priceCents, qty };
    });
    const number = (counter.data()?.value || 0) + 1;
    const o = {
      number, name: cleanName, phone: cleanPhone, items: lines, paymentMethod, token,
      totalCents: lines.reduce((s, l) => s + l.qty * l.priceCents, 0),
      status: "aguardando_pagamento", paymentStatus: "pendente",
      createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
    };
    tx.set(counterRef, { value: number }, { merge: true });
    lines.forEach((l, i) => tx.update(refs[i], { sold: FieldValue.increment(l.qty) })); // reserva estoque
    tx.set(orderRef, o);
    return o;
  });

  if (paymentMethod === "pix") {
    try {
      const r = await fetch(`${MP}/v1/payments`, {
        method: "POST",
        headers: { Authorization: `Bearer ${MP_TOKEN.value()}`, "Content-Type": "application/json", "X-Idempotency-Key": orderRef.id },
        body: JSON.stringify({
          transaction_amount: order.totalCents / 100,
          description: `Panquecas Edificando Campo - Pedido #${order.number}`,
          payment_method_id: "pix",
          external_reference: orderRef.id,
          notification_url: `https://${process.env.FUNCTION_REGION || "southamerica-east1"}-${process.env.GCLOUD_PROJECT}.cloudfunctions.net/mpWebhook`,
          date_of_expiration: new Date(Date.now() + 60 * 60 * 1000).toISOString().replace("Z", "-00:00"),
          payer: { email: `pedido${order.number}@edificandocampo.local`, first_name: cleanName.split(" ")[0] },
        }),
      });
      const pay = await r.json();
      if (!r.ok) throw new Error(pay.message || "Falha no PIX");
      const td = pay.point_of_interaction.transaction_data;
      await orderRef.update({ mpPaymentId: String(pay.id), pix: { copiaECola: td.qr_code, qrBase64: td.qr_code_base64 } });
    } catch (e) {
      console.error("PIX", e);
      await cancelOrder(orderRef.id, "erro_pix");
      throw new HttpsError("unavailable", "Não foi possível gerar o PIX. Tente novamente.");
    }
  }
  return { orderId: orderRef.id, token };
});

/* ------------------------------------------------------------------ *
 * Webhook Mercado Pago: só marca como pago após consultar a API.
 * ------------------------------------------------------------------ */
exports.mpWebhook = onRequest({ secrets: [MP_TOKEN, MP_WEBHOOK_SECRET] }, async (req, res) => {
  try {
    const dataId = String(req.query["data.id"] || req.body?.data?.id || "");
    const type = req.query.type || req.body?.type;
    if (type !== "payment" || !dataId) return res.sendStatus(200);

    // Validação da assinatura (x-signature: ts=...,v1=...)
    const sig = Object.fromEntries(String(req.get("x-signature") || "").split(",").map((p) => p.trim().split("=")));
    const manifest = `id:${dataId.toLowerCase()};request-id:${req.get("x-request-id") || ""};ts:${sig.ts};`;
    const expected = crypto.createHmac("sha256", MP_WEBHOOK_SECRET.value()).update(manifest).digest("hex");
    if (!sig.v1 || sig.v1.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig.v1), Buffer.from(expected))) {
      console.warn("Assinatura inválida"); return res.sendStatus(401);
    }

    const r = await fetch(`${MP}/v1/payments/${dataId}`, { headers: { Authorization: `Bearer ${MP_TOKEN.value()}` } });
    const pay = await r.json();
    if (!r.ok) return res.sendStatus(500);
    const ref = db.doc(`orders/${pay.external_reference}`);
    await db.runTransaction(async (tx) => {
      const s = await tx.get(ref); if (!s.exists) return;
      const o = s.data();
      if (String(o.mpPaymentId) !== String(pay.id)) return;
      if (pay.status === "approved" && o.paymentStatus !== "pago" && Math.round(pay.transaction_amount * 100) === o.totalCents) {
        tx.update(ref, { paymentStatus: "pago", status: o.status === "cancelado" ? "cancelado" : "pagamento_confirmado",
          paidAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
      }
    });
    if (["cancelled", "rejected", "expired"].includes(pay.status)) await cancelOrder(pay.external_reference, "pix_" + pay.status);
    res.sendStatus(200);
  } catch (e) { console.error(e); res.sendStatus(500); }
});

async function cancelOrder(id, reason) {
  const ref = db.doc(`orders/${id}`);
  await db.runTransaction(async (tx) => {
    const s = await tx.get(ref); const o = s.data();
    if (!o || o.status === "cancelado" || o.paymentStatus === "pago") return;
    tx.update(ref, { status: "cancelado", cancelReason: reason, updatedAt: FieldValue.serverTimestamp() });
  });
}

/* ------------------------------------------------------------------ *
 * Espelha cada pedido numa coleção pública mínima (sem telefone),
 * acessível apenas por quem tem o token do link. Devolve estoque ao cancelar.
 * ------------------------------------------------------------------ */
exports.syncOrder = onDocumentWritten("orders/{id}", async (ev) => {
  const before = ev.data.before.data(), o = ev.data.after.data();
  if (!o) return;
  if (o.status === "cancelado" && before?.status !== "cancelado") {
    const b = db.batch();
    o.items.forEach((i) => b.update(db.doc(`products/${i.productId}`), { sold: FieldValue.increment(-i.qty) }));
    await b.commit();
  }
  await db.doc(`publicOrders/${ev.params.id}_${o.token}`).set({
    number: o.number, firstName: o.name.split(" ")[0], items: o.items, totalCents: o.totalCents,
    status: o.status, paymentStatus: o.paymentStatus, paymentMethod: o.paymentMethod,
    pix: o.status === "aguardando_pagamento" ? o.pix || null : null, updatedAt: FieldValue.serverTimestamp(),
  });
});
