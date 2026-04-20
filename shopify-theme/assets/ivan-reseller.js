/**
 * IVAN RESELLER - Shopify Theme JavaScript
 * Interactivity and conversion optimizations
 * Version: 1.0.0
 */

(function() {
  'use strict';

  // ========================================
  // MOBILE STICKY ADD TO CART
  // ========================================
  
  const stickyCart = {
    element: null,
    triggerOffset: 600,
    
    init() {
      // Only on mobile
      if (window.innerWidth > 768) return;
      
      this.createElement();
      this.bindEvents();
    },
    
    createElement() {
      const productTitle = document.querySelector('.product__title h1');
      const productPrice = document.querySelector('.price__regular .price-item');
      const productImage = document.querySelector('.product__media img');
      
      if (!productTitle || !productPrice) return;
      
      const sticky = document.createElement('div');
      sticky.className = 'ir-sticky-cart';
      sticky.id = 'irStickyCart';
      sticky.innerHTML = `
        <img src="${productImage?.src || ''}" alt="" class="ir-sticky-cart__image">
        <div class="ir-sticky-cart__info">
          <div class="ir-sticky-cart__title">${productTitle.textContent}</div>
          <div class="ir-sticky-cart__price">${productPrice.textContent}</div>
        </div>
        <button class="ir-sticky-cart__button button button--primary" onclick="document.querySelector('.product-form__submit').click()">
          Add to Cart
        </button>
      `;
      
      document.body.appendChild(sticky);
      this.element = sticky;
    },
    
    bindEvents() {
      window.addEventListener('scroll', () => {
        if (!this.element) return;
        
        if (window.pageYOffset > this.triggerOffset) {
          this.element.classList.add('visible');
        } else {
          this.element.classList.remove('visible');
        }
      });
    }
  };

  // ========================================
  // ACCORDION FUNCTIONALITY
  // ========================================
  
  const accordion = {
    init() {
      const accordions = document.querySelectorAll('.ir-accordion');
      
      accordions.forEach(acc => {
        const header = acc.querySelector('.ir-accordion__header');
        if (header) {
          header.addEventListener('click', () => {
            const isOpen = acc.classList.contains('open');
            
            // Close all others (optional)
            // accordions.forEach(a => a.classList.remove('open'));
            
            if (isOpen) {
              acc.classList.remove('open');
            } else {
              acc.classList.add('open');
            }
          });
        }
      });
    }
  };

  // ========================================
  // COLOR SWATCH SELECTION
  // ========================================
  
  const colorSwatches = {
    init() {
      const swatches = document.querySelectorAll('.ir-color-swatch');
      
      swatches.forEach(swatch => {
        swatch.addEventListener('click', () => {
          // Remove selected from all
          swatches.forEach(s => s.classList.remove('selected'));
          
          // Add selected to clicked
          swatch.classList.add('selected');
          
          // Trigger variant change (if connected to Shopify variant)
          const variantId = swatch.dataset.variant;
          if (variantId) {
            this.updateVariant(variantId);
          }
        });
      });
    },
    
    updateVariant(variantId) {
      // Find the corresponding variant input and trigger change
      const variantInput = document.querySelector(`input[value="${variantId}"]`);
      if (variantInput) {
        variantInput.checked = true;
        variantInput.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }
  };

  // ========================================
  // QUANTITY SELECTOR
  // ========================================
  
  const quantitySelector = {
    init() {
      const containers = document.querySelectorAll('.ir-quantity');
      
      containers.forEach(container => {
        const minusBtn = container.querySelector('[data-action="minus"]');
        const plusBtn = container.querySelector('[data-action="plus"]');
        const input = container.querySelector('input');
        
        if (minusBtn) {
          minusBtn.addEventListener('click', () => {
            let value = parseInt(input.value) || 1;
            if (value > 1) {
              input.value = value - 1;
              input.dispatchEvent(new Event('change', { bubbles: true }));
            }
          });
        }
        
        if (plusBtn) {
          plusBtn.addEventListener('click', () => {
            let value = parseInt(input.value) || 1;
            input.value = value + 1;
            input.dispatchEvent(new Event('change', { bubbles: true }));
          });
        }
      });
    }
  };

  // ========================================
  // COUNTDOWN TIMER (for urgency)
  // ========================================
  
  const countdownTimer = {
    init() {
      const timers = document.querySelectorAll('.ir-countdown');
      
      timers.forEach(timer => {
        const endTime = new Date(timer.dataset.end).getTime();
        
        const updateTimer = () => {
          const now = new Date().getTime();
          const distance = endTime - now;
          
          if (distance < 0) {
            timer.innerHTML = '<span class="ir-countdown__expired">Offer Expired</span>';
            return;
          }
          
          const hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
          const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
          const seconds = Math.floor((distance % (1000 * 60)) / 1000);
          
          timer.innerHTML = `
            <span class="ir-countdown__item">${String(hours).padStart(2, '0')}</span>:
            <span class="ir-countdown__item">${String(minutes).padStart(2, '0')}</span>:
            <span class="ir-countdown__item">${String(seconds).padStart(2, '0')}</span>
          `;
        };
        
        setInterval(updateTimer, 1000);
        updateTimer();
      });
    }
  };

  // ========================================
  // RECENTLY VIEWED PRODUCTS
  // ========================================
  
  const recentlyViewed = {
    storageKey: 'ir_recently_viewed',
    maxItems: 4,
    
    init() {
      this.trackProduct();
      this.render();
    },
    
    trackProduct() {
      const productData = {
        id: meta.product?.id,
        title: document.querySelector('.product__title h1')?.textContent,
        image: document.querySelector('.product__media img')?.src,
        url: window.location.pathname,
        price: document.querySelector('.price__regular .price-item')?.textContent
      };
      
      if (!productData.id) return;
      
      let viewed = JSON.parse(localStorage.getItem(this.storageKey) || '[]');
      
      // Remove if already exists
      viewed = viewed.filter(p => p.id !== productData.id);
      
      // Add to front
      viewed.unshift(productData);
      
      // Limit
      viewed = viewed.slice(0, this.maxItems);
      
      localStorage.setItem(this.storageKey, JSON.stringify(viewed));
    },
    
    render() {
      const container = document.querySelector('#recently-viewed');
      if (!container) return;
      
      const viewed = JSON.parse(localStorage.getItem(this.storageKey) || '[]');
      if (viewed.length === 0) return;
      
      container.innerHTML = viewed.map(product => `
        <a href="${product.url}" class="ir-recent-card">
          <img src="${product.image}" alt="${product.title}" class="ir-recent-card__image">
          <div class="ir-recent-card__title">${product.title}</div>
          <div class="ir-recent-card__price">${product.price}</div>
        </a>
      `).join('');
    }
  };

  // ========================================
  // SMOOTH SCROLL FOR ANCHOR LINKS
  // ========================================
  
  const smoothScroll = {
    init() {
      document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function(e) {
          const target = document.querySelector(this.getAttribute('href'));
          if (target) {
            e.preventDefault();
            target.scrollIntoView({
              behavior: 'smooth',
              block: 'start'
            });
          }
        });
      });
    }
  };

  // ========================================
  // LAZY LOADING IMAGES
  // ========================================
  
  const lazyLoader = {
    init() {
      if ('IntersectionObserver' in window) {
        const imageObserver = new IntersectionObserver((entries) => {
          entries.forEach(entry => {
            if (entry.isIntersecting) {
              const img = entry.target;
              img.src = img.dataset.src;
              img.classList.remove('lazy');
              imageObserver.unobserve(img);
            }
          });
        });

        document.querySelectorAll('img.lazy').forEach(img => {
          imageObserver.observe(img);
        });
      }
    }
  };

  // ========================================
  // ANNOUNCEMENT BAR DISMISS
  // ========================================
  
  const announcementBar = {
    init() {
      const bar = document.querySelector('.announcement-bar');
      const closeBtn = bar?.querySelector('.announcement-bar__close');
      
      if (closeBtn) {
        closeBtn.addEventListener('click', () => {
          bar.style.display = 'none';
          sessionStorage.setItem('announcement_closed', 'true');
        });
      }
      
      // Check if previously closed
      if (sessionStorage.getItem('announcement_closed') === 'true') {
        if (bar) bar.style.display = 'none';
      }
    }
  };

  // ========================================
  // INITIALIZE ALL MODULES
  // ========================================
  
  document.addEventListener('DOMContentLoaded', () => {
    stickyCart.init();
    accordion.init();
    colorSwatches.init();
    quantitySelector.init();
    countdownTimer.init();
    recentlyViewed.init();
    smoothScroll.init();
    lazyLoader.init();
    announcementBar.init();
  });

  // Re-initialize on resize (for sticky cart mobile detection)
  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      stickyCart.init();
    }, 250);
  });

})();
