/* Staggered reveal for key sections */
(function() {
  'use strict';

  function revealNow(items) {
    items.forEach((item, index) => {
      setTimeout(() => item.classList.add('is-visible'), index * 80);
    });
  }

  function init() {
    const items = Array.from(document.querySelectorAll('.reveal'));
    if (!items.length) return;

    if (!('IntersectionObserver' in window)) {
      revealNow(items);
      return;
    }

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.15 });

    items.forEach((item) => observer.observe(item));
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
