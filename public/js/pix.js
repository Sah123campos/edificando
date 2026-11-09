// PIX "copia e cola" (BR Code do Banco Central) gerado no navegador, sem intermediário.
// O valor e o número do pedido já vão dentro do código.
export const PIX = {
  key: "+5516991175803",                 // chave PIX (celular) da igreja — Sicredi
  name: "IGREJA EVANG AD MADUREIRA",     // máx. 25 caracteres, sem acento
  city: "SAO CARLOS",                    // máx. 15 caracteres, sem acento
};

const field = (id, value) => id + String(value.length).padStart(2, "0") + value;

function crc16(str) {
  let crc = 0xffff;
  for (let i = 0; i < str.length; i++) {
    crc ^= str.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) crc = (crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

export function pixPayload(totalCents, orderNumber) {
  const txid = `PEDIDO${orderNumber}`.replace(/[^A-Za-z0-9]/g, "").slice(0, 25);
  const body =
    field("00", "01") +
    field("26", field("00", "br.gov.bcb.pix") + field("01", PIX.key)) +
    field("52", "0000") +
    field("53", "986") +
    field("54", (totalCents / 100).toFixed(2)) +
    field("58", "BR") +
    field("59", PIX.name) +
    field("60", PIX.city) +
    field("62", field("05", txid)) +
    "6304";
  return body + crc16(body);
}
