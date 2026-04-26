(() => {
  'use strict';

  const navigationLabelMap = {
    Inicio: 'Home',
    Catálogo: 'Catalog',
    Catalogo: 'Catalog',
    Contacto: 'Contact',
  };

  const filterLabelMap = {
    Disponibilidad: 'Availability',
    Precio: 'Price',
  };

  function normalizeLabels(root = document) {
    root.querySelectorAll('.header-menu a, .menu-list__link, .menu-drawer a').forEach((node) => {
      const text = node.textContent && node.textContent.trim();
      if (!text || !navigationLabelMap[text]) return;
      node.textContent = navigationLabelMap[text];
    });

    root.querySelectorAll('.facets__label').forEach((node) => {
      const text = node.textContent && node.textContent.trim();
      if (!text || !filterLabelMap[text]) return;
      node.textContent = filterLabelMap[text];
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    document.documentElement.classList.add('pv-ready');
    normalizeLabels();

    if (!('MutationObserver' in window)) return;

    const observer = new MutationObserver(() => normalizeLabels());
    observer.observe(document.body, { childList: true, subtree: true });
  });
})();
