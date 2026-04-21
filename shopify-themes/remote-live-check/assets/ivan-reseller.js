/**
 * Ivan Reseller - Premium Storefront Interactions
 * Clean, refined, and performant enhancements
 */

(function () {
  'use strict';

  const filterLabelMap = {
    Disponibilidad: 'Availability',
    Precio: 'Price',
  };

  const navigationLabelMap = {
    Inicio: 'Home',
    Catálogo: 'Catalog',
    Catalogo: 'Catalog',
    Contacto: 'Contact',
  };

  const productCache = new Map();

  function markPageReady() {
    document.documentElement.classList.add('ir-ready');
  }

  function revealOnScroll() {
    if (!('IntersectionObserver' in window)) return;

    const targets = document.querySelectorAll(
      '.ir-trust-bar__item, .ir-why-card, product-card.product-card, .ir-product-benefits__item, .ir-product-trust__item'
    );

    if (!targets.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add('ir-in-view');
          observer.unobserve(entry.target);
        });
      },
      {
        threshold: 0.1,
        rootMargin: '0px 0px -32px 0px',
      }
    );

    targets.forEach((target) => {
      observer.observe(target);
    });
  }

  function normalizeFacetLabels(root = document) {
    root.querySelectorAll('.facets__label').forEach((node) => {
      const text = node.textContent && node.textContent.trim();
      if (!text || !filterLabelMap[text]) return;
      node.textContent = filterLabelMap[text];
    });
  }

  function normalizeNavigationLabels(root = document) {
    root.querySelectorAll('.header-menu a, .menu-list__link, .menu-drawer a').forEach((node) => {
      const text = node.textContent && node.textContent.trim();
      if (!text || !navigationLabelMap[text]) return;
      node.textContent = navigationLabelMap[text];
    });
  }

  function polishImportedProductCopy(root = document) {
    const productDetails = root.querySelector('.product-details');
    if (!productDetails || productDetails.dataset.irCopyPolished === 'true') return;

    const descriptionBlocks = [...productDetails.querySelectorAll('.rte, .text-block')].filter((node) => {
      const text = node.textContent || '';
      return /specifiation|package\s*content|battery type|conversion rate/i.test(text);
    });

    descriptionBlocks.forEach((block) => {
      block.classList.add('ir-product-description-polished');

      const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
      const textNodes = [];

      while (walker.nextNode()) {
        textNodes.push(walker.currentNode);
      }

      textNodes.forEach((node) => {
        node.nodeValue = node.nodeValue
          .replace(/Specifiation\s*[:：]?/gi, 'Specifications')
          .replace(/Package\s*Content\s*[:：]?/gi, 'Package includes')
          .replace(/Applicable type:\s*/gi, 'Use: ')
          .replace(/Battery type:Cylindrical/gi, 'Battery format: Cylindrical')
          .replace(/Power capacity;\s*/gi, 'Capacity: ')
          .replace(/Multi-U port output/gi, 'multi-port output')
          .replace(/\s+[:：]\s*$/g, '')
          .replace(/\u00a0+/g, ' ');
      });
    });

    productDetails.dataset.irCopyPolished = 'true';
  }

  async function getProductJson(handle) {
    if (!handle) return null;
    if (!productCache.has(handle)) {
      productCache.set(
        handle,
        fetch(`/products/${handle}.js`)
          .then((response) => (response.ok ? response.json() : null))
          .catch(() => null)
      );
    }

    return productCache.get(handle);
  }

  function buildHydratedImage(gallery, productData) {
    let descriptionImage = null;
    if (productData && productData.description) {
      const descriptionDocument = new DOMParser().parseFromString(productData.description, 'text/html');
      descriptionImage = descriptionDocument.querySelector('img')?.getAttribute('src');
    }

    const imageSource =
      (productData &&
        (typeof productData.featured_image === 'string'
          ? productData.featured_image
          : productData.featured_image && productData.featured_image.src)) ||
      (productData && Array.isArray(productData.images) ? productData.images[0] : null) ||
      descriptionImage;

    const placeholder = gallery.querySelector('.product-card-gallery__title-placeholder');
    if (!placeholder) return;

    const link = document.createElement('a');
    link.className = 'contents ir-card-gallery__image-link';
    link.href = gallery.dataset.productUrl || productData?.url || '#';
    link.setAttribute('aria-label', gallery.dataset.productTitle || productData?.title || 'Product');

    if (imageSource) {
      const image = document.createElement('img');
      image.className = 'product-media__image ir-card-gallery__image-fallback';
      image.src = imageSource;
      image.alt = gallery.dataset.productTitle || productData?.title || '';
      image.loading = 'lazy';
      link.appendChild(image);
    } else {
      const fallback = document.createElement('span');
      fallback.className = 'ir-card-gallery__title-fallback';
      fallback.setAttribute('aria-hidden', 'true');
      fallback.textContent = (gallery.dataset.productTitle || productData?.title || '?').trim().charAt(0).toUpperCase();
      link.appendChild(fallback);
    }

    placeholder.replaceWith(link);
    gallery.dataset.hydratedImage = 'true';
  }

  async function hydrateCardGalleryPlaceholders(root = document) {
    const galleries = Array.from(
      root.querySelectorAll('.card-gallery[data-product-handle]:not([data-hydrated-image="true"])')
    ).filter((gallery) => gallery.querySelector('.product-card-gallery__title-placeholder'));

    await Promise.all(
      galleries.map(async (gallery) => {
        const productData = await getProductJson(gallery.dataset.productHandle);
        if (!productData) return;
        buildHydratedImage(gallery, productData);
      })
    );
  }

  function watchStorefrontPolish() {
    if (!('MutationObserver' in window)) return;

    const observer = new MutationObserver(() => {
      normalizeFacetLabels();
      normalizeNavigationLabels();
      polishImportedProductCopy();
      hydrateCardGalleryPlaceholders();
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    markPageReady();
    revealOnScroll();
    normalizeFacetLabels();
    normalizeNavigationLabels();
    polishImportedProductCopy();
    hydrateCardGalleryPlaceholders();
    watchStorefrontPolish();
  });
})();
