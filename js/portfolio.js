'use strict';

(() => {
  const root = document.documentElement;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');
  const themeToggle = document.getElementById('themeToggle');
  const header = document.querySelector('.site-header');
  const menuToggle = document.getElementById('menuToggle');
  const nav = document.getElementById('navLinks');
  const navLinks = [...nav.querySelectorAll('a')];
  const progress = document.querySelector('.reading-progress');
  const motionToggle = document.getElementById('motionToggle');
  let userPaused = false;

  function updateThemeLabel() {
    const nextTheme = root.dataset.theme === 'dark' ? 'light' : 'dark';
    themeToggle.setAttribute('aria-label', `Switch to ${nextTheme} theme`);
    themeToggle.title = `Switch to ${nextTheme} theme`;
    document.querySelector('meta[name="theme-color"]').content = root.dataset.theme === 'dark' ? '#0a0d0e' : '#f7f9f8';
  }
  updateThemeLabel();
  themeToggle.addEventListener('click', () => {
    root.dataset.theme = root.dataset.theme === 'dark' ? 'light' : 'dark';
    try { localStorage.setItem('theme', root.dataset.theme); } catch { /* Theme works without storage. */ }
    updateThemeLabel();
  });

  function setMenu(open) {
    nav.classList.toggle('open', open);
    header.classList.toggle('menu-open', open);
    menuToggle.setAttribute('aria-expanded', String(open));
    menuToggle.setAttribute('aria-label', open ? 'Close navigation' : 'Open navigation');
  }
  menuToggle.addEventListener('click', () => setMenu(menuToggle.getAttribute('aria-expanded') !== 'true'));
  navLinks.forEach(link => link.addEventListener('click', () => setMenu(false)));
  document.addEventListener('click', event => { if (!header.contains(event.target)) setMenu(false); });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && menuToggle.getAttribute('aria-expanded') === 'true') {
      setMenu(false);
      menuToggle.focus();
    }
  });
  window.matchMedia('(min-width: 801px)').addEventListener('change', event => { if (event.matches) setMenu(false); });

  // Content stays visible if JavaScript or IntersectionObserver is unavailable.
  const reveals = [...document.querySelectorAll('.reveal')];
  if ('IntersectionObserver' in window && !reducedMotion.matches) {
    const revealObserver = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          revealObserver.unobserve(entry.target);
        }
      }
    }, { threshold: 0.06, rootMargin: '0px 0px -20px 0px' });
    reveals.forEach(element => revealObserver.observe(element));
    root.classList.add('motion-enabled');
  }
  reducedMotion.addEventListener('change', () => {
    if (reducedMotion.matches) root.classList.remove('motion-enabled');
    updateMotion();
  });

  const sectionLinks = navLinks.map(link => ({ link, section: document.querySelector(link.getAttribute('href')) }));
  let scrollQueued = false;
  function updateScroll() {
    const scrollable = root.scrollHeight - window.innerHeight;
    const amount = scrollable > 0 ? Math.min(1, Math.max(0, window.scrollY / scrollable)) : 0;
    progress.style.transform = `scaleX(${amount})`;
    header.classList.toggle('scrolled', window.scrollY > 24);
    let active = null;
    for (const item of sectionLinks) {
      if (item.section && item.section.getBoundingClientRect().top < window.innerHeight * 0.38) active = item.link;
    }
    for (const { link } of sectionLinks) {
      link.classList.toggle('active', link === active);
      if (link === active) link.setAttribute('aria-current', 'location');
      else link.removeAttribute('aria-current');
    }
    scrollQueued = false;
  }
  function queueScroll() {
    if (!scrollQueued) { scrollQueued = true; requestAnimationFrame(updateScroll); }
  }
  window.addEventListener('scroll', queueScroll, { passive: true });
  window.addEventListener('resize', queueScroll, { passive: true });
  updateScroll();

  document.querySelectorAll('.spotlight').forEach(card => {
    card.addEventListener('pointermove', event => {
      if (!finePointer.matches || reducedMotion.matches || userPaused) return;
      const rect = card.getBoundingClientRect();
      card.style.setProperty('--pointer-x', `${event.clientX - rect.left}px`);
      card.style.setProperty('--pointer-y', `${event.clientY - rect.top}px`);
    });
  });
  document.querySelectorAll('.magnetic').forEach(button => {
    button.addEventListener('pointermove', event => {
      if (!finePointer.matches || reducedMotion.matches || userPaused) return;
      const rect = button.getBoundingClientRect();
      const x = (event.clientX - rect.left - rect.width / 2) * 0.09;
      const y = (event.clientY - rect.top - rect.height / 2) * 0.12;
      button.style.transform = `translate(${x}px, ${y}px)`;
    });
    button.addEventListener('pointerleave', () => { button.style.transform = ''; });
  });

  // Native dialog provides focus containment and Escape support; links work without JS.
  const dialog = document.getElementById('imageDialog');
  const zoomImage = document.getElementById('zoomImage');
  const imageCaption = document.getElementById('imageCaption');
  let lastZoomTrigger = null;
  document.querySelectorAll('[data-zoom]').forEach(link => {
    link.addEventListener('click', event => {
      if (typeof dialog.showModal !== 'function' || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      lastZoomTrigger = link;
      const sourceImage = link.querySelector('img');
      zoomImage.src = link.href;
      zoomImage.alt = sourceImage.alt;
      imageCaption.textContent = sourceImage.alt;
      dialog.showModal();
      document.body.classList.add('modal-open');
    });
  });
  dialog.querySelector('.dialog-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const rect = dialog.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
  });
  dialog.addEventListener('close', () => {
    document.body.classList.remove('modal-open');
    lastZoomTrigger?.focus({ preventScroll: true });
  });

  // A sampled toroidal surface: local Canvas 2D, no tracking, textures or WebGL dependency.
  // Work stops off-screen, in hidden tabs, on user pause, and with reduced motion enabled.
  const canvas = document.getElementById('geometryCanvas');
  const art = document.getElementById('heroArt');
  const context = canvas.getContext('2d');
  if (!context) { motionToggle.hidden = true; return; }
  let width = 0;
  let height = 0;
  let frame = null;
  let visible = true;
  let time = 0;
  let lastTime = 0;
  let lastDraw = 0;
  let pointerX = 0;
  let pointerY = 0;
  let smoothX = 0;
  let smoothY = 0;
  let points = [];
  const tau = Math.PI * 2;
  let dark = root.dataset.theme === 'dark';

  function makePoints() {
    points = [];
    const rings = width < 460 ? 94 : 136;
    const steps = width < 460 ? 36 : 46;
    for (let i = 0; i < rings; i++) {
      const u = i / rings * tau;
      for (let j = 0; j < steps; j++) {
        const v = j / steps * tau;
        const twist = v + u * 1.5;
        const radius = 1.18 + 0.12 * Math.cos(u * 3);
        const tube = .42 + .075 * Math.sin(u * 3);
        points.push({
          x: (radius + tube * Math.cos(twist)) * Math.cos(u),
          y: (radius + tube * Math.cos(twist)) * Math.sin(u),
          z: tube * Math.sin(twist) + .2 * Math.sin(u * 3),
          tone: Math.sin(u + v * .65),
          bright: j % 6 === 0
        });
      }
    }
  }

  function resizeCanvas() {
    const bounds = art.getBoundingClientRect();
    width = bounds.width;
    height = bounds.height;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    makePoints();
    draw();
  }

  function draw() {
    context.clearRect(0, 0, width, height);
    const cx = width * .51;
    const cy = height * .5;
    const scale = Math.min(width, height) * .235;
    const a = -.9 + Math.sin(time * .13) * .15 + smoothY * .22;
    const b = time * .12 + .45 + smoothX * .3;
    const c = -.43;
    const ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b), cc = Math.cos(c), sc = Math.sin(c);

    // Fine reference ellipses and axes support the geometric research aesthetic.
    context.strokeStyle = dark ? '#a6efce12' : '#12654a20';
    context.lineWidth = .65;
    context.beginPath();
    context.ellipse(cx, cy, scale * 1.97, scale * 1.97, 0, 0, tau);
    context.stroke();
    context.setLineDash([2, 8]);
    context.beginPath();
    context.ellipse(cx, cy, scale * 2.1, scale * .71, -.45, 0, tau);
    context.stroke();
    context.setLineDash([]);

    // Bucket by depth and hue to keep draws inexpensive on mobile hardware.
    const buckets = Array.from({ length: 18 }, () => []);
    for (const point of points) {
      const y1 = point.y * ca - point.z * sa;
      const z1 = point.y * sa + point.z * ca;
      const x2 = point.x * cb + z1 * sb;
      const z2 = -point.x * sb + z1 * cb;
      const x3 = x2 * cc - y1 * sc;
      const y3 = x2 * sc + y1 * cc;
      const depth = Math.max(0, Math.min(5, Math.floor((z2 + 1.9) / 3.8 * 6)));
      const tone = point.tone > .38 ? 0 : point.tone < -.38 ? 2 : 1;
      const perspective = 4.9 / (4.9 - z2);
      buckets[depth * 3 + tone].push([cx + x3 * scale * perspective, cy + y3 * scale * perspective, (.65 + depth * .085 + (point.bright ? .12 : 0)) * perspective]);
    }
    const palette = dark ? ['157,237,213', '107,193,186', '166,157,236'] : ['20,114,80', '24,100,103', '95,78,154'];
    for (let i = 0; i < buckets.length; i++) {
      const depth = Math.floor(i / 3);
      context.fillStyle = `rgba(${palette[i % 3]},${(dark ? .15 : .2) + depth * .135})`;
      context.beginPath();
      for (const [x, y, r] of buckets[i]) {
        context.moveTo(x + r, y);
        context.arc(x, y, r, 0, tau);
      }
      context.fill();
    }
  }

  function shouldAnimate() { return visible && !document.hidden && !userPaused && !reducedMotion.matches; }
  function animate(now) {
    frame = null;
    if (!shouldAnimate()) { lastTime = 0; return; }
    if (!lastTime) lastTime = now;
    const delta = Math.min((now - lastTime) / 1000, .05);
    time += delta;
    lastTime = now;
    smoothX += (pointerX - smoothX) * .05;
    smoothY += (pointerY - smoothY) * .05;
    // Cap at 30 fps; the slow sculpture motion remains smooth without wasting battery.
    if (now - lastDraw > 32) { draw(); lastDraw = now; }
    frame = requestAnimationFrame(animate);
  }
  function syncAnimation() {
    if (shouldAnimate()) {
      if (frame === null) frame = requestAnimationFrame(animate);
    } else {
      if (frame !== null) cancelAnimationFrame(frame);
      frame = null;
      lastTime = 0;
      draw();
    }
  }
  function updateMotion() {
    if (motionToggle.hidden) return;
    const paused = userPaused || reducedMotion.matches;
    root.classList.toggle('motion-paused', paused);
    if (paused) {
      root.classList.remove('motion-enabled');
      document.querySelectorAll('.magnetic').forEach(button => { button.style.transform = ''; });
    }
    motionToggle.setAttribute('aria-pressed', String(paused));
    motionToggle.setAttribute('aria-label', reducedMotion.matches ? 'Animation paused by system reduced motion setting' : paused ? 'Resume background animation' : 'Pause background animation');
    motionToggle.querySelector('.motion-label').textContent = reducedMotion.matches ? 'Reduced motion' : paused ? 'Resume motion' : 'Pause motion';
    motionToggle.querySelector('.motion-icon').textContent = paused ? '▷' : 'Ⅱ';
    motionToggle.disabled = reducedMotion.matches;
    syncAnimation();
  }
  motionToggle.addEventListener('click', () => { userPaused = !userPaused; updateMotion(); });
  art.addEventListener('pointermove', event => {
    if (!finePointer.matches || reducedMotion.matches || userPaused) return;
    const rect = art.getBoundingClientRect();
    pointerX = (event.clientX - rect.left) / rect.width * 2 - 1;
    pointerY = (event.clientY - rect.top) / rect.height * 2 - 1;
  });
  art.addEventListener('pointerleave', () => { pointerX = 0; pointerY = 0; });
  if ('IntersectionObserver' in window) {
    const artObserver = new IntersectionObserver(entries => {
      visible = entries[0].isIntersecting;
      syncAnimation();
    }, { rootMargin: '60px' });
    artObserver.observe(art);
  }
  document.addEventListener('visibilitychange', syncAnimation);
  new MutationObserver(() => {
    const nextDark = root.dataset.theme === 'dark';
    if (nextDark !== dark) { dark = nextDark; draw(); }
  }).observe(root, { attributes: true, attributeFilter: ['data-theme'] });
  if ('ResizeObserver' in window) new ResizeObserver(resizeCanvas).observe(art);
  else window.addEventListener('resize', resizeCanvas, { passive: true });
  resizeCanvas();
  updateMotion();
})();
