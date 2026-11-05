const html = document.documentElement;
const intro = document.getElementById("intro");

async function iniciarAbertura() {
  if (!intro || !html.classList.contains("intro-on")) return;
  const pular = document.getElementById("intro-pular");
  let encerrada = false;
  let timerAbertura;
  let timerFontes;

  function mostrarSite() {
    if (encerrada || !html.classList.contains("intro-on")) return;
    encerrada = true;
    clearTimeout(timerAbertura);
    intro.classList.add("out");
    html.classList.add("site-in");
    setTimeout(() => html.classList.remove("intro-on", "site-in"), 1000);
  }

  try { sessionStorage.setItem("futura-intro", "1"); } catch {}
  pular.addEventListener("click", mostrarSite, { once: true });
  pular.focus({ preventScroll: true });

  try {
    await Promise.race([
      document.fonts?.ready,
      new Promise(resolve => { timerFontes = setTimeout(resolve, 1200); })
    ]);
  } catch {
    // Se as fontes falharem, a abertura usa as fontes disponíveis.
  } finally {
    clearTimeout(timerFontes);
  }
  if (encerrada || !html.classList.contains("intro-on")) return;
  intro.classList.add("go");
  timerAbertura = setTimeout(mostrarSite, 3700);
}

iniciarAbertura();
