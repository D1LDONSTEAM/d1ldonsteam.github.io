/* ==========================================================
   D1LDONS TEAM — app.js
   Монохромный редизайн: 3D-карусель игроков + статусы Steam
   ========================================================== */
(function () {
  'use strict';

  /* ----------------------------------------------------------
     ДАННЫЕ ИГРОКОВ — единый источник правды для карточек.
     Связь с Cloudflare Worker идёт по SteamID64 (поле id),
     поэтому смена ника в Steam/Worker ничего не ломает.
     Значения null отображаются как «—».
     ---------------------------------------------------------- */
  var PLAYERS = [
    {
      id: '76561199788032731',
      nick: 'Kiporiss',
      role: 'AWPer',
      quote: 'Главная огневая мощь и точные выстрелы из AWP.',
      steam: 'https://steamcommunity.com/profiles/76561199788032731',
      premier: { rating: '11 750', wr: '55.4%', kd: '1.09', hs: '35.5%' },
      faceit: null,
      // TODO: запросить у пользователя реальные настройки CFG
      cfg: { sens: null, dpi: null, res: null, maps: null, crosshair: null },
      weapons: ['AWP']
    },
    {
      id: '76561199508602143',
      nick: 'Hell7Staf',
      role: 'Rifler',
      quote: 'Мастер энтри-фрагов и контроля спрея.',
      steam: 'https://steamcommunity.com/profiles/76561199508602143',
      premier: { rating: '6 444', wr: '50.7%', kd: '0.97', hs: '42%' },
      faceit: { rating: '913', wr: '63%', kd: '1.05', hs: '41%' },
      // TODO: запросить у пользователя реальные настройки CFG
      cfg: { sens: null, dpi: null, res: null, maps: null, crosshair: null },
      weapons: ['AK-47', 'M4A1-S']
    },
    {
      id: '76561199205058140',
      nick: 'От4Им',
      role: 'Капитан · IGL',
      quote: 'Тактический мозг и координатор команды.',
      steam: 'https://steamcommunity.com/id/DST_Ot4Im',
      premier: { rating: '12 451', wr: '48%', kd: '0.93', hs: '46.2%' },
      faceit: { rating: '1 182', wr: '68%', kd: '1.03', hs: '46%' },
      cfg: {
        sens: '2.52 (Zoom 1.0)',
        dpi: null, // не сохраняется в cfg (настройка мыши)
        res: 'Высота 1050p',
        maps: null,
        crosshair: 'cl_crosshairstyle 4; cl_crosshairsize 2; cl_crosshairgap 4; cl_crosshairthickness 0.5; cl_crosshair_drawoutline 1; cl_crosshaircolor_r 255; cl_crosshaircolor_g 0; cl_crosshaircolor_b 0'
      },
      weapons: ['AK-47', 'M4A4', 'AWP']
    },
    {
      id: '76561199169413562',
      nick: 'Саня чекунец',
      role: 'Anchor',
      quote: 'Главный якорь команды.',
      steam: 'https://steamcommunity.com/profiles/76561199169413562',
      premier: { rating: '9 605', wr: '50.5%', kd: '0.92', hs: '39.2%' },
      faceit: null,
      // TODO: запросить у пользователя реальные настройки CFG
      cfg: { sens: null, dpi: null, res: null, maps: null, crosshair: null },
      weapons: ['NEGEV', '(AK-47)', '(AWP)', '(M4A1-S)']
    },
    {
      id: '76561198035258646',
      nick: 'nekiassa',
      role: 'Lurker',
      quote: 'Тихий охотник. Читает карту, режет связи и создаёт хаос в тылу.',
      steam: 'https://steamcommunity.com/profiles/76561198035258646/',
      premier: null,
      faceit: null,
      // TODO: запросить у пользователя реальные настройки CFG
      cfg: { sens: null, dpi: null, res: null, maps: null, crosshair: null },
      weapons: ['AWP', 'AK-47', 'M4A1-S']
    }
  ];

  var WORKER_URL = 'https://dst-steam-status.grivital8.workers.dev';
  var REFRESH_MS = 60000;
  var FETCH_TIMEOUT_MS = 8000;
  var WHEEL_COOLDOWN_MS = 400;
  var SWIPE_THRESHOLD = 40;

  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- helpers ---------- */
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function isSafeUrl(u) { return typeof u === 'string' && /^https:\/\/[^\s"'<>]+$/.test(u); }
  function shortGame(name) {
    if (!name) return '';
    return /counter-?strike/i.test(name) ? 'CS2' : String(name).toUpperCase();
  }

  /* ==========================================================
     КАРУСЕЛЬ
     ========================================================== */
  function initCarousel() {
    var stage = document.getElementById('stage');
    var tabsBox = document.getElementById('carTabs');
    var prevBtn = document.getElementById('carPrev');
    var nextBtn = document.getElementById('carNext');
    var countEl = document.getElementById('carCount');
    var live = document.getElementById('carLive');
    if (!stage) return;

    var n = PLAYERS.length;
    var active = 0;
    var cards = [];
    var tabs = [];
    var cardsById = {};
    var statusLoaded = false;

    /* ----- построение блока статистики ----- */
    function statBlock(label, s) {
      var box = el('div', 'pc-block');
      var head = el('div', 'pc-block-head');
      head.appendChild(el('span', 'lbl', label));
      head.appendChild(el('span', 'rating', s.rating));
      var grid = el('div', 'pc-grid3');
      [['wr', 'Win rate'], ['kd', 'K/D'], ['hs', 'HS%']].forEach(function (k) {
        var c = el('div', 'pc-cell');
        c.appendChild(el('div', 'v', s[k[0]]));
        c.appendChild(el('div', 'l', k[1]));
        grid.appendChild(c);
      });
      box.appendChild(head);
      box.appendChild(grid);
      return box;
    }

    function cfgRow(key, value) {
      var row = el('div', 'cfg-row');
      row.appendChild(el('span', 'k', key));
      var empty = value == null || value === '' || (Array.isArray(value) && !value.length);
      var v = el('span', 'v' + (empty ? ' is-empty' : ''), empty ? '—' : (Array.isArray(value) ? value.join(', ') : String(value)));
      row.appendChild(v);
      return row;
    }

    /* ----- копирование кода прицела ----- */
    function copyText(text) {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        return navigator.clipboard.writeText(text);
      }
      return new Promise(function (resolve, reject) {
        try {
          var ta = document.createElement('textarea');
          ta.value = text;
          ta.setAttribute('readonly', '');
          ta.style.position = 'fixed';
          ta.style.opacity = '0';
          document.body.appendChild(ta);
          ta.select();
          var ok = document.execCommand('copy');
          document.body.removeChild(ta);
          ok ? resolve() : reject(new Error('copy failed'));
        } catch (e) { reject(e); }
      });
    }

    /* ----- карточка ----- */
    function buildCard(p, i) {
      var card = el('article', 'pcard');
      card.dataset.view = 'profile';
      card.setAttribute('aria-label', p.nick);

      // шапка: номер + статус
      var head = el('div', 'pc-head');
      head.appendChild(el('span', 'pc-num', pad(i + 1) + ' / ' + pad(n)));
      var st = el('span', 'pc-status st-loading');
      st.appendChild(el('i', 'dot'));
      st.appendChild(el('span', 'st-text', 'LOADING'));
      head.appendChild(st);
      card.appendChild(head);

      card.appendChild(el('h3', 'pc-nick', p.nick));
      card.appendChild(el('div', 'pc-role', p.role));

      // переключатель вида
      var sw = el('div', 'pc-switch');
      var bProfile = el('button', null, 'Профиль');
      var bCfg = el('button', null, 'CFG и сигнатурки');
      bProfile.type = bCfg.type = 'button';
      bProfile.setAttribute('aria-pressed', 'true');
      bCfg.setAttribute('aria-pressed', 'false');
      function setView(v) {
        card.dataset.view = v;
        bProfile.setAttribute('aria-pressed', String(v === 'profile'));
        bCfg.setAttribute('aria-pressed', String(v === 'cfg'));
      }
      bProfile.addEventListener('click', function () { setView('profile'); });
      bCfg.addEventListener('click', function () { setView('cfg'); });
      sw.appendChild(bProfile);
      sw.appendChild(bCfg);
      card.appendChild(sw);

      var views = el('div', 'pc-views');

      // --- Профиль ---
      var vp = el('div', 'pc-view');
      vp.dataset.v = 'profile';
      var top = el('div', 'pc-top');
      var photo = el('div', 'pc-photo');
      photo.appendChild(el('span', 'ph-letter', p.nick.charAt(0).toUpperCase()));
      top.appendChild(photo);
      top.appendChild(el('p', 'pc-quote', p.quote));
      vp.appendChild(top);
      if (p.premier) vp.appendChild(statBlock('CS2 Premier · S4', p.premier));
      if (p.faceit) vp.appendChild(statBlock('FACEIT · S8', p.faceit));
      if (!p.premier && !p.faceit) vp.appendChild(el('div', 'pc-empty', 'Статистика пока недоступна'));
      views.appendChild(vp);

      // --- CFG ---
      var vc = el('div', 'pc-view');
      vc.dataset.v = 'cfg';
      var list = el('div', 'cfg-list');
      list.appendChild(cfgRow('Sens', p.cfg.sens));
      list.appendChild(cfgRow('DPI', p.cfg.dpi));
      list.appendChild(cfgRow('Разрешение', p.cfg.res));
      list.appendChild(cfgRow('Карты', p.cfg.maps));
      vc.appendChild(list);

      var xh = el('div', 'xh-box');
      xh.appendChild(el('span', 'mini-label', 'Код прицела CS2'));
      var hasCode = !!p.cfg.crosshair;
      xh.appendChild(el('code', 'xh-code' + (hasCode ? '' : ' is-empty'), hasCode ? p.cfg.crosshair : '—'));
      var copy = el('button', 'copy-btn', 'Копировать');
      copy.type = 'button';
      copy.disabled = !hasCode;
      var copyTimer = null;
      copy.addEventListener('click', function () {
        if (!hasCode) return;
        copyText(p.cfg.crosshair).then(function () {
          copy.textContent = 'Скопировано';
        }, function () {
          copy.textContent = 'Не удалось';
        }).then(function () {
          clearTimeout(copyTimer);
          copyTimer = setTimeout(function () { copy.textContent = 'Копировать'; }, 1600);
        });
      });
      xh.appendChild(copy);
      vc.appendChild(xh);
      views.appendChild(vc);
      card.appendChild(views);

      // --- Подвал ---
      var foot = el('div', 'pc-foot');
      var wp = el('div', 'pc-weapons');
      wp.appendChild(el('span', 'lbl', 'Оружие'));
      if (p.weapons && p.weapons.length) {
        p.weapons.forEach(function (w) { wp.appendChild(el('span', 'tag', w)); });
      } else {
        wp.appendChild(el('span', 'tag is-empty', '—'));
      }
      foot.appendChild(wp);
      var steam = el('a', 'pc-steam', 'Профиль Steam →');
      steam.href = p.steam;
      steam.target = '_blank';
      steam.rel = 'noopener';
      foot.appendChild(steam);
      card.appendChild(foot);

      // клик по неактивной карточке — перелистывание на неё
      card.addEventListener('click', function (e) {
        if (i !== active) {
          e.preventDefault();
          e.stopPropagation();
          goTo(i);
        }
      }, true);

      return card;
    }

    PLAYERS.forEach(function (p, i) {
      var c = buildCard(p, i);
      cards.push(c);
      cardsById[p.id] = c;
      stage.appendChild(c);

      var t = el('button', 'car-tab', pad(i + 1));
      t.type = 'button';
      t.title = p.nick;
      t.setAttribute('aria-label', 'Игрок ' + (i + 1) + ': ' + p.nick);
      t.addEventListener('click', function () { goTo(i); });
      tabs.push(t);
      if (tabsBox) tabsBox.appendChild(t);
    });

    /* ----- состояние ----- */
    function render() {
      cards.forEach(function (c, i) {
        var d = i - active;
        var ad = Math.abs(d);
        c.style.setProperty('--d', d);
        c.style.setProperty('--ad', ad);
        c.style.zIndex = String(10 - ad);
        c.classList.toggle('is-active', d === 0);
        c.classList.toggle('is-far', ad > 2);
        c.setAttribute('aria-hidden', d === 0 ? 'false' : 'true');
        var focusables = c.querySelectorAll('button, a');
        for (var k = 0; k < focusables.length; k++) {
          focusables[k].tabIndex = d === 0 ? 0 : -1;
        }
      });
      tabs.forEach(function (t, i) {
        t.setAttribute('aria-current', String(i === active));
      });
      if (prevBtn) prevBtn.disabled = active === 0;
      if (nextBtn) nextBtn.disabled = active === n - 1;
      if (countEl) countEl.textContent = pad(active + 1) + ' / ' + pad(n);
      if (live) live.textContent = 'Игрок ' + (active + 1) + ' из ' + n + ': ' + PLAYERS[active].nick;
    }

    function goTo(i) {
      i = Math.max(0, Math.min(n - 1, i));
      if (i === active) return;
      active = i;
      render();
    }

    if (prevBtn) prevBtn.addEventListener('click', function () { goTo(active - 1); });
    if (nextBtn) nextBtn.addEventListener('click', function () { goTo(active + 1); });

    /* ----- клавиатура ----- */
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      if (document.body.classList.contains('no-scroll')) return; // открыт просмотр клипа
      var t = e.target;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT|VIDEO|AUDIO)$/.test(t.tagName))) return;
      goTo(active + (e.key === 'ArrowRight' ? 1 : -1));
    });

    /* ----- колесо мыши (cooldown) ----- */
    var lastWheel = 0;
    stage.addEventListener('wheel', function (e) {
      var delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      if (Math.abs(delta) < 4) return;
      var next = active + (delta > 0 ? 1 : -1);
      if (next < 0 || next > n - 1) return; // на краях отдаём прокрутку странице
      e.preventDefault();
      var now = Date.now();
      if (now - lastWheel < WHEEL_COOLDOWN_MS) return;
      lastWheel = now;
      goTo(next);
    }, { passive: false });

    /* ----- свайп ----- */
    var tx = 0, ty = 0, tracking = false;
    stage.addEventListener('touchstart', function (e) {
      if (e.touches.length !== 1) { tracking = false; return; }
      tracking = true;
      tx = e.touches[0].clientX;
      ty = e.touches[0].clientY;
    }, { passive: true });
    stage.addEventListener('touchend', function (e) {
      if (!tracking) return;
      tracking = false;
      var t = e.changedTouches[0];
      var dx = t.clientX - tx;
      var dy = t.clientY - ty;
      if (Math.abs(dx) > SWIPE_THRESHOLD && Math.abs(dx) > Math.abs(dy) * 1.2) {
        goTo(active + (dx < 0 ? 1 : -1));
      }
    }, { passive: true });

    /* ----- статусы Steam (Cloudflare Worker) ----- */
    function setStatus(card, w) {
      var st = card.querySelector('.pc-status');
      var txt = st.querySelector('.st-text');
      var label = String(w.label || '');
      var cls = 'st-offline';
      var text = 'OFFLINE';

      if (label === 'In Game' || w.inGame) {
        cls = 'st-ingame';
        var g = shortGame(w.inGame);
        text = 'IN-GAME' + (g ? ': ' + g : '');
      } else if (label === 'Online') {
        cls = 'st-online';
        text = 'ONLINE';
      } else if (label && label !== 'Offline') {
        cls = 'st-online';
        text = label.toUpperCase();
      }
      st.className = 'pc-status ' + cls;
      txt.textContent = text;
    }

    function setAvatar(card, url, nick) {
      if (!isSafeUrl(url)) return;
      var photo = card.querySelector('.pc-photo');
      if (!photo || photo.querySelector('img')) {
        var existing = photo && photo.querySelector('img');
        if (existing && existing.getAttribute('src') === url) return;
        if (existing) existing.remove();
      }
      var img = new Image();
      img.alt = nick;
      img.loading = 'lazy';
      img.referrerPolicy = 'no-referrer';
      img.addEventListener('load', function () {
        img.classList.add('loaded');
        var letter = photo.querySelector('.ph-letter');
        if (letter) letter.style.display = 'none';
      });
      img.addEventListener('error', function () { img.remove(); });
      img.src = url;
      photo.insertBefore(img, photo.firstChild);
    }

    function applyStatuses(list) {
      list.forEach(function (w) {
        if (!w || !w.id) return;
        var card = cardsById[String(w.id)];
        if (!card) return;
        setStatus(card, w);
        setAvatar(card, w.avatar, card.getAttribute('aria-label'));
      });
    }

    function markUnloadedOffline() {
      cards.forEach(function (c) {
        var st = c.querySelector('.pc-status');
        if (st.classList.contains('st-loading')) {
          st.className = 'pc-status st-offline';
          st.querySelector('.st-text').textContent = 'OFFLINE';
        }
      });
    }

    function fetchStatuses() {
      var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
      var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, FETCH_TIMEOUT_MS);
      return fetch(WORKER_URL, ctrl ? { signal: ctrl.signal } : undefined)
        .then(function (r) {
          if (!r.ok) throw new Error('HTTP ' + r.status);
          return r.json();
        })
        .then(function (data) {
          clearTimeout(timer);
          if (!data || data.error || !Array.isArray(data.players)) throw new Error('bad payload');
          applyStatuses(data.players);
          statusLoaded = true;
        })
        .catch(function () {
          clearTimeout(timer);
          // если данные уже были — оставляем последние известные статусы
          if (!statusLoaded) markUnloadedOffline();
        });
    }

    render();
    fetchStatuses();
    setInterval(function () { if (!document.hidden) fetchStatuses(); }, REFRESH_MS);
    document.addEventListener('visibilitychange', function () { if (!document.hidden) fetchStatuses(); });
  }

  /* ==========================================================
     ОСТАЛЬНЫЕ ИНТЕРАКТИВЫ
     ========================================================== */

  // Появление блоков при скролле
  function initReveal() {
    var targets = document.querySelectorAll('.reveal, .reveal-group');
    if (!('IntersectionObserver' in window) || !targets.length) {
      targets.forEach(function (t) { t.classList.add('is-visible'); });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) {
          en.target.classList.add('is-visible');
          io.unobserve(en.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
    targets.forEach(function (t) { io.observe(t); });
  }

  // Постеры видео
  function initPosters() {
    document.querySelectorAll('.clip-poster').forEach(function (poster) {
      var video = document.getElementById(poster.getAttribute('data-video-target'));
      if (!video) return;
      poster.addEventListener('click', function () {
        poster.classList.add('hidden');
        var pr = video.play();
        if (pr && pr.catch) pr.catch(function () { poster.classList.remove('hidden'); });
      });
      video.addEventListener('ended', function () {
        poster.classList.remove('hidden');
        video.currentTime = 0;
      });
    });
  }

  // Прогресс скролла
  function initProgress() {
    var bar = document.getElementById('scrollProgress');
    if (!bar) return;
    function update() {
      var h = document.documentElement.scrollHeight - window.innerHeight;
      bar.style.transform = 'scaleX(' + (h > 0 ? Math.min(1, window.scrollY / h) : 0).toFixed(4) + ')';
    }
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    update();
  }

  // Бургер-меню
  function initBurger() {
    var burger = document.getElementById('burgerBtn');
    var links = document.getElementById('navlinks');
    if (!burger || !links) return;
    function close() {
      links.classList.remove('open');
      burger.classList.remove('open');
      burger.setAttribute('aria-expanded', 'false');
    }
    burger.addEventListener('click', function () {
      var open = links.classList.toggle('open');
      burger.classList.toggle('open', open);
      burger.setAttribute('aria-expanded', String(open));
    });
    links.querySelectorAll('a').forEach(function (a) { a.addEventListener('click', close); });
    window.addEventListener('resize', function () { if (window.innerWidth > 860) close(); });
  }

  // Scrollspy
  function initScrollspy() {
    var navLinks = document.querySelectorAll('.navlinks a');
    var items = [];
    navLinks.forEach(function (link) {
      var id = link.getAttribute('href');
      if (id && id.charAt(0) === '#') {
        var s = document.querySelector(id);
        if (s) items.push({ el: s, link: link });
      }
    });
    if (!items.length || !('IntersectionObserver' in window)) return;
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        var m = items.filter(function (x) { return x.el === en.target; })[0];
        if (!m) return;
        navLinks.forEach(function (l) { l.classList.remove('active'); });
        m.link.classList.add('active');
      });
    }, { rootMargin: '-45% 0px -50% 0px', threshold: 0 });
    items.forEach(function (x) { io.observe(x.el); });
  }

  // Счётчики
  function initCountup() {
    var targets = document.querySelectorAll('.num[data-target]');
    if (!targets.length || reduceMotion) return;

    function fmt(v, dec, grouped) {
      if (grouped) return Math.round(v).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0');
      return v.toFixed(dec);
    }
    function animate(node) {
      var target = parseFloat(node.getAttribute('data-target'));
      if (isNaN(target)) return;
      var dec = parseInt(node.getAttribute('data-decimals') || '0', 10);
      var grouped = node.getAttribute('data-grouped') === 'true';
      var suffix = node.getAttribute('data-suffix') || '';
      var start = null, duration = 1300;
      function frame(ts) {
        if (start === null) start = ts;
        var p = Math.min((ts - start) / duration, 1);
        var eased = 1 - Math.pow(1 - p, 3);
        node.textContent = fmt(target * eased, dec, grouped) + suffix;
        if (p < 1) requestAnimationFrame(frame);
        else node.textContent = fmt(target, dec, grouped) + suffix;
      }
      requestAnimationFrame(frame);
    }
    if (!('IntersectionObserver' in window)) { targets.forEach(animate); return; }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { animate(en.target); io.unobserve(en.target); }
      });
    }, { threshold: 0.4 });
    targets.forEach(function (t) { io.observe(t); });
  }

  // Подсветка активной цели
  function initTimeline() {
    var items = document.querySelectorAll('.tl-item');
    if (!items.length || !('IntersectionObserver' in window)) return;
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { en.target.classList.toggle('active', en.isIntersecting); });
    }, { rootMargin: '-40% 0px -40% 0px', threshold: 0 });
    items.forEach(function (i) { io.observe(i); });
  }

  // Галерея: автопревью по наведению + просмотр в окне (клипы и скрины)
  function initGallery() {
    var items = Array.prototype.slice.call(document.querySelectorAll('.gal-item'));
    if (!items.length) return;

    var lite = document.documentElement.classList.contains('lite');
    var saveData = !!(navigator.connection && navigator.connection.saveData);
    var canHover = !!(window.matchMedia && window.matchMedia('(hover: hover) and (pointer: fine)').matches);

    /* ----- автопревью ----- */
    function startPreview(it) {
      if (saveData || it.getAttribute('data-type') !== 'video') return;
      var v = it.querySelector('.gal-preview');
      if (!v) return;
      var short = it.getAttribute('data-preview'); // короткий легкий ролик (позже)
      // на телефонах и слабых устройствах полный клип для превью не грузим
      if (lite && !short) return;
      if (short && v.getAttribute('src') !== short) v.setAttribute('src', short);
      var p = v.play();
      if (p && p.catch) p.catch(function () {});
      it.classList.add('is-previewing');
    }
    function stopPreview(it) {
      var v = it.querySelector('.gal-preview');
      if (v) {
        v.pause();
        try { v.currentTime = 0; } catch (e) {}
      }
      it.classList.remove('is-previewing');
    }

    if (canHover) {
      items.forEach(function (it) {
        it.addEventListener('pointerenter', function () { startPreview(it); });
        it.addEventListener('pointerleave', function () { stopPreview(it); });
        it.addEventListener('focus', function () { startPreview(it); });
        it.addEventListener('blur', function () { stopPreview(it); });
      });
    } else if ('IntersectionObserver' in window) {
      // тач-устройства: превью крутится, пока плитка в центре экрана (только для data-preview)
      var pio = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (en.isIntersecting) startPreview(en.target); else stopPreview(en.target);
        });
      }, { threshold: 0.65 });
      items.forEach(function (it) { if (it.getAttribute('data-preview')) pio.observe(it); });
    }

    /* ----- просмотр ----- */
    var lb = null, lbVideo, lbImg, lbTitle, lbMeta, lbPrev, lbNext, lbClose;
    var current = -1, lastFocus = null;

    function mkBtn(label, aria) {
      var b = el('button', null, label);
      b.type = 'button';
      b.setAttribute('aria-label', aria);
      return b;
    }

    function buildLightbox() {
      lb = el('div', 'lightbox');
      lb.hidden = true;
      lb.setAttribute('role', 'dialog');
      lb.setAttribute('aria-modal', 'true');
      lb.setAttribute('aria-label', 'Просмотр');

      var inner = el('div', 'lb-inner');
      var st = el('div', 'lb-stage');
      lbVideo = document.createElement('video');
      lbVideo.controls = true;
      lbVideo.playsInline = true;
      lbVideo.preload = 'none';
      lbVideo.hidden = true;
      lbImg = new Image();
      lbImg.alt = '';
      lbImg.decoding = 'async';
      lbImg.hidden = true;
      st.appendChild(lbVideo);
      st.appendChild(lbImg);

      var cap = el('div', 'lb-cap');
      var txt = el('div');
      lbTitle = el('b', 'lb-title');
      lbMeta = el('span', 'lb-meta');
      txt.appendChild(lbTitle);
      txt.appendChild(lbMeta);

      var btns = el('div', 'lb-btns');
      lbPrev = mkBtn('←', 'Предыдущий');
      lbNext = mkBtn('→', 'Следующий');
      lbClose = mkBtn('Закрыть ✕', 'Закрыть');
      if (items.length < 2) { lbPrev.hidden = true; lbNext.hidden = true; }
      btns.appendChild(lbPrev);
      btns.appendChild(lbNext);
      btns.appendChild(lbClose);

      cap.appendChild(txt);
      cap.appendChild(btns);
      inner.appendChild(st);
      inner.appendChild(cap);
      lb.appendChild(inner);
      document.body.appendChild(lb);

      lbPrev.addEventListener('click', function () { openAt(current - 1); });
      lbNext.addEventListener('click', function () { openAt(current + 1); });
      lbClose.addEventListener('click', closeLb);
      lb.addEventListener('click', function (e) { if (e.target === lb) closeLb(); });
    }

    function openAt(i) {
      if (!lb) buildLightbox();
      var n = items.length;
      current = ((i % n) + n) % n;
      var it = items[current];
      var type = it.getAttribute('data-type') || 'video';
      var src = it.getAttribute('data-src');
      if (!src) return;

      items.forEach(stopPreview);
      lbTitle.textContent = it.getAttribute('data-title') || '';
      lbMeta.textContent = it.getAttribute('data-meta') || '';

      if (type === 'image') {
        lbVideo.pause();
        lbVideo.removeAttribute('src');
        lbVideo.hidden = true;
        lbImg.src = src;
        lbImg.hidden = false;
      } else {
        lbImg.hidden = true;
        lbImg.removeAttribute('src');
        lbVideo.hidden = false;
        var poster = it.getAttribute('data-poster');
        if (poster) lbVideo.setAttribute('poster', poster); else lbVideo.removeAttribute('poster');
        lbVideo.src = src;
        var pr = lbVideo.play();
        if (pr && pr.catch) pr.catch(function () {});
      }

      if (lb.hidden) {
        lastFocus = document.activeElement;
        lb.hidden = false;
        document.body.classList.add('no-scroll');
        requestAnimationFrame(function () {
          requestAnimationFrame(function () { lb.classList.add('open'); });
        });
        lbClose.focus();
      }
    }

    function closeLb() {
      if (!lb || lb.hidden) return;
      lb.classList.remove('open');
      lbVideo.pause();
      lbVideo.removeAttribute('src');
      lbVideo.load();          // освободить буфер и остановить загрузку
      lbImg.removeAttribute('src');
      document.body.classList.remove('no-scroll');
      setTimeout(function () { if (!lb.classList.contains('open')) lb.hidden = true; }, 300);
      if (lastFocus && lastFocus.focus) lastFocus.focus();
    }

    items.forEach(function (it, i) {
      it.addEventListener('click', function () { openAt(i); });
    });

    document.addEventListener('keydown', function (e) {
      if (!lb || lb.hidden) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        closeLb();
      } else if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && items.length > 1) {
        if (e.target && e.target.tagName === 'VIDEO') return; // перемотка видео
        e.preventDefault();
        openAt(current + (e.key === 'ArrowRight' ? 1 : -1));
      } else if (e.key === 'Tab') {
        var f = [];
        if (!lbVideo.hidden) f.push(lbVideo);
        [lbPrev, lbNext, lbClose].forEach(function (b) { if (!b.hidden) f.push(b); });
        var first = f[0], last = f[f.length - 1];
        if (!lb.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
        else if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    });
  }

  initCarousel();
  initReveal();
  initPosters();
  initGallery();
  initProgress();
  initBurger();
  initScrollspy();
  initCountup();
  initTimeline();
})();
