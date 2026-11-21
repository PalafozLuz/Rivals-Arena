document.addEventListener('DOMContentLoaded', () => {
  const track = document.getElementById('home-game-carousel');
  if (!track) return;
  for (const game of window.RIVALS_JOGOS_COMUNIDADES || []) {
    const link = document.createElement('a');
    link.className = 'home-game-cover' + (game.slug === 'hollow-knight' ? ' home-game-cover-hollow' : '');
    link.href = 'comunidade.html?' + new URLSearchParams({comunidade: game.slug});
    link.setAttribute('aria-label', 'Abrir comunidade de ' + game.nome);
    link.title = game.nome;
    const image = document.createElement('img');
    image.src = game.imagem; image.alt = game.nome;
    image.width = 187; image.height = 315; image.loading = 'lazy';
    link.appendChild(image); track.appendChild(link);
  }
  const previous = document.getElementById('home-games-prev');
  const next = document.getElementById('home-games-next');
  function updateControls() {
    previous.disabled = track.scrollLeft <= 2;
    next.disabled = track.scrollLeft >= track.scrollWidth - track.clientWidth - 2;
  }
  function scroll(direction) {
    const behavior = matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth';
    track.scrollBy({left: direction * Math.max(180, track.clientWidth * .8), behavior});
  }
  previous.addEventListener('click', () => scroll(-1));
  next.addEventListener('click', () => scroll(1));
  track.addEventListener('keydown', event => {
    if (event.target === track && ['ArrowLeft', 'ArrowRight'].includes(event.key)) {
      event.preventDefault(); scroll(event.key === 'ArrowRight' ? 1 : -1);
    }
  });
  track.addEventListener('scroll', updateControls, {passive: true});
  new ResizeObserver(updateControls).observe(track);
  updateControls();
});
