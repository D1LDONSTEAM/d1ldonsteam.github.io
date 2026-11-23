/* ==========================================================
   D1LDONS TEAM — pause.js
   «Режим паузы»: плашка ROSTER ON PAUSE + небольшая паутина.
   Чтобы вернуть сайт как раньше — поставь PAUSE_MODE = false.
   Подключается ДО plasma.js (флаг замедляет плазму).
   ========================================================== */
(function () {
  'use strict';

  var PAUSE_MODE = true;

  var BADGE_TEXT = 'ROSTER ON PAUSE';
  var NOTE_TEXT  = 'CS2 временно не в приоритете. Состав вернётся, когда будет настроение.';

  /* Тексты блоков «Статистика», «FACEIT», тикера и «Цели» в режиме паузы */
  var COPY = {
    premierEyebrow: '02 / CS2 Premier · Сезон 4 · из прошлой жизни',
    premierNote:    'Цифры честные, но набраны в те времена, когда мы ещё играли вместе. CS2 Premier, Сезон 4, основной состав (4 игрока).',
    faceitNote:     'Тоже из прошлой жизни. FACEIT, Сезон 8.',
    tickerTag:      'СТАТУС',
    tickerText:     ' Пауза: кто в Доте, кто где',
    goalsTitle:     'Цели (на паузе)',
    results: [
      null, /* карточка 1 (CS2 Premier) остаётся как есть */
      { label: 'Региональные турниры · в планах', num: '3',   text: 'Три турнира в планах. Пока они в планах и остаются.' },
      { label: 'Командная работа · на паузе',     num: 'ZZZ', text: 'Синхронизация пятёрки временно отключена. Роли помним, собраться не можем.' }
    ],
    goals: [
      { title: 'Собраться вместе',  text: 'Хотя бы одна общая катка в неделю. Пока звучит как амбициозный план.' },
      { title: 'Дойти до турниров', text: 'Сначала до общего лобби, потом уже до турниров.' }
    ]
  };

  window.D1L_PAUSE = PAUSE_MODE;
  if (!PAUSE_MODE) return;

  document.documentElement.classList.add('pause-mode');

  /* Паутина: 5 нитей из угла (0,0) и дуги между ними */
  function webSVG() {
    var ns = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 100 100');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    var angles = [0, 22.5, 45, 67.5, 90].map(function (a) { return a * Math.PI / 180; });
    var d = '';
    angles.forEach(function (a) {
      d += 'M0 0L' + (100 * Math.cos(a)).toFixed(1) + ' ' + (100 * Math.sin(a)).toFixed(1);
    });
    [20, 38, 57, 78, 98].forEach(function (r) {
      for (var k = 0; k < angles.length - 1; k++) {
        var a0 = angles[k], a1 = angles[k + 1], am = (a0 + a1) / 2;
        var sag = r * 0.86;
        d += 'M' + (r * Math.cos(a0)).toFixed(1) + ' ' + (r * Math.sin(a0)).toFixed(1) +
             'Q' + (sag * Math.cos(am)).toFixed(1) + ' ' + (sag * Math.sin(am)).toFixed(1) + ' ' +
             (r * Math.cos(a1)).toFixed(1) + ' ' + (r * Math.sin(a1)).toFixed(1);
      }
    });
    var path = document.createElementNS(ns, 'path');
    path.setAttribute('d', d);
    svg.appendChild(path);
    return svg;
  }

  function addWeb(host, cls) {
    if (!host || host.querySelector(':scope > .pause-web')) return;
    var box = document.createElement('div');
    box.className = 'pause-web ' + cls;
    box.setAttribute('aria-hidden', 'true');
    box.appendChild(webSVG());
    host.appendChild(box);
  }

  function setText(sel, text) {
    var n = document.querySelector(sel);
    if (n) n.textContent = text;
  }

  function applyCopy() {
    setText('#stats .head .eyebrow', COPY.premierEyebrow);
    setText('#stats .stat-note', COPY.premierNote);
    setText('#faceit-stats .stat-note', COPY.faceitNote);
    setText('#road .head h2', COPY.goalsTitle);

    /* тикер: строка про цели на 2026 (её два экземпляра для бесшовной ленты) */
    document.querySelectorAll('.tick-item').forEach(function (item) {
      var tag = item.querySelector('.tag');
      if (!tag || tag.textContent.trim() !== 'ЦЕЛЬ') return;
      tag.textContent = COPY.tickerTag;
      var last = item.lastChild;
      if (last && last.nodeType === 3) last.nodeValue = COPY.tickerText;
    });

    /* результаты: карточки 2 и 3 (null — не трогаем) */
    var rc = document.querySelectorAll('#results .result-card');
    COPY.results.forEach(function (r, i) {
      var c = rc[i];
      if (!r || !c) return;
      var l = c.querySelector('.mini-label'), h = c.querySelector('h3'), p = c.querySelector('p');
      if (l) l.textContent = r.label;
      if (h) h.textContent = r.num;
      if (p) p.textContent = r.text;
    });

    /* цели: пункты 01 и 02, пункт 03 остаётся прежним */
    var items = document.querySelectorAll('#road .tl-item');
    COPY.goals.forEach(function (g, i) {
      var it = items[i];
      if (!it) return;
      var h = it.querySelector('h3'), p = it.querySelector('p');
      if (h) h.textContent = g.title;
      if (p) p.textContent = g.text;
    });
  }

  function init() {
    applyCopy();
    /* Плашка в hero */
    var badge = document.querySelector('.hero-badge');
    if (badge) {
      var txt = badge.querySelector('.shiny-text');
      if (txt) txt.textContent = BADGE_TEXT;
      badge.classList.add('is-paused');
      if (!document.querySelector('.pause-note')) {
        var note = document.createElement('p');
        note.className = 'pause-note';
        note.textContent = NOTE_TEXT;
        badge.insertAdjacentElement('afterend', note);
      }
    }

    /* Паутина: главный экран и карточки игроков */
    addWeb(document.querySelector('.hero'), 'pause-web-hero');
    document.querySelectorAll('.pcard').forEach(function (c) { addWeb(c, 'pause-web-card'); });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
