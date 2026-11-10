// Links de WhatsApp (https://wa.me/NUMERO):
// - no celular: deixa o wa.me agir (ele já abre o app, ou a página para baixar se não tiver);
// - no computador: tenta abrir o app do WhatsApp; se ele não abrir em ~1,5 s, abre o WhatsApp Web.
// Vale para todos os links wa.me da página, inclusive os criados depois (admin).
(() => {
  const celular = /Android|iPhone|iPad|iPod|Mobi/i.test(navigator.userAgent);
  // Linux não tem app oficial do WhatsApp, e o Chrome lá pergunta "abrir xdg-open?" mesmo sem app
  const linux = /Linux|X11|CrOS/i.test(navigator.userAgent) && !celular;

  document.addEventListener("click", (e) => {
    const a = e.target.closest?.('a[href^="https://wa.me/"]');
    if (!a || celular || e.ctrlKey || e.metaKey || e.shiftKey || e.button !== 0) return;
    const numero = a.getAttribute("href").replace("https://wa.me/", "").replace(/\D/g, "");
    if (!numero) return;
    e.preventDefault();
    const web = `https://web.whatsapp.com/send?phone=${numero}`;
    const abrirWeb = () => {
      // se o navegador bloquear a nova aba, abre na mesma
      const aba = window.open(web, "_blank");
      if (aba) aba.opener = null; else location.href = web;
    };
    if (linux) return abrirWeb();

    // Computador (Windows/Mac): se o app abrir, a página perde o foco (ou fica escondida)
    let abriu = false;
    const marcar = () => { abriu = true; };
    window.addEventListener("blur", marcar, { once: true });
    document.addEventListener("visibilitychange", marcar, { once: true });

    // iframe escondido: tenta o app sem trocar de página se ele não existir
    const f = document.createElement("iframe");
    f.style.display = "none";
    f.src = `whatsapp://send?phone=${numero}`;
    document.body.appendChild(f);

    setTimeout(() => {
      window.removeEventListener("blur", marcar);
      document.removeEventListener("visibilitychange", marcar);
      f.remove();
      if (!abriu) abrirWeb();
    }, 1500);
  });
})();
