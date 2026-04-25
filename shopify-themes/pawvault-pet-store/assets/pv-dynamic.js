/**
 * pv-dynamic.js — PawVault Dynamic Store Experience
 *
 * Features:
 *  1. Announcement bar rotation (all pages)
 *  2. Hero personalization by time-of-day + return visitor (homepage)
 *  3. Urgency strip "X people viewing" (product pages)
 *  4. Social proof toast — recently purchased (product pages)
 *  5. Exit intent popup with discount code (desktop, all pages)
 *  6. Scroll fade-in animations (all pages)
 */

(() => {
  'use strict';

  /* ─────────────────────────────────────────────
     CONFIG
  ───────────────────────────────────────────── */
  const DISCOUNT_CODE = 'PAWS10';

  const ANNOUNCEMENT_MESSAGES = [
    '🐾 Free shipping on orders over $50 across the USA',
    '⭐ Rated 4.8 / 5 &nbsp;·&nbsp; Trusted by 2,000+ pet families',
    '🔄 30-day easy returns — no questions asked',
    '🐕 New pet essentials added every week',
    `✨ Use code <strong>${DISCOUNT_CODE}</strong> for 10% off your first order`,
  ];

  const HERO_VARIANTS = [
    // 06:00 – 11:59
    { line1: 'Start their morning',  accent: 'the right way.' },
    // 12:00 – 17:59
    { line1: 'Everything your pet',  accent: 'needs today.'   },
    // 18:00 – 23:59 / 00:00 – 05:59
    { line1: 'Wind down together',   accent: 'tonight.'       },
  ];
  const RETURN_HERO = { line1: 'Welcome back.', accent: 'New arrivals just dropped.' };

  const TOAST_NAMES     = ['Sarah', 'Mike', 'Jennifer', 'Chris', 'Emma', 'James', 'Olivia', 'Noah', 'Ava', 'Liam'];
  const TOAST_CITIES    = ['Miami', 'Austin', 'Chicago', 'Denver', 'Seattle', 'Portland', 'Nashville', 'Boston', 'Phoenix', 'Atlanta'];
  const TOAST_PRODUCTS  = ['a dog harness', 'a cat bed', 'a grooming kit', 'a pet carrier', 'feeding accessories', 'a leash set', 'cat enrichment toys'];

  /* ─────────────────────────────────────────────
     UTILS
  ───────────────────────────────────────────── */
  const isProduct  = () => window.location.pathname.includes('/products/');
  const isHome     = () => window.location.pathname === '/' || window.location.pathname === '';
  const rand       = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
  const pick       = (arr) => arr[rand(0, arr.length - 1)];

  /* ─────────────────────────────────────────────
     1. ANNOUNCEMENT BAR ROTATION
  ───────────────────────────────────────────── */
  function initAnnouncementRotation() {
    const bar = document.querySelector(
      '.announcement-bar p, .announcement-bar__message, [class*="announcement"] p'
    );
    if (!bar) return;

    let idx = 0;

    function rotate() {
      bar.style.transition = 'opacity 0.45s ease';
      bar.style.opacity = '0';

      setTimeout(() => {
        idx = (idx + 1) % ANNOUNCEMENT_MESSAGES.length;
        bar.innerHTML = ANNOUNCEMENT_MESSAGES[idx];
        bar.style.opacity = '1';
      }, 450);
    }

    // First rotation after 5 s, then every 4 s
    setTimeout(() => {
      rotate();
      setInterval(rotate, 4200);
    }, 5000);
  }

  /* ─────────────────────────────────────────────
     2. HERO PERSONALIZATION
  ───────────────────────────────────────────── */
  function initHeroVariants() {
    if (!isHome()) return;

    const headline   = document.querySelector('.pv-hero__headline');
    const accentSpan = headline && headline.querySelector('.pv-hero__accent');
    const signalEl   = document.querySelector('.pv-hero__signal');
    if (!headline || !accentSpan) return;

    const isReturn = Boolean(localStorage.getItem('pv_visited'));
    localStorage.setItem('pv_visited', '1');

    const hour = new Date().getHours();
    let variant;

    if (isReturn) {
      variant = RETURN_HERO;
    } else if (hour >= 6 && hour < 12) {
      variant = HERO_VARIANTS[0];
    } else if (hour >= 12 && hour < 18) {
      variant = HERO_VARIANTS[1];
    } else {
      variant = HERO_VARIANTS[2];
    }

    // Replace first text node (line1) + accent span (line2)
    const firstText = [...headline.childNodes].find(n => n.nodeType === Node.TEXT_NODE && n.textContent.trim());
    if (firstText) firstText.textContent = variant.line1 + ' ';
    accentSpan.textContent = variant.accent;

    // Update the signal badge for return visitors
    if (isReturn && signalEl) {
      signalEl.textContent = 'New arrivals this week';
    }

    // Gentle entrance animation
    headline.style.cssText += 'opacity:0;transform:translateY(10px);transition:opacity 0.7s ease,transform 0.7s ease;';
    requestAnimationFrame(() => requestAnimationFrame(() => {
      headline.style.opacity = '1';
      headline.style.transform = 'translateY(0)';
    }));
  }

  /* ─────────────────────────────────────────────
     3. PRODUCT URGENCY STRIP
  ───────────────────────────────────────────── */
  function initProductUrgency() {
    if (!isProduct()) return;

    // Find the buy-buttons container
    const buyArea = document.querySelector(
      '[data-component="buy-buttons"], [class*="buy-button"], form[action*="/cart/add"]'
    );
    if (!buyArea) return;

    let viewers = rand(4, 13);

    const strip = document.createElement('div');
    strip.className = 'pv-urgency';
    strip.innerHTML = `
      <span class="pv-urgency__dot" aria-hidden="true"></span>
      <span>
        <strong class="pv-urgency__count">${viewers}</strong>
        people viewing this right now
      </span>
    `;

    buyArea.insertAdjacentElement('beforebegin', strip);

    // Fluctuate every 35–65 s
    const flicker = () => {
      const delta = Math.random() > 0.45 ? 1 : -1;
      viewers = Math.max(2, Math.min(16, viewers + delta));
      const el = strip.querySelector('.pv-urgency__count');
      if (el) {
        el.style.transition = 'opacity 0.3s';
        el.style.opacity = '0';
        setTimeout(() => { el.textContent = viewers; el.style.opacity = '1'; }, 300);
      }
      setTimeout(flicker, rand(35000, 65000));
    };
    setTimeout(flicker, rand(35000, 65000));
  }

  /* ─────────────────────────────────────────────
     4. SOCIAL PROOF TOAST
  ───────────────────────────────────────────── */
  function initToast() {
    if (!isProduct()) return;
    if (sessionStorage.getItem('pv_toast_shown')) return;
    sessionStorage.setItem('pv_toast_shown', '1');

    const delay = rand(6000, 14000);
    setTimeout(() => {
      const name  = pick(TOAST_NAMES);
      const city  = pick(TOAST_CITIES);
      const item  = pick(TOAST_PRODUCTS);
      const mins  = rand(2, 22);

      const toast = document.createElement('div');
      toast.className = 'pv-toast';
      toast.setAttribute('role', 'status');
      toast.setAttribute('aria-live', 'polite');
      toast.innerHTML = `
        <div class="pv-toast__paw" aria-hidden="true">🐾</div>
        <div class="pv-toast__body">
          <strong>${name} from ${city}</strong> just purchased ${item}
          <span class="pv-toast__time">${mins} min ago</span>
        </div>
        <button type="button" class="pv-toast__close" aria-label="Dismiss">×</button>
      `;

      document.body.appendChild(toast);
      requestAnimationFrame(() => requestAnimationFrame(() => toast.classList.add('pv-toast--in')));

      const dismiss = () => {
        toast.classList.remove('pv-toast--in');
        setTimeout(() => toast.remove(), 420);
      };

      toast.querySelector('.pv-toast__close').addEventListener('click', dismiss);
      setTimeout(dismiss, 6500);
    }, delay);
  }

  /* ─────────────────────────────────────────────
     5. EXIT INTENT POPUP
  ───────────────────────────────────────────── */
  function initExitIntent() {
    if (window.innerWidth < 768) return;
    if (sessionStorage.getItem('pv_exit_shown')) return;

    let timeOnSite = 0;
    const clock = setInterval(() => timeOnSite++, 1000);
    let fired = false;

    document.addEventListener('mouseleave', function handler(e) {
      if (e.clientY > 10 || fired || timeOnSite < 8) return;
      fired = true;
      clearInterval(clock);
      document.removeEventListener('mouseleave', handler);
      sessionStorage.setItem('pv_exit_shown', '1');
      renderExitPopup();
    });
  }

  function renderExitPopup() {
    const overlay = document.createElement('div');
    overlay.className = 'pv-exit';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'Exclusive discount offer');

    overlay.innerHTML = `
      <div class="pv-exit__modal">
        <button type="button" class="pv-exit__x" aria-label="Close">×</button>
        <div class="pv-exit__paw" aria-hidden="true">🐾</div>
        <p class="pv-exit__kicker">Wait — don't leave empty-pawed</p>
        <h2 class="pv-exit__title">10% off<br>your first order</h2>
        <p class="pv-exit__sub">Enter this code at checkout. One-time offer.</p>
        <div class="pv-exit__codebox">
          <span class="pv-exit__code" id="pv-disc-code">${DISCOUNT_CODE}</span>
          <button type="button" class="pv-exit__copy" data-code="${DISCOUNT_CODE}">Copy</button>
        </div>
        <a href="/collections/all" class="pv-exit__cta">Shop now &rarr;</a>
        <button type="button" class="pv-exit__pass">No thanks, I'll pay full price</button>
      </div>
    `;

    document.body.appendChild(overlay);
    document.body.style.overflow = 'hidden';

    requestAnimationFrame(() => requestAnimationFrame(() => overlay.classList.add('pv-exit--in')));

    const close = () => {
      overlay.classList.remove('pv-exit--in');
      document.body.style.overflow = '';
      setTimeout(() => overlay.remove(), 380);
    };

    overlay.querySelector('.pv-exit__x').addEventListener('click', close);
    overlay.querySelector('.pv-exit__pass').addEventListener('click', close);
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
    document.addEventListener('keydown', function esc(e) {
      if (e.key === 'Escape') { close(); document.removeEventListener('keydown', esc); }
    });

    overlay.querySelector('.pv-exit__copy').addEventListener('click', function () {
      const code = this.dataset.code;
      if (navigator.clipboard) {
        navigator.clipboard.writeText(code).then(() => {
          this.textContent = 'Copied!';
          this.classList.add('pv-exit__copy--done');
          setTimeout(() => {
            this.textContent = 'Copy';
            this.classList.remove('pv-exit__copy--done');
          }, 2200);
        });
      } else {
        // Fallback selection
        const el = document.getElementById('pv-disc-code');
        if (!el) return;
        const range = document.createRange();
        range.selectNodeContents(el);
        window.getSelection().removeAllRanges();
        window.getSelection().addRange(range);
      }
    });
  }

  /* ─────────────────────────────────────────────
     6. SCROLL FADE-IN ANIMATIONS
  ───────────────────────────────────────────── */
  function initScrollAnimations() {
    if (!('IntersectionObserver' in window)) return;

    const targets = document.querySelectorAll(
      '.pv-rev-card, .pv-prod-card, .pv-cat-card, .pv-tbar__item, .pv-best__header, .pv-revs__head, .pv-life__text-col, .pv-promise__left, .pv-val'
    );
    if (!targets.length) return;

    const io = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('pv-visible');
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.08, rootMargin: '0px 0px -32px 0px' });

    targets.forEach((el, i) => {
      el.style.setProperty('--pv-i', i % 6); // stagger up to 6 items
      el.classList.add('pv-will-fade');
      io.observe(el);
    });
  }

  /* ─────────────────────────────────────────────
     BOOT
  ───────────────────────────────────────────── */
  function boot() {
    initAnnouncementRotation();
    initHeroVariants();
    initProductUrgency();
    initToast();
    initExitIntent();
    initScrollAnimations();
  }

  document.readyState === 'loading'
    ? document.addEventListener('DOMContentLoaded', boot)
    : boot();
})();
