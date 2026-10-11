(() => {
  'use strict';
  if (['#viewer', '#details', '#objectsPanel'].includes(location.hash)) {
    location.replace('experiments.html' + location.hash);
    return;
  }
  const menu = document.querySelector('#menuToggle');
  const nav = document.querySelector('#siteNav');
  const progress = document.querySelector('#readingProgress');
  const article = document.querySelector('#article');
  const headings = [...article.querySelectorAll('h1[id],h2[id],h3[id],h4[id]')];
  const links = [...document.querySelectorAll('[data-section]')];
  let pending = false;
  function closeMenu() {
    menu.setAttribute('aria-expanded', 'false');
    nav.classList.remove('is-open');
  }
  menu.addEventListener('click', () => {
    const open = menu.getAttribute('aria-expanded') !== 'true';
    menu.setAttribute('aria-expanded', String(open));
    nav.classList.toggle('is-open', open);
  });
  nav.addEventListener('click', event => { if (event.target.closest('a')) closeMenu(); });
  document.addEventListener('keydown', event => { if (event.key === 'Escape') closeMenu(); });
  document.querySelectorAll('.mobile-toc a').forEach(link => link.addEventListener('click', () => {
    document.querySelector('.mobile-toc').open = false;
  }));
  function updateReading() {
    pending = false;
    const box = article.getBoundingClientRect();
    const value = Math.round(Math.min(100, Math.max(0, (140 - box.top) / Math.max(1, box.height - innerHeight + 160) * 100)));
    progress.setAttribute('aria-valuenow', String(value));
    progress.querySelector('span').style.width = `${value}%`;
    const tocHeadings = headings.filter(heading => links.some(link => link.dataset.section === heading.id));
    let active = tocHeadings[0]?.id;
    for (const heading of tocHeadings) { if (heading.getBoundingClientRect().top <= 145) active = heading.id; }
    for (const link of links) {
      if (link.dataset.section === active) link.setAttribute('aria-current', 'location');
      else link.removeAttribute('aria-current');
    }
  }
  function scheduleUpdate() { if (!pending) { pending = true; requestAnimationFrame(updateReading); } }
  addEventListener('scroll', scheduleUpdate, {passive:true});
  addEventListener('resize', scheduleUpdate);
  addEventListener('pageshow', scheduleUpdate);
  updateReading();
})();
