/* ==========================================================
   D1LDONS TEAM — plasma.js
   React Bits Plasma — ванильный JS порт (WebGL2, двухпроходный)
   Оригинал: https://reactbits.dev/backgrounds/plasma
   Параметры: direction="reverse", color="#a6a3b8"
   ========================================================== */
(function () {
  'use strict';

  /* ── Настройки (соответствуют пропсам React-компонента) ── */
  var CFG = {
    color:           '#b4b4b4',   // нейтральный серый — строго Ч/Б палитра
    speed:           (window.D1L_PAUSE ? 0.45 : 1.0),
    direction:       'reverse',   // 'forward' | 'reverse' | 'pingpong'
    scale:           1.0,
    twist:           1.0,
    wave:            1.0,
    softness:        0.5,
    shine:           1.0,
    brightness:      1.0,
    grain:           0.04,
    quality:         0.75,
    mouseInteractive:true,
    intro:           true,
    fade:            0.0,
    opacity:         (window.D1L_PAUSE ? 0.32 : 0.45),       // приглушено, чтобы текст и карточки читались
    lightMode:       false,
    paused:          false
  };

  /* Облегчённый режим (класс .lite ставится в <head> для телефонов/слабых устройств) */
  var LITE = document.documentElement.className.indexOf('lite') !== -1;
  if (LITE) CFG.quality = 0.5;

  var MAX_VOLUME_PIXELS = LITE ? 800000 : 1600000;
  var INTRO_SECONDS     = 1.6;

  function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }

  /* ── Найти контейнер и canvas ── */
  var container = document.querySelector('.sky');
  var canvas    = document.getElementById('plasmaCanvas') || document.querySelector('canvas.sky-plasma');
  if (!container || !canvas) return;

  /* ── WebGL2 контекст ── */
  var gl = null;
  try {
    gl = canvas.getContext('webgl2', {
      alpha: true, premultipliedAlpha: true,
      antialias: false, depth: false, stencil: false,
      powerPreference: 'high-performance'
    });
  } catch(e) {}
  if (!gl) { console.warn('[plasma.js] WebGL2 не поддерживается'); return; }

  /* ── Шейдеры (оригинал React Bits) ── */
  var QUAD_VERTEX = [
    '#version 300 es',
    'in vec2 aPosition;',
    'void main() {',
    '  gl_Position = vec4(aPosition, 0.0, 1.0);',
    '}'
  ].join('\n');

  var VOLUME = [
    '#version 300 es',
    'precision highp float;',
    'uniform vec2  uView;',
    'uniform vec2  uScale;',
    'uniform float uZoom;',
    'uniform float uTime;',
    'uniform float uTwist;',
    'uniform float uWave;',
    'uniform float uSharpness;',
    'uniform vec2  uOrbit;',
    'uniform float uDither;',
    'out vec4 outColor;',

    'float hash(vec2 p) {',
    '  p = fract(p * vec2(123.34, 456.21));',
    '  p += dot(p, p + 45.32);',
    '  return fract(p.x * p.y);',
    '}',

    'void main() {',
    '  vec2 c  = (gl_FragCoord.xy * uScale - 0.5 * uView) / uZoom;',
    '  vec3 rd = normalize(vec3(c, uView.y));',
    '  vec3 ro = vec3(0.0, 0.0, -4.0);',
    '  float cy = cos(uOrbit.x); float sy = sin(uOrbit.x);',
    '  float cx = cos(uOrbit.y); float sx = sin(uOrbit.y);',
    '  mat3 orbit = mat3(cy,0.0,-sy, 0.0,1.0,0.0, sy,0.0,cy)',
    '             * mat3(1.0,0.0,0.0, 0.0,cx,sx, 0.0,-sx,cx);',
    '  ro = orbit * ro; rd = orbit * rd;',
    '  float z = 0.0, density = 0.0, band = 0.0;',
    '  for (int i = 0; i < 60; i++) {',
    '    vec3 p = ro + rd * z;',
    '    vec3 s = p;',
    '    float d = p.y - uTime;',
    '    p.x += uWave * (1.0 + p.y) * sin(d + p.x * 0.1) * cos(0.34 * d + p.x * 0.05);',
    '    vec2 q = p.xz *= mat2(cos(p.y * uTwist + vec4(0.0,11.0,33.0,0.0) - uTime));',
    '    float shell = abs(sqrt(length(q * q)) - 0.25 * (5.0 + s.y)) / 3.0;',
    '    float stepLength = shell + 0.0008;',
    '    z += stepLength;',
    '    float phase  = s.y + p.z * 0.5 + s.z - length(s - p);',
    '    float weight = (1.0 + sin(phase + 8.0)) * exp(-shell * uSharpness) * stepLength;',
    '    density += weight;',
    '    band    += weight * (0.5 + 0.5 * sin(phase * 0.5 + 1.0));',
    '  }',
    '  vec2 encoded = sqrt(vec2(density, band) / (1.0 + vec2(density, band)));',
    '  encoded += (vec2(hash(gl_FragCoord.xy), hash(gl_FragCoord.yx + 17.0)) - 0.5) * uDither;',
    '  outColor = vec4(encoded, 0.0, 1.0);',
    '}'
  ].join('\n');

  var COMPOSITE = [
    '#version 300 es',
    'precision highp float;',
    'uniform sampler2D uVolume;',
    'uniform vec2  uResolution;',
    'uniform vec3  uColor;',
    'uniform vec3  uHighlight;',
    'uniform vec3  uInk;',
    'uniform float uGain;',
    'uniform float uShine;',
    'uniform float uPresence;',
    'uniform float uGrain;',
    'uniform float uFade;',
    'uniform float uOpacity;',
    'uniform float uTime;',
    'uniform float uLightMode;',
    'uniform vec3  uHeat;',
    'out vec4 outColor;',

    'float hash(vec2 p) {',
    '  p = fract(p * vec2(123.34, 456.21));',
    '  p += dot(p, p + 45.32);',
    '  return fract(p.x * p.y);',
    '}',
    'float smootherstep(float edge, float x) {',
    '  float t = clamp(x / max(edge, 0.0001), 0.0, 1.0);',
    '  return t * t * t * (t * (t * 6.0 - 15.0) + 10.0);',
    '}',

    'void main() {',
    '  vec2 uv = gl_FragCoord.xy / uResolution;',
    '  vec2 encoded = clamp(texture(uVolume, uv).rg, 0.0, 0.9995);',
    '  encoded *= encoded;',
    '  vec2 volume = encoded / (1.0 - encoded);',
    '  vec2 offset = (gl_FragCoord.xy - uHeat.xy) / uResolution.y;',
    '  float heat    = uHeat.z * exp(-dot(offset, offset) / 0.05);',
    '  float density = volume.r * uGain * uPresence * (1.0 + heat * 0.35);',
    '  float band    = clamp(volume.g / max(volume.r, 0.00001), 0.0, 1.0);',
    '  vec3 tint = mix(uColor, uHighlight, band * 0.35);',
    '  vec3 hdr  = tint * density + uHighlight * density * density * uShine;',
    '  float peak  = max(hdr.r, max(hdr.g, hdr.b));',
    '  float level = 1.0 - exp(-peak);',
    '  float hot   = smoothstep(1.0, 3.0, peak);',
    '  float edge  = uFade * 0.5;',
    '  float mask  = smootherstep(edge, uv.x) * smootherstep(edge, 1.0 - uv.x)',
    '              * smootherstep(edge, uv.y) * smootherstep(edge, 1.0 - uv.y);',
    '  mask *= uOpacity;',
    '  float grain = (hash(gl_FragCoord.xy + fract(uTime * 7.31) * 113.0) - 0.5) * uGrain;',
    '  if (uLightMode > 0.5) {',
    '    vec3 color = mix(uInk, vec3(1.0), hot * 0.75);',
    '    float alpha = clamp(pow(level, 0.8) * 0.9 * (1.0 + grain), 0.0, 1.0) * mask;',
    '    outColor = vec4(color * alpha, alpha);',
    '  } else {',
    '    vec3 hue   = hdr / max(peak, 0.0001);',
    '    vec3 color = mix(hue * level, vec3(level), hot * 0.6);',
    '    color = pow(color, vec3(1.0 / 2.2));',
    '    color = clamp(color + grain * level, 0.0, 1.0) * mask;',
    '    outColor = vec4(color, max(color.r, max(color.g, color.b)));',
    '  }',
    '}'
  ].join('\n');

  /* ── Компиляция шейдеров ── */
  function compileShader(type, src) {
    var s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      console.error('[plasma] shader error:', gl.getShaderInfoLog(s));
      gl.deleteShader(s);
      return null;
    }
    return s;
  }

  function linkProgram(fragSrc) {
    var vs = compileShader(gl.VERTEX_SHADER, QUAD_VERTEX);
    var fs = compileShader(gl.FRAGMENT_SHADER, fragSrc);
    var prog = gl.createProgram();
    if (!vs || !fs || !prog) return null;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.bindAttribLocation(prog, 0, 'aPosition');
    gl.linkProgram(prog);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.error('[plasma] link error:', gl.getProgramInfoLog(prog));
      gl.deleteProgram(prog);
      return null;
    }
    var uniforms = {};
    var n = gl.getProgramParameter(prog, gl.ACTIVE_UNIFORMS);
    for (var i = 0; i < n; i++) {
      var info = gl.getActiveUniform(prog, i);
      if (info) uniforms[info.name] = gl.getUniformLocation(prog, info.name);
    }
    return { program: prog, uniforms: uniforms };
  }

  var floatTargets = !!gl.getExtension('EXT_color_buffer_float');
  var volumeProg   = linkProgram(VOLUME);
  var compositeProg = linkProgram(COMPOSITE);
  if (!volumeProg || !compositeProg) return;

  /* ── VAO + буфер ── */
  var vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  var buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 3,-1, -1,3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  /* ── Framebuffer для volume прохода ── */
  var fbTexture     = gl.createTexture();
  var framebuffer   = gl.createFramebuffer();
  var fbTarget      = { width: 0, height: 0 };

  function sizeTarget(w, h) {
    if (fbTarget.width === w && fbTarget.height === h) return;
    fbTarget.width  = w;
    fbTarget.height = h;
    gl.bindTexture(gl.TEXTURE_2D, fbTexture);
    if (floatTargets) {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
    } else {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    }
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, fbTexture, 0);
  }

  /* ── Парсинг цвета через canvas 2D ── */
  var probe2d = (function() {
    try {
      var c = document.createElement('canvas');
      c.width = c.height = 1;
      return c.getContext('2d', { willReadFrequently: true });
    } catch(e) { return null; }
  })();
  var colorCache = {};

  function toLinear(hex) {
    if (colorCache[hex]) return colorCache[hex];
    var rgb = [1,1,1];
    if (probe2d) {
      probe2d.clearRect(0,0,1,1);
      probe2d.fillStyle = '#fff';
      probe2d.fillStyle = hex;
      probe2d.fillRect(0,0,1,1);
      var d = probe2d.getImageData(0,0,1,1).data;
      rgb = [d[0],d[1],d[2]].map(function(v){ return Math.pow(v/255, 2.2); });
    }
    colorCache[hex] = rgb;
    return rgb;
  }

  /* ── Состояние ── */
  var reduceMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  var view = { width:1, height:1, volW:1, volH:1 };
  var pointer = { x:0, y:0, inside:false };
  var state = {
    clock:         0,
    intro:         (CFG.intro && !reduceMotion) ? 0 : 1,
    yaw:           0, pitch:         0,
    yawVel:        0, pitchVel:      0,
    heat:          0, heatX:         0, heatY: 0
  };
  var rafId = 0, last = 0, visible = true;

  function timeOf() {
    var t = state.clock * 0.4;
    if (CFG.direction === 'reverse') return -t;
    if (CFG.direction !== 'pingpong') return t;
    var span = 10;
    var seg  = (state.clock % span) / span;
    var ease = seg * seg * (3 - 2 * seg);
    return (Math.floor(state.clock / span) % 2 === 0 ? ease : 1 - ease) * span * 0.4;
  }

  /* ── Рендер ── */
  function render() {
    var presence = state.intro * state.intro * (3 - 2 * state.intro);

    gl.bindVertexArray(vao);
    sizeTarget(view.volW, view.volH);

    /* — Volume pass — */
    var vU = volumeProg.uniforms;
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.viewport(0, 0, fbTarget.width, fbTarget.height);
    gl.useProgram(volumeProg.program);
    gl.uniform2f(vU.uView,      view.width,  view.height);
    gl.uniform2f(vU.uScale,     view.width / fbTarget.width, view.height / fbTarget.height);
    gl.uniform1f(vU.uZoom,      CFG.scale);
    gl.uniform1f(vU.uTime,      timeOf() + (1 - presence) * 1.4);
    gl.uniform1f(vU.uTwist,     CFG.twist);
    gl.uniform1f(vU.uWave,      0.4 * CFG.wave);
    gl.uniform1f(vU.uSharpness, 100 - CFG.softness * 90);
    gl.uniform2f(vU.uOrbit,     state.yaw, state.pitch);
    gl.uniform1f(vU.uDither,    floatTargets ? 0 : 1/255);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    /* — Composite pass — */
    var base      = toLinear(CFG.color);
    var highlight = base.map(function(v){ return v + (1 - v) * 0.85; });
    var tone      = 0.2126*base[0] + 0.7152*base[1] + 0.0722*base[2];
    var depth     = Math.min(1, 0.16 / Math.max(tone, 0.001));
    var ink       = base.map(function(v){ return Math.pow(Math.min(1, v*depth), 1/2.2); });

    var cU = compositeProg.uniforms;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.useProgram(compositeProg.program);
    gl.uniform2f(cU.uResolution, canvas.width, canvas.height);
    gl.uniform3fv(cU.uColor,     base);
    gl.uniform3fv(cU.uHighlight, highlight);
    gl.uniform3fv(cU.uInk,       ink);
    gl.uniform1f(cU.uGain,       4.8 * CFG.brightness);
    gl.uniform1f(cU.uShine,      0.025 * CFG.shine);
    gl.uniform1f(cU.uPresence,   presence);
    gl.uniform1f(cU.uGrain,      CFG.grain);
    gl.uniform1f(cU.uFade,       CFG.fade);
    gl.uniform1f(cU.uOpacity,    CFG.opacity);
    gl.uniform1f(cU.uTime,       state.clock % 1000);
    gl.uniform1f(cU.uLightMode,  CFG.lightMode ? 1 : 0);
    gl.uniform3f(cU.uHeat,
      (state.heatX * canvas.width)  / view.width,
      ((view.height - state.heatY) * canvas.height) / view.height,
      state.heat
    );
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, fbTexture);
    gl.uniform1i(cU.uVolume, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  /* ── Анимационный цикл ── */
  function wake() {
    if (!rafId && visible && !document.hidden) rafId = requestAnimationFrame(frame);
  }

  function frame(now) {
    rafId = 0;
    if (!visible || document.hidden) return;

    var dt = last ? Math.min(0.05, (now - last) / 1000) : 1/60;
    last = now;

    if (!CFG.paused && !reduceMotion) state.clock += dt * CFG.speed;

    if (!CFG.intro || reduceMotion) {
      state.intro = 1;
    } else if (state.intro < 1) {
      state.intro = Math.min(1, state.intro + dt / INTRO_SECONDS);
    }

    var engaged = CFG.mouseInteractive && pointer.inside && !reduceMotion;
    var goalYaw   = engaged ? (pointer.x / view.width  - 0.5) * 0.9  : 0;
    var goalPitch = engaged ? (pointer.y / view.height - 0.5) * 0.18 : 0;

    state.yawVel   += (40*(goalYaw   - state.yaw)   - 11*state.yawVel)   * dt;
    state.pitchVel += (40*(goalPitch - state.pitch) - 11*state.pitchVel) * dt;
    state.yaw   += state.yawVel   * dt;
    state.pitch += state.pitchVel * dt;

    state.heat  += ((engaged ? 1 : 0) - state.heat) * (1 - Math.exp(-dt * (engaged ? 4 : 2)));
    state.heatX += (pointer.x - state.heatX) * (1 - Math.exp(-dt * 8));
    state.heatY += (pointer.y - state.heatY) * (1 - Math.exp(-dt * 8));

    render();

    var settling = state.intro < 1
      || Math.abs(goalYaw - state.yaw) > 0.0005
      || Math.abs(state.yawVel) > 0.0005
      || Math.abs(goalPitch - state.pitch) > 0.0005
      || Math.abs(state.pitchVel) > 0.0005
      || Math.abs((engaged ? 1 : 0) - state.heat) > 0.002;

    if (!CFG.paused && !reduceMotion || settling) {
      rafId = requestAnimationFrame(frame);
    } else {
      last = 0;
    }
  }

  /* ── Resize ── */
  function resize() {
    var w     = Math.max(1, container.clientWidth);
    var h     = Math.max(1, container.clientHeight);
    var ratio = Math.min(window.devicePixelRatio || 1, LITE ? 1 : 2);
    view.width  = w;
    view.height = h;
    canvas.width  = Math.max(1, Math.round(w * ratio));
    canvas.height = Math.max(1, Math.round(h * ratio));

    var sc = CFG.quality;
    if (w * h * sc * sc > MAX_VOLUME_PIXELS) sc = Math.sqrt(MAX_VOLUME_PIXELS / (w * h));
    view.volW = Math.max(1, Math.round(w * sc));
    view.volH = Math.max(1, Math.round(h * sc));

    render();
    wake();
  }

  /* ── События ── */
  window.addEventListener('pointermove', function(e) {
    var rect = container.getBoundingClientRect();
    pointer.x = e.clientX - rect.left;
    pointer.y = e.clientY - rect.top;
    pointer.inside = pointer.x >= 0 && pointer.y >= 0
                  && pointer.x <= rect.width && pointer.y <= rect.height;
    wake();
  }, { passive: true });

  document.documentElement.addEventListener('pointerleave', function() {
    pointer.inside = false;
    wake();
  });

  document.addEventListener('visibilitychange', function() {
    last = 0;
    wake();
  });

  if ('ResizeObserver' in window) {
    new ResizeObserver(resize).observe(container);
  } else {
    window.addEventListener('resize', resize);
  }

  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function(entries) {
      visible = entries.some(function(e) { return e.isIntersecting; });
      if (visible) { last = 0; wake(); }
    }).observe(container);
  }

  resize();
  console.log('[plasma.js] React Bits Plasma (WebGL2) started');
})();
