document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.mobile-menu').forEach(menu => {
    if (!menu.querySelector('a[href="times.html"]')) {
      const link = document.createElement('a');
      link.href = 'times.html';
      link.textContent = 'Meus times';
      menu.appendChild(link);
    }
  });
  const menuButtons = document.querySelectorAll('.menu-toggle, .menu-icon');

  menuButtons.forEach((button) => {
    let current = button;
    let menu = null;

    while (current && current !== document.body) {
      menu = current.querySelector?.('.mobile-menu');
      if (menu) break;
      current = current.parentElement;
    }

    if (!menu) return;

    if (!button.hasAttribute('aria-expanded')) {
      button.setAttribute('aria-expanded', 'false');
    }

    const toggleMenu = (event) => {
      if (event) event.stopPropagation();
      const isOpen = menu.classList.toggle('open');
      button.setAttribute('aria-expanded', String(isOpen));
    };

    button.addEventListener('click', toggleMenu);
    button.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        toggleMenu();
      }
    });

    menu.querySelectorAll('a').forEach((link) => {
      link.addEventListener('click', () => {
        menu.classList.remove('open');
        button.setAttribute('aria-expanded', 'false');
      });
    });
  });

  document.addEventListener('click', (event) => {
    document.querySelectorAll('.mobile-menu.open').forEach((menu) => {
      const header = menu.closest('header');
      const toggle = header?.querySelector('.menu-toggle, .menu-icon');
      const clickedInsideMenu = menu.contains(event.target);
      const clickedToggle = toggle && toggle.contains(event.target);

      if (!clickedInsideMenu && !clickedToggle) {
        menu.classList.remove('open');
        if (toggle) {
          toggle.setAttribute('aria-expanded', 'false');
        }
      }
    });
  });
});
