(() => {
  'use strict';
  // Keep the original page alive; load its sibling only once in a cached frame.
  // Viewer state stays in its existing DOM and closure, without reconstruction.
  const links = [...document.querySelectorAll('nav a[data-site-page]')];
  const current = links.find(link => link.getAttribute('aria-current') === 'page');
  if (!current || links.length !== 2) return;
  const page = current.dataset.sitePage;
  const initialURL = new URL(location.href);
  const pages = new Map(links.map(link => [link.dataset.sitePage, new URL(link.href, location.href)]));
  const channel = 'spatial-notes-navigation', frameName = 'spatial-notes-cached-page';
  const origin = location.origin, targetOrigin = origin === 'null' ? '*' : origin;
  const embedded = window.parent !== window && window.name === frameName;
  const emitActive = active => {
    document.documentElement.dataset.sitePageActive = String(active);
    window.dispatchEvent(new CustomEvent('spatialnotes:activechange', {detail: {active}}));
  };
  const pageFor = address => {
    try {
      const url = new URL(address, location.href);
      for (const [kind, route] of pages) {
        if (url.origin === route.origin && url.search === route.search &&
            (url.pathname === route.pathname || kind === page && url.pathname === initialURL.pathname)) return kind;
      }
    } catch {}
    return null;
  };
  function fragment(address) {
    const url = new URL(address, location.href);
    if (url.hash === location.hash) return;
    history.replaceState(history.state, '', url.href);
    let id;
    try { id = decodeURIComponent(url.hash.slice(1)); } catch { return; }
    const anchor = id && document.getElementById(id);
    if (anchor) anchor.scrollIntoView();
    else if (!id) window.scrollTo(0, 0);
  }
  function plainClick(event, link) {
    return !event.defaultPrevented && event.button === 0 && !event.ctrlKey && !event.metaKey &&
      !event.shiftKey && !event.altKey && !link.hasAttribute('download') &&
      (!link.target || link.target === '_self');
  }
  if (embedded) {
    const send = (type, extra = {}) => window.parent.postMessage({channel, type, page, ...extra}, targetOrigin);
    document.documentElement.style.overscrollBehavior = 'none';
    document.addEventListener('click', event => {
      const link = event.target.closest?.('a');
      if (!link || !plainClick(event, link)) return;
      const kind = pageFor(link.href);
      if (link.matches('nav a[data-site-page]') && kind) {
        event.preventDefault();
        send('navigate', {target: kind});
      } else if (kind === page && new URL(link.href).hash) {
        // Avoid adding a joint iframe-history entry for article section links.
        event.preventDefault();
        fragment(link.href);
        send('route', {url: location.href});
      }
    });
    window.addEventListener('message', event => {
      if (event.source !== window.parent || event.origin !== origin || event.data?.channel !== channel) return;
      if (event.data.type === 'activate') {
        emitActive(event.data.active === true);
        if (event.data.url && pageFor(event.data.url) === page) fragment(event.data.url);
      }
    });
    const title = document.querySelector('title');
    if (title) new MutationObserver(() => send('title', {title: document.title})).observe(title, {childList: true, subtree: true, characterData: true});
    window.addEventListener('hashchange', () => send('route', {url: location.href}));
    send('ready', {url: location.href, title: document.title});
    emitActive(true);
    return;
  }
  const sibling = [...pages.keys()].find(kind => kind !== page);
  const records = new Map([...pages].map(([kind, url]) => [kind, {url: url.href, title: kind === 'document' ? '当前文档' : '实验记录'}]));
  records.set(page, {url: location.href, title: document.title});
  let active = page, frame = null, baseScroll = [0, 0], baseNodes = [], oldOverflow = '';
  document.documentElement.dataset.activeSitePage = active;
  try {
    history.scrollRestoration = 'manual';
    history.replaceState({...history.state, siteNavigation: {page, url: location.href}}, '', location.href);
  } catch {}
  function markHistory(kind, address, mode) {
    if (mode === 'none') return;
    try {
      const state = {...history.state, siteNavigation: {page: kind, url: address}};
      if (mode === 'push') history.pushState(state, '', address);
      else history.replaceState(state, '', address);
    } catch {
      // Restricted file:// history still retains both live pages. The original
      // anchors also keep working in separate tabs and without JavaScript.
    }
  }
  function activateFrame(value, address) {
    if (!frame) return;
    frame.dataset.active = String(value);
    frame.setAttribute('aria-hidden', String(!value));
    frame.inert = !value;
    frame.style.visibility = value ? 'visible' : 'hidden';
    frame.style.pointerEvents = value ? 'auto' : 'none';
    frame.contentWindow?.postMessage({channel, type: 'activate', active: value, url: address}, targetOrigin);
  }
  function freezeBase() {
    baseScroll = [window.scrollX, window.scrollY];
    if (pageFor(location.href) === page) records.get(page).url = location.href;
    records.get(page).title = document.title;
    emitActive(false);
    baseNodes = [...document.body.children].filter(node => node !== frame).map(node => [node, node.inert, node.getAttribute('aria-hidden')]);
    for (const [node] of baseNodes) { node.inert = true; node.setAttribute('aria-hidden', 'true'); }
    oldOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';
  }
  function thawBase() {
    document.documentElement.style.overflow = oldOverflow;
    for (const [node, inert, hidden] of baseNodes) {
      node.inert = inert;
      if (hidden === null) node.removeAttribute('aria-hidden');
      else node.setAttribute('aria-hidden', hidden);
    }
    baseNodes = [];
    window.scrollTo(...baseScroll);
    emitActive(true);
    requestAnimationFrame(() => { if (active === page) window.scrollTo(...baseScroll); });
  }
  function navigate(kind, mode = 'push', address = null) {
    if (!pages.has(kind) || kind === active) return;
    const next = records.get(kind);
    if (active === page) freezeBase();
    active = kind;
    document.documentElement.dataset.activeSitePage = kind;
    if (kind !== page && !frame) {
      frame = document.createElement('iframe');
      frame.id = 'siteCachedPage';
      frame.name = frameName;
      frame.title = kind === 'document' ? '当前文档' : '实验记录';
      frame.dataset.sitePage = kind;
      frame.setAttribute('aria-label', frame.title);
      // Never display:none: retain nonzero canvas dimensions while inactive,
      // including when a slow scene request finishes in the background.
      frame.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;border:0;background:#fff;z-index:2147483000;visibility:hidden;pointer-events:none';
      frame.src = next.url;
      document.body.append(frame);
    }
    activateFrame(kind !== page, address || next.url);
    if (kind === page) thawBase();
    const url = address || next.url;
    next.url = url;
    markHistory(kind, url, mode);
    document.title = next.title;
    if (kind !== page) frame.focus({preventScroll: true});
    if (address && kind === page) fragment(address);
  }
  document.addEventListener('click', event => {
    const link = event.target.closest?.('nav a[data-site-page]');
    if (!link || !plainClick(event, link)) return;
    const kind = pageFor(link.href);
    if (!kind) return;
    event.preventDefault();
    navigate(kind);
  });
  window.addEventListener('message', event => {
    const message = event.data;
    if (!frame || event.source !== frame.contentWindow || event.origin !== origin || message?.channel !== channel || message.page !== sibling) return;
    const record = records.get(sibling);
    if (message.type === 'navigate' && pages.has(message.target)) navigate(message.target);
    else if (message.type === 'ready') {
      if (pageFor(message.url) === sibling) record.url = message.url;
      if (typeof message.title === 'string') record.title = message.title;
      activateFrame(active === sibling, record.url);
      if (active === sibling) document.title = record.title;
    } else if (message.type === 'title' && typeof message.title === 'string') {
      record.title = message.title;
      if (active === sibling) document.title = record.title;
    } else if (message.type === 'route' && pageFor(message.url) === sibling) {
      record.url = message.url;
      if (active === sibling) markHistory(sibling, record.url, 'replace');
    }
  });
  window.addEventListener('popstate', event => {
    const kind = pageFor(location.href) || event.state?.siteNavigation?.page;
    if (kind && kind !== active) navigate(kind, 'none', location.href);
  });
  window.addEventListener('hashchange', () => {
    if (active === page && pageFor(location.href) === page) {
      records.get(page).url = location.href;
      markHistory(page, location.href, 'replace');
    }
  });
  emitActive(true);
})();
