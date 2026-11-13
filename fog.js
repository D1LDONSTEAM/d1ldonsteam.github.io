/* ==========================================================
   D1LDONS TEAM — fog.js  (v2: гладкий дым без «точек»)
   Живой туман на главной (WebGL-шейдер):
   • медленное течение облаков (fbm + domain warp + тонкие «волокна»)
   • туман расходится и подсвечивается вокруг курсора
   • лёгкий параллакс от скролла
   • без растрового дизеринга: вместо него невидимый шум в 1/255,
     который убирает полосатость, но не рисует точки
   • рендер в повышенном разрешении, при тормозах качество
     автоматически снижается
   Если WebGL недоступен — остаются статичные CSS-облака.
   ========================================================== */
(function () {
  'use strict';

  var sky = document.querySelector('.sky');
  if (!sky) return;

  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var canvas = document.createElement('canvas');
  canvas.className = 'sky-fog';
  canvas.setAttribute('aria-hidden', 'true');

  var gl = null;
  try {
    gl = canvas.getContext('webgl', { alpha: false, antialias: false, powerPreference: 'default' }) ||
         canvas.getContext('experimental-webgl');
  } catch (e) { gl = null; }
  if (!gl) return;

  var VERT = 'attribute vec2 p; void main(){ gl_Position = vec4(p, 0.0, 1.0); }';

  var FRAG = [
    '#ifdef GL_FRAGMENT_PRECISION_HIGH',
    'precision highp float;',
    '#else',
    'precision mediump float;',
    '#endif',
    'uniform vec2 uRes;',
    'uniform float uTime;',
    'uniform vec2 uMouse;',
    'uniform float uScroll;',
    'uniform float uPush;',

    'float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }',

    // value noise с квинтической интерполяцией — без «ступенек»
    'float noise(vec2 p){',
    '  vec2 i = floor(p), f = fract(p);',
    '  f = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);',
    '  float a = hash(i), b = hash(i + vec2(1.0, 0.0)), c = hash(i + vec2(0.0, 1.0)), d = hash(i + vec2(1.0, 1.0));',
    '  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);',
    '}',

    'float fbm(vec2 p, int oct){',
    '  float v = 0.0, a = 0.5;',
    '  mat2 m = mat2(1.6, 1.2, -1.2, 1.6);',
    '  for (int i = 0; i < 6; i++){',
    '    if (i >= oct) break;',
    '    v += a * noise(p);',
    '    p = m * p + 17.3;',
    '    a *= 0.5;',
    '  }',
    '  return v;',
    '}',

    'void main(){',
    '  vec2 uv = gl_FragCoord.xy / uRes;',
    '  float asp = uRes.x / uRes.y;',
    '  vec2 p = vec2(uv.x * asp, uv.y);',
    '  p.y += uScroll * 0.35;',
    '  float t = uTime * 0.045;',

    // курсор: туман расходится и светлеет вокруг
    '  vec2 mp = vec2(uMouse.x * asp, uMouse.y);',
    '  vec2 dm = p - mp;',
    '  float d2 = dot(dm, dm);',
    '  float lens = exp(-d2 * 7.0);',
    '  p += normalize(dm + 0.0001) * lens * 0.07 * uPush;',

    // течение с domain warp
    '  vec2 q = vec2(fbm(p * 1.5 + vec2(0.0, t), 4), fbm(p * 1.5 + vec2(5.2, 1.3) - t, 4));',
    '  float f = fbm(p * 1.35 + 2.1 * q + vec2(t * 1.6, -t * 0.8), 6);',

    // тонкие «волокна» дыма поверх основной массы
    '  float w = fbm(p * 3.4 + 3.0 * q + vec2(-t * 2.4, t * 1.3), 4);',
    '  f = f * 0.84 + w * 0.16;',
    '  f += lens * 0.16 * uPush;',

    '  float fog = smoothstep(0.30, 0.84, f);',

    // сверху светлее, к низу уходит в чёрный
    '  float vert = smoothstep(0.0, 1.0, uv.y);',
    '  float lum = fog * (0.20 + 0.80 * vert);',

    // нейтральный серый дым на чистом чёрном (без синего)
    '  vec3 col = vec3(0.92, 0.92, 0.94) * lum * 0.85;',

    // невидимый шум 1/255 против полос (не точки)
    '  float n = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));',
    '  col += (n - 0.5) / 255.0;',

    '  gl_FragColor = vec4(col, 1.0);',
    '}'
  ].join('\n');

  function compile(type, src) {
    var s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) return null;
    return s;
  }

  var vs = compile(gl.VERTEX_SHADER, VERT);
  var fs = compile(gl.FRAGMENT_SHADER, FRAG);
  if (!vs || !fs) return;

  var prog = gl.createProgram();
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return;
  gl.useProgram(prog);

  var buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  var loc = gl.getAttribLocation(prog, 'p');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

  var uRes = gl.getUniformLocation(prog, 'uRes');
  var uTime = gl.getUniformLocation(prog, 'uTime');
  var uMouse = gl.getUniformLocation(prog, 'uMouse');
  var uScroll = gl.getUniformLocation(prog, 'uScroll');
  var uPush = gl.getUniformLocation(prog, 'uPush');

  sky.insertBefore(canvas, sky.firstChild);
  sky.classList.add('has-fog');

  /* ---------- размеры: качество выше, чем раньше ---------- */
  var SCALES = [0.8, 0.6, 0.45, 0.33];   // ступени качества
  var scaleIdx = 0;
  var MAX_PIXELS = 1300000;
  var skyH = 1;

  function resize() {
    var w = canvas.clientWidth || window.innerWidth;
    var h = canvas.clientHeight || window.innerHeight;
    skyH = h;
    var sc = SCALES[scaleIdx];
    var sw = Math.max(2, Math.round(w * sc));
    var sh = Math.max(2, Math.round(h * sc));
    var px = sw * sh;
    if (px > MAX_PIXELS) {
      var k = Math.sqrt(MAX_PIXELS / px);
      sw = Math.round(sw * k);
      sh = Math.round(sh * k);
    }
    if (canvas.width !== sw || canvas.height !== sh) {
      canvas.width = sw;
      canvas.height = sh;
    }
    gl.viewport(0, 0, sw, sh);
    gl.uniform2f(uRes, sw, sh);
  }
  window.addEventListener('resize', resize);

  /* ---------- курсор / автодвижение на тач-экранах ---------- */
  var target = { x: 0.7, y: 0.65 };
  var cur = { x: 0.7, y: 0.65 };
  var push = 0, pushTarget = 0;
  var lastPointer = 0;

  window.addEventListener('pointermove', function (e) {
    if (e.pointerType === 'touch') return;
    target.x = e.clientX / window.innerWidth;
    target.y = 1 - (e.clientY + window.scrollY) / skyH;
    pushTarget = 1;
    lastPointer = performance.now();
  }, { passive: true });
  window.addEventListener('pointerleave', function () { pushTarget = 0; });

  /* ---------- цикл рендера + авто-снижение качества ---------- */
  var running = false, rafId = 0;
  var start = performance.now();
  var prev = 0;
  var FRAME_MS = 1000 / 30;
  var accDt = 0, accN = 0;

  function adapt(dt) {
    // dt — реальный интервал между отрисованными кадрами
    if (dt > 250) return; // пропуск после паузы/вкладки — не считаем
    accDt += dt; accN++;
    if (accN >= 90) {
      var mean = accDt / accN;
      accDt = 0; accN = 0;
      if (mean > 46 && scaleIdx < SCALES.length - 1) {
        scaleIdx++;
        resize();
      }
    }
  }

  function frame(now) {
    rafId = 0;
    if (!running) return;
    rafId = requestAnimationFrame(frame);
    if (now - prev < FRAME_MS) return;
    var dt = now - prev;
    prev = now;
    adapt(dt);

    // без курсора — медленно «блуждающий» свет (для телефонов)
    if (now - lastPointer > 3000) {
      var s = (now - start) / 1000;
      target.x = 0.62 + Math.sin(s * 0.17) * 0.22;
      target.y = 0.68 + Math.cos(s * 0.13) * 0.14;
      pushTarget = 0.55;
    }
    cur.x += (target.x - cur.x) * 0.06;
    cur.y += (target.y - cur.y) * 0.06;
    push += (pushTarget - push) * 0.05;

    draw((now - start) / 1000);
  }

  function draw(timeSec) {
    gl.uniform1f(uTime, timeSec);
    gl.uniform2f(uMouse, cur.x, cur.y);
    gl.uniform1f(uScroll, Math.min(window.scrollY / Math.max(skyH, 1), 2));
    gl.uniform1f(uPush, push);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  function setRunning(v) {
    if (reduceMotion) return;
    if (v && !running) { running = true; prev = performance.now(); if (!rafId) rafId = requestAnimationFrame(frame); }
    else if (!v) { running = false; }
  }

  function shouldRun() {
    return !document.hidden && window.scrollY < skyH * 0.95;
  }
  function sync() { setRunning(shouldRun()); }

  window.addEventListener('scroll', sync, { passive: true });
  document.addEventListener('visibilitychange', sync);

  // Если контекст WebGL потерян — откатываемся на CSS-облака
  canvas.addEventListener('webglcontextlost', function (e) {
    e.preventDefault();
    running = false;
    sky.classList.remove('has-fog');
    canvas.remove();
  });

  resize();
  if (reduceMotion) {
    push = 0;
    draw(12.0);
  } else {
    sync();
  }
})();
