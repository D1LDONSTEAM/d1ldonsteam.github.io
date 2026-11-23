/* ==========================================================
   D1LDONS TEAM — effects.js (Enhanced Edition)
   • Надёжный экран загрузки с защитой от зависания
   • Кибернетический Text Scramble (латиница + кириллица)
   • 3D-Tilt эффект для карточек с динамическим бликом
   • Магнитные кнопки и интерактивные переключатели
   • Web Audio API для тактильных звуковых щелчков (без внешних файлов)
   • Фильтрация пула карт в реальном времени
   • Кнопка «Наверх» с индикатором прогресса
   ========================================================== */
(function () {
  'use strict';

  var LITE = document.documentElement.classList.contains('lite');
  var MOTION = !(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  var canHover = window.matchMedia && window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  /* ==========================================================
     1. ЭКРАН ЗАГРУЗКИ (С ГАРАНТИРОВАННЫМ СКРЫТИЕМ)
     ========================================================== */
  function hideLoader() {
    var loader = document.getElementById('pageLoader');
    if (!loader || loader.classList.contains('is-hidden')) return;
    loader.classList.add('is-hidden');
    setTimeout(function () {
      if (loader.parentNode) loader.remove();
    }, 700);
  }

  // При штатной загрузке
  window.addEventListener('load', function () {
    setTimeout(hideLoader, 350);
  });

  // Защитный таймер: максимум 1.5 секунды, сайт никогда не зависнет на чёрном экране
  setTimeout(hideLoader, 1500);

  /* ==========================================================
     2. ТАКТИЛЬНЫЙ SFX (WEB AUDIO API - ZERO DEPENDENCIES)
     ========================================================== */
  var audioCtx = null;
  var sfxEnabled = false;
  try {
    sfxEnabled = localStorage.getItem('d1ldons_sfx') === 'true';
  } catch (e) {}

  function getAudioCtx() {
    if (!audioCtx && (window.AudioContext || window.webkitAudioContext)) {
      var AC = window.AudioContext || window.webkitAudioContext;
      audioCtx = new AC();
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    return audioCtx;
  }

  function playUiClick(freq, duration, type) {
    if (!sfxEnabled) return;
    try {
      var ctx = getAudioCtx();
      if (!ctx) return;
      var osc = ctx.createOscillator();
      var gain = ctx.createGain();
      osc.type = type || 'sine';
      osc.frequency.setValueAtTime(freq || 800, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime((freq || 800) * 0.4, ctx.currentTime + (duration || 0.04));

      gain.gain.setValueAtTime(0.04, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + (duration || 0.04));

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + (duration || 0.04));
    } catch (e) {}
  }

  // Инициализация кнопки переключения звука
  var sfxBtn = document.getElementById('sfxToggle');
  function updateSfxBtn() {
    if (!sfxBtn) return;
    sfxBtn.setAttribute('aria-pressed', String(sfxEnabled));
    sfxBtn.textContent = sfxEnabled ? 'SFX: ON' : 'SFX: OFF';
    sfxBtn.classList.toggle('active', sfxEnabled);
  }
  if (sfxBtn) {
    updateSfxBtn();
    sfxBtn.addEventListener('click', function () {
      sfxEnabled = !sfxEnabled;
      try { localStorage.setItem('d1ldons_sfx', String(sfxEnabled)); } catch (e) {}
      updateSfxBtn();
      if (sfxEnabled) playUiClick(950, 0.08, 'triangle');
    });
  }

  // Глобальный перехват кликов по интерактивным элементам для звука
  document.addEventListener('click', function (e) {
    if (!sfxEnabled) return;
    var t = e.target.closest('button, a, .car-tab, .map-filter-btn');
    if (t) playUiClick(720, 0.04, 'sine');
  }, true);

  /* ==========================================================
     3. DECRYPTED TEXT & SCRAMBLE (React Bits Inspired)
     ========================================================== */
  if (MOTION && !LITE) {
    var GLYPHS = '0123456789ABCDEF!@#$%&*<>[]{}~=+/АБВГДЕЖЗИКЛМНОПРСТУФХЦЧШЩ';

    function decryptText(node, options) {
      if (!node) return;
      var original = node.getAttribute('data-orig-text');
      if (!original) {
        original = node.textContent.trim();
        node.setAttribute('data-orig-text', original);
      }

      if (node._decryptTimer) {
        clearInterval(node._decryptTimer);
        node._decryptTimer = null;
      }
      node.dataset.decrypting = 'true';

      var len = original.length;
      var speed = (options && options.speed) || 28;
      var maxSteps = (options && options.maxSteps) || Math.max(10, Math.floor(len * 1.4));
      var step = 0;

      node._decryptTimer = setInterval(function () {
        step++;
        var progress = step / maxSteps;
        var revealed = Math.floor(progress * len);

        var result = '';
        for (var i = 0; i < len; i++) {
          var ch = original[i];
          if (ch === ' ' || ch === '·' || ch === '•' || ch === '—' || ch === '/' || ch === '.' || ch === ':') {
            result += ch;
          } else if (i < revealed) {
            result += ch;
          } else {
            result += GLYPHS.charAt(Math.floor(Math.random() * GLYPHS.length));
          }
        }
        node.textContent = result;

        if (step >= maxSteps) {
          node.textContent = original;
          node.dataset.decrypting = 'false';
          clearInterval(node._decryptTimer);
          node._decryptTimer = null;
        }
      }, speed);
    }

    // 1. При наведении на пункты навигации в шапке
    var navLinks = document.querySelectorAll('.navlinks a, .nav-pill');
    navLinks.forEach(function (link) {
      link.addEventListener('mouseenter', function () {
        decryptText(link, { speed: 24, maxSteps: 10 });
      });
    });

    // 2. Делегирование наведения: роли игроков (.pc-role), теги в титрах (.tag), номера карточек (.pc-num)
    document.addEventListener('mouseover', function (e) {
      var target = e.target.closest('.pc-role, .tick-item .tag, .pc-num');
      if (target && target.dataset.decrypting !== 'true') {
        decryptText(target, { speed: 22, maxSteps: 8 });
      }
    });

    // 3. Заголовки разделов (.head h2) при скролле (IntersectionObserver)
    var headTitles = document.querySelectorAll('.head h2');
    if ('IntersectionObserver' in window && headTitles.length) {
      var sIO = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (en.isIntersecting) {
            decryptText(en.target, { speed: 30, maxSteps: 18 });
            sIO.unobserve(en.target);
          }
        });
      }, { threshold: 0.25 });
      headTitles.forEach(function (el) { sIO.observe(el); });
    }
  }

  /* ==========================================================
     4. SPOTLIGHT CARD (React Bits Inspired)
     ========================================================== */
  if (canHover && !LITE) {
    var spotCards = document.querySelectorAll('.pcard, .stat-card, .result-card, .support-card, .about-panel, .about-card');
    spotCards.forEach(function (card) {
      card.addEventListener('pointermove', function (e) {
        var rect = card.getBoundingClientRect();
        var x = e.clientX - rect.left;
        var y = e.clientY - rect.top;
        card.style.setProperty('--spot-x', x.toFixed(1) + 'px');
        card.style.setProperty('--spot-y', y.toFixed(1) + 'px');
        card.style.setProperty('--spot-opacity', '1');
      });
      card.addEventListener('pointerleave', function () {
        card.style.setProperty('--spot-opacity', '0');
      });
    });
  }

  /* ==========================================================
     5. 3D-TILT НА КАРТОЧКАХ С ДИНАМИЧЕСКИМ БЛИКОМ
     ========================================================== */
  if (canHover && MOTION && !LITE) {
    var tiltCards = document.querySelectorAll('.stat-card, .result-card, .support-card');

    tiltCards.forEach(function (card) {
      card.style.transformStyle = 'preserve-3d';
      card.style.transition = 'transform 0.35s cubic-bezier(.16,1,.3,1), border-color 0.3s';

      card.addEventListener('mousemove', function (e) {
        var rect = card.getBoundingClientRect();
        var x = (e.clientX - rect.left) / rect.width - 0.5;
        var y = (e.clientY - rect.top) / rect.height - 0.5;
        card.style.transform = 'perspective(700px) rotateX(' + (-y * 9) + 'deg) rotateY(' + (x * 9) + 'deg) scale3d(1.018,1.018,1.018)';

        // Координаты для радиального блика
        var px = ((e.clientX - rect.left) / rect.width) * 100;
        var py = ((e.clientY - rect.top) / rect.height) * 100;
        card.style.setProperty('--mx', px + '%');
        card.style.setProperty('--my', py + '%');
      });

      card.addEventListener('mouseleave', function () {
        card.style.transform = 'perspective(700px) rotateX(0deg) rotateY(0deg) scale3d(1,1,1)';
      });
    });
  }

  /* ==========================================================
     5. МАГНИТНЫЕ КНОПКИ
     ========================================================== */
  if (canHover && MOTION && !LITE) {
    var magnets = document.querySelectorAll('.btn, .nav-pill, .car-btn, .copy-btn, .back-to-top, .map-filter-btn');

    magnets.forEach(function (btn) {
      btn.addEventListener('mousemove', function (e) {
        var rect = btn.getBoundingClientRect();
        var cx = rect.left + rect.width / 2;
        var cy = rect.top + rect.height / 2;
        var dx = (e.clientX - cx) * 0.22;
        var dy = (e.clientY - cy) * 0.22;
        btn.style.transform = 'translate(' + dx.toFixed(1) + 'px,' + dy.toFixed(1) + 'px)';
      });
      btn.addEventListener('mouseleave', function () {
        btn.style.transform = '';
      });
    });
  }

  /* ==========================================================
     6. КНОПКА «НАВЕРХ»
     ========================================================== */
  var topBtn = document.getElementById('backToTop');
  if (topBtn) {
    var shown = false;
    function checkTop() {
      var need = window.scrollY > window.innerHeight * 0.55;
      if (need !== shown) {
        shown = need;
        topBtn.classList.toggle('is-visible', need);
      }
    }
    window.addEventListener('scroll', checkTop, { passive: true });
    checkTop();
    topBtn.addEventListener('click', function () {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  /* ==========================================================
     9. ПАРАЛЛАКС КЛЮЧЕВЫХ ЧИСЕЛ
     ========================================================== */
  if (MOTION && !LITE) {
    var parallaxNums = document.querySelectorAll('.stat-card .num, .about-card h3, .tl-marker');
    if (parallaxNums.length) {
      var tick = false;
      function updateParallax() {
        tick = false;
        var vh = window.innerHeight;
        parallaxNums.forEach(function (el) {
          var rect = el.getBoundingClientRect();
          if (rect.bottom >= 0 && rect.top <= vh) {
            var center = rect.top + rect.height / 2;
            var offset = (center - vh / 2) / vh;
            el.style.transform = 'translateY(' + (offset * -14).toFixed(1) + 'px)';
          }
        });
      }
      window.addEventListener('scroll', function () {
        if (!tick) { tick = true; requestAnimationFrame(updateParallax); }
      }, { passive: true });
    }
  }

})();
