(function(){
  function initSidebarNav(){
    const links = document.querySelectorAll('aside nav a.sidebar-link');
    if (!links || !links.length) return;
    links.forEach(a=>{
      // guard to avoid collapse/expand flicker on pointer down
      a.addEventListener('mousedown', function(){ const asideEl = document.querySelector('aside.sidebar-collapsed'); if (asideEl) asideEl.classList.add('no-collapse'); });
      a.addEventListener('touchstart', function(){ const asideEl = document.querySelector('aside.sidebar-collapsed'); if (asideEl) asideEl.classList.add('no-collapse'); }, {passive:true});

      a.addEventListener('click', function(e){
        const href = a.getAttribute('href');
        if (!href || href.startsWith('#')) return;
        const current = location.pathname.split('/').pop();
        if (current === href) return; // already on same page
        e.preventDefault();
        const asideEl = document.querySelector('aside.sidebar-collapsed');
        if (asideEl) { setTimeout(()=> asideEl.classList.remove('no-collapse'), 1200); }
        const main = document.querySelector('main') || document.querySelector('.main-content') || document.body;
        if (main) main.classList.add('page-exit');
        setTimeout(()=> { location.href = href; }, 260);
      });
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initSidebarNav);
  else initSidebarNav();
})();
