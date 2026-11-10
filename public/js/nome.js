// Nome completo: só letras (acentos, hífen e apóstrofo valem), pelo menos nome e sobrenome,
// e cada parte com 2 letras ou mais ("e", como em "Maria e Silva", é a única exceção).
// Devolve o nome arrumado, ou uma mensagem de erro em { erro }.
export function conferirNome(texto) {
  const nome = texto.trim().replace(/\s+/g, " ");
  if (!nome) return { erro: "Digite seu nome e sobrenome." };
  if (!/^[\p{L}' -]+$/u.test(nome)) return { erro: "Use só letras no nome (sem números ou símbolos)." };
  const partes = nome.split(" ");
  if (partes.length < 2) return { erro: "Digite seu nome e sobrenome." };
  if (partes.some((p) => p.toLowerCase() !== "e" && p.replace(/[^\p{L}]/gu, "").length < 2))
    return { erro: "Cada parte do nome precisa ter pelo menos 2 letras." };
  return { nome };
}
