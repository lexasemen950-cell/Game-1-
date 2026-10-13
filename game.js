// ============================================================================
// Far Cry JS — Остров · игровой код + система логирования
// ============================================================================

const Log = (() => {
  const buf = [];
  const MAX = 20000;
  const startMs = performance.now();
  let fileHandle = null, fileStream = null;
  let sessionStart = new Date();
  let eventCounts = {
    shots: 0, hits: 0, headshots: 0, kills: 0,
    damageDealt: 0, damageTaken: 0,
    palFell: 0, palmBroke: 0, ricochets: 0, enemyStatesChanged: 0
  };
  let frames = 0, fpsSum = 0, fpsMin = Infinity, fpsSamples = 0, lastFpsLog = 0;

  function pad(n, len) { return String(n).padStart(len || 2, '0'); }
  function elapsed() { return ((performance.now() - startMs) / 1000).toFixed(3).padStart(8, ' '); }
  function push(line) { buf.push(line); if (buf.length > MAX) buf.splice(0, buf.length - MAX); }
  function write(line) { if (fileStream) { try { fileStream.write(line + '\n'); } catch (e) {} } push(line); }

  const api = {
    canWriteFile: () => typeof window.showSaveFilePicker === 'function' &&
                         (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1'),
    async attachFile() {
      if (!api.canWriteFile() || fileHandle) return false;
      try {
        fileHandle = await window.showSaveFilePicker({
          suggestedName: 'farcry-log-' + filenameStamp() + '.txt',
          types: [{ description: 'Лог игры', accept: { 'text/plain': ['.txt'] } }]
        });
        fileStream = await fileHandle.createWritable();
        return true;
      } catch (e) { fileHandle = null; fileStream = null; return false; }
    },
    header() {
      write('='.repeat(72));
      write('Far Cry JS — Остров · лог сессии');
      write('='.repeat(72));
      write('Начало:        ' + sessionStart.toLocaleString('ru-RU'));
      write('URL страницы:  ' + location.href);
      write('User Agent:    ' + navigator.userAgent);
      write('Экран:         ' + innerWidth + 'x' + innerHeight);
      write('DevicePixel:   ' + (window.devicePixelRatio || 1));
      write('WebGL:         ' + (() => {
        try { const gl = rd.getContext(); const dbg = gl.getExtension('WEBGL_debug_renderer_info');
          return dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : 'unknown'; } catch (e) { return 'unknown'; }
      })());
      write('File System API: ' + (api.canWriteFile() ? 'доступен' : 'нет (будет скачивание)'));
      write('Режим ввода:   ' + (mobileMode ? 'мобильный (сенсор)' : 'ПК (клавиатура+мышь)'));
      write('='.repeat(72));
      write('');
    },
    e(cat, text) { write('[' + elapsed() + '] ' + cat.padEnd(9, ' ') + ' ' + text); },
    info(t){api.e('INFO',t);}, world(t){api.e('WORLD',t);}, ai(t){api.e('AI',t);},
    shot(t){api.e('SHOT',t);eventCounts.shots++;},
    hit(t){api.e('HIT',t);eventCounts.hits++;},
    death(t){api.e('DEATH',t);eventCounts.kills++;},
    damage(t){api.e('DAMAGE',t);},
    warn(t){api.e('WARN',t);},
    error(text) {
      if (!api._lastErrText || api._lastErrText !== text || (performance.now() - (api._lastErrAt || 0)) > 1000) {
        api._lastErrText = text; api._lastErrAt = performance.now(); api.e('ERROR', text);
      }
    },
    metric(t){api.e('METRIC',t);},
    fps(dt) {
      frames++; const f = 1 / Math.max(0.0001, dt);
      fpsSum += f; fpsSamples++;
      if (f < fpsMin) fpsMin = f;
      if (performance.now() - lastFpsLog > 5000) {
        lastFpsLog = performance.now();
        api.metric('FPS ' + (fpsSum / fpsSamples).toFixed(1) + ' (min ' + fpsMin.toFixed(1) + ')');
        fpsSum = 0; fpsSamples = 0; fpsMin = Infinity;
      }
    },
    inc(k){if(eventCounts[k]!==undefined)eventCounts[k]++;},
    add(k,v){if(eventCounts[k]!==undefined)eventCounts[k]+=v;},
    summary(reason) {
      write(''); write('='.repeat(72)); write('ИТОГИ СЕССИИ — ' + reason); write('='.repeat(72));
      const dur = (performance.now() - startMs) / 1000;
      write('Длительность:   ' + dur.toFixed(1) + ' с');
      write('Всего кадров:   ' + frames);
      write('Средний FPS:    ' + (frames / Math.max(1, dur)).toFixed(1));
      write('Счётчики:');
      for (const k in eventCounts) write('  ' + k.padEnd(20, ' ') + ' = ' + eventCounts[k]);
      const acc = eventCounts.shots > 0 ? (eventCounts.hits / eventCounts.shots * 100).toFixed(1) : '0';
      write('Точность:       ' + acc + '%');
      write('='.repeat(72));
    },
    async save(reason) {
      const text = buf.join('\n');
      if (fileStream) {
        try { await fileStream.write('\n' + '='.repeat(72) + '\nСохранено: ' + new Date().toLocaleString('ru-RU') + '\n');
          await fileStream.close(); fileStream = null;
          api.info('Лог закрыт (запись в выбранный файл завершена)');
        } catch (e) { api.error('Не удалось записать в файл: ' + e.message); }
      }
      try {
        const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url;
        a.download = 'farcry-log-' + filenameStamp() + '.txt';
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      } catch (e) { console.error('Не удалось скачать лог:', e); }
    },
    dump() { return buf.join('\n'); },
    size() { return buf.length; }
  };
  function filenameStamp() {
    const d = new Date();
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + '-' + pad(d.getHours()) + '-' + pad(d.getMinutes());
  }
  window.addEventListener('error', ev => api.error('JS error: ' + ev.message + ' @ ' + (ev.filename || '?') + ':' + (ev.lineno || '?')));
  window.addEventListener('unhandledrejection', ev => api.error('Unhandled promise rejection: ' + (ev.reason && ev.reason.message ? ev.reason.message : ev.reason)));
  return api;
})();

// ============================================================================
// МОБИЛЬНЫЙ / СЕНСОРНЫЙ ВВОД
// ============================================================================
const $ = id => document.getElementById(id);

const isTouchDevice = () => ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
let mobileMode = isTouchDevice();
const touchInput = { moveX: 0, moveY: 0, lookX: 0, lookY: 0 };

function updateOverlayMsg() {
  const m = $('msg'); if (!m) return;
  if (mobileMode) {
    m.innerHTML = 'Тапните, чтобы начать<br><br>' +
      '🕹 левый стик — движение · 🕹 правый — обзор<br>' +
      '🔥 — огонь · ⤒ — прыжок · ⟳ — перезарядка · ⚡ — бег · 🌬 — ветер<br>' +
      'Зачистите остров от наёмников!';
  } else {
    m.innerHTML = 'Нажмите, чтобы начать<br><br>' +
      'WASD — ходьба · Shift — бег · Пробел — прыжок<br>' +
      'Мышь — прицел · ЛКМ — огонь · R — перезарядка · V — ветер · L — лог<br>' +
      'Стрелки — поворот, если мышь не захватывается<br>' +
      'Зачистите остров от наёмников!';
  }
}

function setMobileMode(on) {
  mobileMode = on;
  document.body.classList.toggle('mobile', on);
  const mt = $('mobileControls'); if (mt) mt.style.display = on ? 'block' : 'none';
  const tg = $('modeToggle'); if (tg) tg.textContent = on ? '📱' : '🖥';
  updateOverlayMsg();
  Log.info('Режим ввода переключён на: ' + (on ? 'мобильный' : 'ПК'));
}

function setupStick(stickEl, knobEl, onMove, onEnd) {
  let active = false, pid = null, cx = 0, cy = 0, rad = 60;
  const getRect = () => stickEl.getBoundingClientRect();
  function handleMove(t) {
    let dx = t.clientX - cx, dy = t.clientY - cy;
    const d = Math.hypot(dx, dy);
    if (d > rad) { dx = dx / d * rad; dy = dy / d * rad; }
    knobEl.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
    onMove(dx / rad, dy / rad);
  }
  stickEl.addEventListener('touchstart', e => {
    if (active) return;
    const t = e.changedTouches[0];
    const r = getRect();
    cx = r.left + r.width / 2;
    cy = r.top + r.height / 2;
    rad = r.width / 2 - 8;
    active = true; pid = t.identifier;
    handleMove(t);
    e.preventDefault();
  }, { passive: false });
  stickEl.addEventListener('touchmove', e => {
    if (!active) return;
    for (const t of e.changedTouches) if (t.identifier === pid) { handleMove(t); break; }
    e.preventDefault();
  }, { passive: false });
  const end = e => {
    if (!active) return;
    for (const t of e.changedTouches) {
      if (t.identifier === pid) {
        active = false; pid = null;
        knobEl.style.transform = '';
        onEnd();
        break;
      }
    }
    e.preventDefault();
  };
  stickEl.addEventListener('touchend', end, { passive: false });
  stickEl.addEventListener('touchcancel', end, { passive: false });
}

function initMobileControls() {
  const ms = $('moveStick'), mk = $('moveKnob');
  const ls = $('lookStick'), lk = $('lookKnob');
  if (ms && mk) {
    setupStick(ms, mk,
      (x, y) => { touchInput.moveX = x; touchInput.moveY = y; },
      () => { touchInput.moveX = 0; touchInput.moveY = 0; });
  }
  if (ls && lk) {
    setupStick(ls, lk,
      (x, y) => { touchInput.lookX = x; touchInput.lookY = y; },
      () => { touchInput.lookX = 0; touchInput.lookY = 0; });
  }
  const fireBtn = $('fireBtn');
  if (fireBtn) {
    fireBtn.addEventListener('touchstart', e => { fire = 1; e.preventDefault(); }, { passive: false });
    fireBtn.addEventListener('touchend', e => { fire = 0; e.preventDefault(); }, { passive: false });
    fireBtn.addEventListener('touchcancel', e => { fire = 0; e.preventDefault(); }, { passive: false });
  }
  const jumpBtn = $('jumpBtn');
  if (jumpBtn) {
    jumpBtn.addEventListener('touchstart', e => { K.Space = 1; e.preventDefault(); }, { passive: false });
    jumpBtn.addEventListener('touchend', e => { K.Space = 0; e.preventDefault(); }, { passive: false });
    jumpBtn.addEventListener('touchcancel', e => { K.Space = 0; e.preventDefault(); }, { passive: false });
  }
  const reloadBtn = $('reloadBtn');
  if (reloadBtn) reloadBtn.addEventListener('touchstart', e => { reload(); e.preventDefault(); }, { passive: false });
  const runBtn = $('runBtn');
  if (runBtn) {
    runBtn.addEventListener('touchstart', e => { K.ShiftLeft = 1; e.preventDefault(); }, { passive: false });
    runBtn.addEventListener('touchend', e => { K.ShiftLeft = 0; e.preventDefault(); }, { passive: false });
    runBtn.addEventListener('touchcancel', e => { K.ShiftLeft = 0; e.preventDefault(); }, { passive: false });
  }
  const windBtn = $('windBtn');
  if (windBtn) windBtn.addEventListener('touchstart', e => { setWindLevel((wind.level + 1) % 3); e.preventDefault(); }, { passive: false });
}

// ============================================================================
let sd = 7;
const R = () => (sd = sd * 16807 % 2147483647) / 2147483647;

const H = (x, z) => {
  const r = Math.hypot(x, z);
  return 12 * (1 - (r / 140) ** 2) - 2
       + Math.sin(x * .05) * Math.cos(z * .045) * 3
       + Math.sin(x * .13 + z * .09) * 1.2
       + Math.cos(z * .11 - x * .07) * .8;
};

function mk(w, f, rp) {
  const c = document.createElement('canvas');
  c.width = c.height = w; f(c.getContext('2d'), w);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (rp) t.repeat.set(rp, rp);
  return t;
}
const blot = (g, w, n, cl, z) => {
  g.globalAlpha = .5;
  for (let i = 0; i < n; i++) {
    g.fillStyle = cl[i % cl.length]; g.beginPath();
    g.arc(Math.random() * w, Math.random() * w, Math.random() * z + 1, 0, 7); g.fill();
  }
  g.globalAlpha = 1;
};
const tG = mk(256, (g,w)=>{g.fillStyle='#ccc';g.fillRect(0,0,w,w);blot(g,w,1500,['#fff','#999','#bbb','#ddd'],4);},60);
const tB = mk(128, (g,w)=>{g.fillStyle='#6b4a2b';g.fillRect(0,0,w,w);for(let i=0;i<120;i++){g.fillStyle=i%2?'#4a3220':'#8a6540';g.fillRect(Math.random()*w,0,2+Math.random()*3,w);}});
const tC = mk(128, (g,w)=>{g.fillStyle='#4b5a2f';g.fillRect(0,0,w,w);blot(g,w,60,['#2f3a1d','#6b6a3a','#1d2412','#7a5a35'],14);});
const tW = mk(128, (g,w)=>{g.fillStyle='#2a8cc4';g.fillRect(0,0,w,w);blot(g,w,300,['#5fb8e6','#1b6fa0','#9bd6f2'],6);},50);
const tS = mk(256, (g,w)=>{const q=g.createLinearGradient(0,0,0,w);q.addColorStop(0,'#2f7fd1');q.addColorStop(.5,'#a8d4f0');q.addColorStop(1,'#a8d4f0');g.fillStyle=q;g.fillRect(0,0,w,w);});
const tCloud = mk(256, (g,w)=>{
  g.clearRect(0,0,w,w);
  for (let i = 0; i < 70; i++) {
    const x = Math.random()*w, y = Math.random()*w, r = 15+Math.random()*45, a = 0.35+Math.random()*0.4;
    const grd = g.createRadialGradient(x,y,2,x,y,r);
    grd.addColorStop(0,'rgba(255,255,255,'+a+')');
    grd.addColorStop(.5,'rgba(255,255,255,'+(a*0.45)+')');
    grd.addColorStop(1,'rgba(255,255,255,0)');
    g.fillStyle = grd; g.beginPath(); g.arc(x,y,r,0,7); g.fill();
  }
},3);

const sc = new THREE.Scene();
const cam = new THREE.PerspectiveCamera(70, 1, .1, 600);
const rd = new THREE.WebGLRenderer({ antialias: !isTouchDevice() });
cam.rotation.order = 'YXZ';
sc.add(cam);
rd.setPixelRatio(Math.min(devicePixelRatio, isTouchDevice() ? 1.2 : 1.5));
document.body.prepend(rd.domElement);
rd.shadowMap.enabled = !isTouchDevice();
rd.shadowMap.type = THREE.PCFSoftShadowMap;

const rz = () => { rd.setSize(innerWidth, innerHeight); cam.aspect = innerWidth/innerHeight; cam.updateProjectionMatrix(); };
rz(); addEventListener('resize', rz);
addEventListener('orientationchange', () => setTimeout(rz, 200));

sc.fog = new THREE.Fog(0xa8d4f0, 50, 260);
sc.add(new THREE.HemisphereLight(0xcfe8ff, 0x4a6a3a, .9));
const sun = new THREE.DirectionalLight(0xfff0d0, .9);
sun.position.set(80, 120, 50);
sc.add(sun);
sun.castShadow = !isTouchDevice();
sun.shadow.mapSize.set(1024, 1024);
sun.shadow.camera.left = -50; sun.shadow.camera.right = 50;
sun.shadow.camera.top = 50; sun.shadow.camera.bottom = -50;
sun.shadow.camera.near = 50; sun.shadow.camera.far = 300;
sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03;
sc.add(sun.target);

const sky = new THREE.Mesh(new THREE.SphereGeometry(450, 16, 10), new THREE.MeshBasicMaterial({ map: tS, side: THREE.BackSide, fog: false }));
sc.add(sky);
const sunDir = new THREE.Vector3().copy(sun.position).normalize();
const sunDisc = new THREE.Mesh(new THREE.SphereGeometry(14, 16, 12), new THREE.MeshBasicMaterial({ color: 0xfff8c8, fog: false, transparent: true, opacity: .95 }));
sunDisc.position.copy(sunDir).multiplyScalar(400); sky.add(sunDisc);
const sunGlow = new THREE.Mesh(new THREE.SphereGeometry(34, 16, 12), new THREE.MeshBasicMaterial({ color: 0xffd870, fog: false, transparent: true, opacity: .32, blending: THREE.AdditiveBlending, depthWrite: false }));
sunGlow.position.copy(sunDisc.position); sky.add(sunGlow);
const sunGlow2 = new THREE.Mesh(new THREE.SphereGeometry(60, 16, 12), new THREE.MeshBasicMaterial({ color: 0xffb040, fog: false, transparent: true, opacity: .12, blending: THREE.AdditiveBlending, depthWrite: false }));
sunGlow2.position.copy(sunDisc.position); sky.add(sunGlow2);

const cloudGeo = new THREE.PlaneGeometry(1100, 1100); cloudGeo.rotateX(-Math.PI / 2);
const cloudMat1 = new THREE.MeshBasicMaterial({ map: tCloud.clone(), transparent: true, opacity: .75, depthWrite: false, fog: false, side: THREE.DoubleSide });
const cloudMat2 = new THREE.MeshBasicMaterial({ map: tCloud.clone(), transparent: true, opacity: .5, depthWrite: false, fog: false, side: THREE.DoubleSide });
cloudMat1.map.needsUpdate = true; cloudMat2.map.needsUpdate = true;
const cloud1 = new THREE.Mesh(cloudGeo, cloudMat1); cloud1.position.set(0, 90, 0); cloud1.renderOrder = -1; sc.add(cloud1);
const cloud2 = new THREE.Mesh(cloudGeo, cloudMat2); cloud2.position.set(0, 135, 0); cloud2.renderOrder = -1; sc.add(cloud2);

const WIND_LEVELS = ['слабый', 'средний', 'сильный'];
const WIND_STRENGTH = [0.15, 0.5, 1.0];
const wind = { level: 1, strength: 0.5, dirX: 0.85, dirZ: 0.53 };
function setWindLevel(lv) {
  wind.level = lv; wind.strength = WIND_STRENGTH[lv];
  const a = Math.random() * 6.28; wind.dirX = Math.cos(a); wind.dirZ = Math.sin(a);
  updateWindHud();
  Log.info('Ветер → ' + WIND_LEVELS[lv] + ' (сила ' + wind.strength.toFixed(2) + ', направление ' + wind.dirX.toFixed(2) + ',' + wind.dirZ.toFixed(2) + ')');
}
function updateWindHud() { const el = $('wd'); if (el) el.textContent = 'ВЕТЕР: ' + WIND_LEVELS[wind.level]; }
updateWindHud();

const tg = new THREE.PlaneGeometry(330, 330, 110, 110); tg.rotateX(-Math.PI / 2);
{
  const P = tg.attributes.position, col = new Float32Array(P.count * 3);
  for (let i = 0; i < P.count; i++) {
    const h = H(P.getX(i), P.getZ(i));
    P.setY(i, h);
    const n = .85 + Math.random() * .3;
    const c = h < .9 ? [.86,.78,.56] : h < 7 ? [.2,.5,.16] : [.5,.47,.43];
    col.set([c[0]*n, c[1]*n, c[2]*n], i * 3);
  }
  tg.setAttribute('color', new THREE.BufferAttribute(col, 3));
  tg.computeVertexNormals();
}
const groundMesh = new THREE.Mesh(tg, new THREE.MeshLambertMaterial({ map: tG, vertexColors: true }));
groundMesh.userData.solid = 1; groundMesh.receiveShadow = true; sc.add(groundMesh);

const waterGeo = new THREE.PlaneGeometry(1200, 1200, isTouchDevice() ? 64 : 128, isTouchDevice() ? 64 : 128);
const waterMat = new THREE.MeshPhongMaterial({ map: tW, transparent: true, opacity: .78, shininess: 100, specular: 0x9fc8e8 });
waterMat.onBeforeCompile = sh => {
  sh.uniforms.time = { value: 0 };
  sh.uniforms.windDirX = { value: wind.dirX };
  sh.uniforms.windDirZ = { value: wind.dirZ };
  sh.uniforms.windStrength = { value: wind.strength };
  sh.vertexShader = 'uniform float time;\nuniform float windDirX;\nuniform float windDirZ;\nuniform float windStrength;\nvarying float vWave;\n' + sh.vertexShader;
  sh.vertexShader = sh.vertexShader.replace('#include <begin_vertex>',
`#include <begin_vertex>
vec4 wpos = modelMatrix * vec4(position,1.0);
float ampMul = 0.7 + windStrength * 0.7;
float dirDot = (wpos.x * windDirX + wpos.z * windDirZ) + time * windStrength * 2.5;
float w =
    sin(dirDot * 0.06) * (0.13 * ampMul)
  + sin(wpos.x*0.055 + time*1.15) * (0.1 * ampMul)
  + sin(wpos.z*0.082 + time*1.55) * (0.09 * ampMul)
  + sin((wpos.x+wpos.z)*0.031 + time*0.75) * 0.14
  + sin((wpos.x-wpos.z)*0.11 + time*2.1) * (0.05 + windStrength*0.03);
transformed.z += w;
vWave = w;`);
  sh.fragmentShader = 'varying float vWave;\n' + sh.fragmentShader;
  sh.fragmentShader = sh.fragmentShader.replace('#include <dithering_fragment>',
`#include <dithering_fragment>
gl_FragColor.rgb *= 0.94 + vWave*0.35;`);
  waterMat.userData.shader = sh;
};
const wt = new THREE.Mesh(waterGeo, waterMat); wt.rotation.x = -Math.PI / 2; sc.add(wt);

let waterDriftX = 0, waterDriftZ = 0;
let cloudOff1X = 0, cloudOff1Z = 0, cloudOff2X = 0, cloudOff2Z = 0;

const ob = [], rocks = [], sw = [], solid = [groundMesh];
const blk = (x, z, r) => ob.some(o => Math.hypot(o[0]-x, o[1]-z) < o[2]+r);

const barkM = new THREE.MeshLambertMaterial({ map: tB });
const leafM = new THREE.MeshLambertMaterial({ color: 0x2f8a34, side: THREE.DoubleSide });
const coM = new THREE.MeshLambertMaterial({ color: 0x5a3a1a });
const CO = new THREE.SphereGeometry(.2, 6, 5);
const pYStem = new THREE.MeshLambertMaterial({ color: 0x6fa84a });
const pMTrunk = new THREE.MeshLambertMaterial({ map: tB, color: 0xddc8a0 });
const pATrunk = new THREE.MeshLambertMaterial({ map: tB, color: 0xa08060 });
const pYLeaf = new THREE.MeshLambertMaterial({ color: 0xaad880, side: THREE.DoubleSide });
const pMLeaf = new THREE.MeshLambertMaterial({ color: 0x3a8a2a, side: THREE.DoubleSide });
const pALeaf = new THREE.MeshLambertMaterial({ color: 0x2d5a1a, side: THREE.DoubleSide });
const pDeadLeaf = new THREE.MeshLambertMaterial({ color: 0x8a7a4a, side: THREE.DoubleSide });
const pCoconut = new THREE.MeshLambertMaterial({ color: 0x5a3a18 });
const palms = [];

function buildFrond(len, width, mat, arc) {
  const geo = new THREE.PlaneGeometry(len, width, 8, 2);
  geo.rotateX(-Math.PI / 2); geo.translate(len / 2, 0, 0);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), t = x / len;
    p.setY(i, p.getY(i) - t * t * len * arc);
    const wf = Math.sin(t * Math.PI) * 0.7 + 0.3;
    p.setZ(i, p.getZ(i) * wf);
  }
  geo.computeVertexNormals();
  return new THREE.Mesh(geo, mat);
}
function buildTrunk(h, radTop, radBot, lean, mat) {
  const segs = Math.max(6, Math.floor(h));
  const geo = new THREE.CylinderGeometry(radTop, radBot, h, 6, segs, true);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i) + h / 2, t = y / h;
    p.setX(i, p.getX(i) + t * t * lean);
  }
  geo.translate(0, h / 2, 0);
  geo.computeVertexNormals();
  return new THREE.Mesh(geo, mat);
}
function buildPalm(x, z, type) {
  const g = new THREE.Group(); g.rotation.order = 'YXZ';
  const baseY = H(x, z);
  g.position.set(x, baseY, z); g.rotation.y = R() * 6.28;
  const palm = {
    type, group: g, baseY, x, z,
    maxTrunkHp: 0, trunkHp: 0, maxCrownHp: 0, crownHp: 0,
    leaves: [], fruits: [],
    falling: false, fallAngle: 0, fallVel: 0, landed: false,
    fallDir: 0, fallDirVec: new THREE.Vector3(1, 0, 0),
    leaning: 0, leanDir: undefined, crownDead: false,
    swayPhase: R() * 6.28, obArr: null, prevAngle: 0
  };
  if (type === 'young') {
    palm.maxTrunkHp = palm.trunkHp = 30;
    palm.maxCrownHp = palm.crownHp = 20;
    const nL = 5 + Math.floor(R() * 4);
    for (let i = 0; i < nL; i++) {
      const leafG = new THREE.Group();
      leafG.position.y = 0.05;
      leafG.rotation.y = i * (6.28 / nL) + (R() - .5) * .6;
      const frond = buildFrond(0.9 + R() * 0.6, 0.22, pYLeaf, 0.3);
      frond.rotation.z = 0.7 + R() * 0.3;
      leafG.add(frond);
      frond.userData.solid = 1; frond.userData.palm = palm;
      frond.userData.palmPart = 'leaf'; frond.userData.palmIndex = i;
      g.add(leafG);
      palm.leaves.push({ mesh: frond, group: leafG, hp: 15, attached: true, idx: i });
    }
    const obArr = [x, z, 0.3]; ob.push(obArr); palm.obArr = obArr;
  } else if (type === 'medium') {
    const h = 3 + R() * 4, rad = 0.12 + R() * 0.06, lean = (R() - .5) * 1.2;
    palm.maxTrunkHp = palm.trunkHp = 100; palm.maxCrownHp = palm.crownHp = 40;
    const trunk = buildTrunk(h, rad * 0.85, rad, lean, pMTrunk);
    trunk.userData.solid = 1; trunk.userData.palm = palm; trunk.userData.palmPart = 'trunk';
    trunk.castShadow = true;
    g.add(trunk); palm.trunkMesh = trunk; palm.trunkH = h; palm.trunkLean = lean;
    solid.push(trunk);
    const crown = new THREE.Group(); crown.position.set(lean, h, 0);
    g.add(crown); palm.crownGroup = crown;
    const nL = 8 + Math.floor(R() * 5);
    for (let i = 0; i < nL; i++) {
      const leafG = new THREE.Group();
      leafG.rotation.y = i * (6.28 / nL) + (R() - .5) * .4;
      const pitch = -0.4 + R() * 0.9;
      const frond = buildFrond(1.5 + R() * 1.0, 0.3, pMLeaf, 0.2);
      frond.rotation.z = pitch;
      const petiole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 0.3, 4), pMTrunk);
      petiole.rotation.z = Math.PI / 2 - pitch; petiole.position.set(0.15, 0, 0);
      petiole.userData.solid = 1; petiole.userData.palm = palm;
      petiole.userData.palmPart = 'petiole'; petiole.userData.palmIndex = i;
      leafG.add(frond, petiole);
      frond.userData.solid = 1; frond.userData.palm = palm;
      frond.userData.palmPart = 'leaf'; frond.userData.palmIndex = i;
      crown.add(leafG);
      palm.leaves.push({ mesh: frond, petiole, group: leafG, hp: 20, attached: true, idx: i });
    }
    if (R() < 0.4) {
      const fruit = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 5), pCoconut);
      fruit.position.set((R() - .5) * 0.15, -0.1, (R() - .5) * 0.15);
      fruit.userData.solid = 1; fruit.userData.palm = palm;
      fruit.userData.palmPart = 'fruit'; fruit.userData.palmIndex = 0;
      crown.add(fruit); palm.fruits.push({ mesh: fruit, hp: 5, attached: true, idx: 0 });
    }
    const obArr = [x, z, 0.35]; ob.push(obArr); palm.obArr = obArr;
  } else {
    const h = 10 + R() * 15, rad = 0.22 + R() * 0.15, lean = (R() - .5) * 2.5;
    palm.maxTrunkHp = palm.trunkHp = 250; palm.maxCrownHp = palm.crownHp = 80;
    const trunk = buildTrunk(h, rad * 0.8, rad, lean, pATrunk);
    trunk.userData.solid = 1; trunk.userData.palm = palm; trunk.userData.palmPart = 'trunk';
    trunk.castShadow = true;
    g.add(trunk); palm.trunkMesh = trunk; palm.trunkH = h; palm.trunkLean = lean;
    solid.push(trunk);
    const crown = new THREE.Group(); crown.position.set(lean, h, 0);
    g.add(crown); palm.crownGroup = crown;
    const nDead = 5 + Math.floor(R() * 3);
    for (let i = 0; i < nDead; i++) {
      const dg = new THREE.Group();
      dg.rotation.y = i * (6.28 / nDead) + (R() - .5) * .3;
      const dl = buildFrond(1.2 + R() * 0.5, 0.4, pDeadLeaf, 0.9);
      dl.rotation.z = -1.2 - R() * 0.4;
      dg.add(dl); crown.add(dg);
    }
    const nL = 12 + Math.floor(R() * 6);
    for (let i = 0; i < nL; i++) {
      const leafG = new THREE.Group();
      leafG.rotation.y = i * (6.28 / nL) + (R() - .5) * .3;
      const pitch = -0.5 + R() * 1.0;
      const frond = buildFrond(2.5 + R() * 1.5, 0.4, pALeaf, 0.18);
      frond.rotation.z = pitch;
      const petiole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.4, 5), pATrunk);
      petiole.rotation.z = Math.PI / 2 - pitch; petiole.position.set(0.2, 0, 0);
      petiole.userData.solid = 1; petiole.userData.palm = palm;
      petiole.userData.palmPart = 'petiole'; petiole.userData.palmIndex = i;
      leafG.add(frond, petiole);
      frond.userData.solid = 1; frond.userData.palm = palm;
      frond.userData.palmPart = 'leaf'; frond.userData.palmIndex = i;
      crown.add(leafG);
      palm.leaves.push({ mesh: frond, petiole, group: leafG, hp: 30, attached: true, idx: i });
    }
    const nF = 3 + Math.floor(R() * 5);
    for (let i = 0; i < nF; i++) {
      const fruit = new THREE.Mesh(new THREE.SphereGeometry(0.12, 7, 6), pCoconut);
      const a = R() * 6.28, r = 0.15 + R() * 0.15;
      fruit.position.set(Math.cos(a) * r, -0.15 - R() * 0.1, Math.sin(a) * r);
      fruit.userData.solid = 1; fruit.userData.palm = palm;
      fruit.userData.palmPart = 'fruit'; fruit.userData.palmIndex = i;
      crown.add(fruit); palm.fruits.push({ mesh: fruit, hp: 5, attached: true, idx: i });
    }
    const obArr = [x, z, 0.6]; ob.push(obArr); palm.obArr = obArr;
  }
  sc.add(g); palms.push(palm);
  return palm;
}
(function spawnPalms() {
  const plan = [['adult', 10], ['medium', 22], ['young', 28]];
  let count = { young: 0, medium: 0, adult: 0 };
  for (const [type, c] of plan) {
    for (let i = 0, n = 0; n < c && i < 4000; i++) {
      const a = R() * 6.28, r = 5 + R() * 125;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      const h = H(x, z);
      const hmin = type === 'young' ? 0.4 : type === 'medium' ? 0.6 : 2;
      if (h > hmin && h < 7 && !blk(x, z, type === 'adult' ? 1.2 : 0.7)) {
        buildPalm(x, z, type); n++; count[type]++;
      }
    }
  }
  Log.world('Палм: ' + palms.length + ' (взрослых ' + count.adult + ', средних ' + count.medium + ', молодых ' + count.young + ')');
})();

const rkM = new THREE.MeshPhongMaterial({ color: 0x8a8780, flatShading: true, shininess: 0, specular: 0x000000 });
for (let i = 0, n = 0; n < 45 && i < 3000; i++) {
  const a = R() * 6.28, rAng = R() * 135;
  const x = Math.cos(a) * rAng, z = Math.sin(a) * rAng;
  const h = H(x, z);
  if (h > -.3) {
    const rad = 1 + R() * 1.5, scaleY = .6 + R() * .5;
    const m = new THREE.Mesh(new THREE.DodecahedronGeometry(rad), rkM);
    m.scale.y = scaleY; m.position.set(x, h + .2, z);
    m.rotation.set(R() * 3, R() * 3, R() * 3);
    m.castShadow = true; sc.add(m);
    ob.push([x, z, 1.4]);
    rocks.push([x, z, rad, h + .2, rad * scaleY]);
    m.userData.solid = 1; m.userData.rock = 1; solid.push(m);
    n++;
  }
}
Log.world('Валунов: ' + rocks.length);

const BX = new THREE.BoxGeometry(1, 1, 1);
const bx = (w, h, d, m, x, y, z) => { const o = new THREE.Mesh(BX, m); o.scale.set(w, h, d); o.position.set(x, y, z); return o; };
const rfM = new THREE.MeshLambertMaterial({ color: 0x7a5c1e });
function hut(x, z) {
  const g = new THREE.Group();
  const rf = new THREE.Mesh(new THREE.ConeGeometry(2.8, 1.5, 4), rfM);
  rf.position.y = 2.75; rf.rotation.y = Math.PI / 4;
  g.add(bx(3, 2, 3, barkM, 0, 1, 0), rf);
  g.position.set(x, H(x, z), z);
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  sc.add(g); ob.push([x, z, 2.3]);
  g.userData.solid = 1; solid.push(g);
}

const kelpMat = new THREE.MeshLambertMaterial({ color: 0x2d5a2a, side: THREE.DoubleSide });
const kelpMat2 = new THREE.MeshLambertMaterial({ color: 0x3f6a34, side: THREE.DoubleSide });
const kelpGeo = new THREE.PlaneGeometry(0.45, 3.2, 1, 6);
{
  const p = kelpGeo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const yy = p.getY(i) + 1.6, t = yy / 3.2;
    p.setX(i, p.getX(i) * (0.35 + t * 0.65) + Math.sin(t * 2.4) * 0.28);
    p.setZ(i, Math.sin(t * 1.7) * 0.14);
  }
  p.setY(0, 0); p.setY(1, 0); p.setY(14, 0); p.setY(15, 0);
  kelpGeo.computeVertexNormals();
}
const kelps = [];
for (let i = 0, n = 0; n < 110 && i < 3500; i++) {
  const a = R() * 6.28, r = R() * 150;
  const x = Math.cos(a) * r, z = Math.sin(a) * r;
  const h = H(x, z);
  if (h < -0.25 && h > -4.5) {
    const g = new THREE.Group();
    g.position.set(x, h, z); g.rotation.y = R() * 6.28;
    const m = new THREE.Mesh(kelpGeo, R() < .5 ? kelpMat : kelpMat2);
    m.position.y = 1.6;
    const sx2 = 0.55 + R() * 0.7;
    const sy = h > -1.6 ? 1.15 + R() * 0.5 : 0.7 + R() * 0.4;
    m.scale.set(sx2, sy, 1);
    g.add(m); sc.add(g);
    const kobj = { group: g, mesh: m, phase: R() * 6.28, free: false, baseY: h, velX: 0, velZ: 0 };
    m.userData.solid = 1; m.userData.kelp = kobj;
    kelps.push(kobj); n++;
  }
}
Log.world('Водорослей: ' + kelps.length);

const rcLos = new THREE.Raycaster();
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _d = new THREE.Vector3();
function los(x, y, z) {
  _a.set(x, y, z); _b.set(px, py, pz); _d.subVectors(_b, _a);
  const D = _d.length();
  if (D < .01) return true;
  _d.normalize();
  rcLos.set(_a, _d); rcLos.far = D;
  const hit = rcLos.intersectObjects(solid, true).length > 0;
  rcLos.far = 120;
  return !hit;
}
function enemyAt(x, z, self, rad) {
  for (const o of en) {
    if (o === self || o.userData.dead) continue;
    if (Math.hypot(o.position.x - x, o.position.z - z) < rad) return true;
  }
  return false;
}
function findCover(ex, ez, tx, tz, self) {
  const pdx = tx - ex, pdz = tz - ez, pdd = Math.hypot(pdx, pdz);
  if (pdd < 2) return null;
  const ux = pdx / pdd, uz = pdz / pdd;
  let best = null, bestScore = -Infinity;
  for (const o of ob) {
    const dx2 = o[0] - ex, dz2 = o[1] - ez, dd = Math.hypot(dx2, dz2);
    if (dd < 3 || dd > 24) continue;
    const dot = dx2 * ux + dz2 * uz;
    if (dot < 1 || dot > pdd) continue;
    const cx = o[0] + ux * (o[2] + 1.3), cz = o[1] + uz * (o[2] + 1.3);
    if (blk(cx, cz, .4)) continue;
    const h = H(cx, cz);
    if (h <= .4) continue;
    if (self && enemyAt(cx, cz, self, 1.3)) continue;
    const distToPlayer = Math.hypot(tx - cx, tz - cz);
    const distToSelf = dd;
    if (distToPlayer < 5) continue;
    let score = -distToSelf * 0.5 + Math.min(distToPlayer, 20) * 0.3 + h * 0.1;
    if (score > bestScore) { bestScore = score; best = { x: cx, z: cz }; }
  }
  return best;
}
function friendlyInLine(srcE, tx, tz) {
  const dx = tx - srcE.position.x, dz = tz - srcE.position.z;
  const len = Math.hypot(dx, dz);
  if (len < 0.5) return false;
  const ux = dx / len, uz = dz / len;
  for (const other of en) {
    if (other === srcE || other.userData.dead) continue;
    const ox = other.position.x - srcE.position.x, oz = other.position.z - srcE.position.z;
    const proj = ox * ux + oz * uz;
    if (proj < 1.5 || proj > len - 0.5) continue;
    const perp = Math.abs(ox * uz - oz * ux);
    if (perp < 1.0) return true;
  }
  return false;
}
function alertOthers(srcE, radius) {
  const sp = srcE.position, r2 = radius * radius;
  let heard = 0, stateChanged = 0;
  for (const other of en) {
    if (other === srcE || other.userData.dead) continue;
    const dx = other.position.x - sp.x, dz = other.position.z - sp.z;
    if (dx * dx + dz * dz > r2) continue;
    _a.set(sp.x, sp.y + 1.5, sp.z);
    _b.set(other.position.x, other.position.y + 1.5, other.position.z);
    _d.subVectors(_b, _a);
    const D = _d.length();
    if (D > 0.01) {
      _d.normalize();
      rcLos.set(_a, _d); rcLos.far = D;
      const blocked = rcLos.intersectObjects(solid, true).length > 0;
      rcLos.far = 120;
      if (blocked) continue;
    }
    const ou = other.userData;
    const oldState = ou.state;
    ou.lastSeen = T; ou.lastPx = px; ou.lastPz = pz;
    if (ou.state === 'patrol' || ou.state === 'search') ou.state = 'search';
    if (ou.state !== oldState) stateChanged++;
    if (ou.group) ou.group.lastContact = T;
    heard++;
  }
  if (heard > 0 && stateChanged > 0) Log.ai('Тревога: ' + heard + ' услышали, ' + stateChanged + ' сменили состояние');
}
function hearPlayerShot() {
  let heard = 0;
  for (const e of en) {
    if (e.userData.dead) continue;
    const d = Math.hypot(px - e.position.x, pz - e.position.z);
    if (d > 70) continue;
    const u = e.userData;
    u.lastHeard = T;
    const spread = 3 + d * 0.15;
    u.lastPx = px + (Math.random() - .5) * spread;
    u.lastPz = pz + (Math.random() - .5) * spread;
    if (u.state === 'patrol') u.state = 'search';
    if (u.group) u.group.lastContact = T;
    heard++;
  }
  if (heard > 0) Log.info('Выстрел услышали: ' + heard + ' врагов');
}
function hearPlayerSteps() {
  for (const e of en) {
    if (e.userData.dead) continue;
    const d = Math.hypot(px - e.position.x, pz - e.position.z);
    const thresh = (K.ShiftLeft || K.ShiftRight) ? 25 : 10;
    if (d > thresh) continue;
    const u = e.userData;
    if (u.state === 'patrol' && R() < 0.3) {
      u.state = 'search';
      u.lastPx = px + (Math.random() - .5) * 4;
      u.lastPz = pz + (Math.random() - .5) * 4;
      Log.ai('Враг услышал шаги, переходит в search');
    }
  }
}
function tryMoveAI(p, dirX, dirZ, dist, self) {
  const angles = [0, 0.55, -0.55, 1.1, -1.1, 1.65, -1.65];
  for (let i = 0; i < angles.length; i++) {
    const a = angles[i], ca = Math.cos(a), sa = Math.sin(a);
    const rx = dirX * ca - dirZ * sa;
    const rz2 = dirX * sa + dirZ * ca;
    const nx = p.x + rx * dist, nz = p.z + rz2 * dist;
    if (H(nx, nz) > 0.4 && !blk(nx, nz, 0.5) && !enemyAt(nx, nz, self, 0.9)) {
      p.x = nx; p.z = nz; return true;
    }
  }
  return false;
}

// ============================================================================
// ВРАГИ
// ============================================================================
const skM = new THREE.MeshLambertMaterial({ color: 0xd2a077 });
const cmM = new THREE.MeshLambertMaterial({ map: tC });
const dkM = new THREE.MeshLambertMaterial({ color: 0x2b2b2b });
const en = [];
const eflM = new THREE.MeshBasicMaterial({ color: 0xffd060 });
let enemyIdCounter = 0;

const DEATH_POSES = [
  { pool:'back', rx:-Math.PI/2, rz:0, armRX:0, armRY:0, armRZ: Math.PI/2, armLX:0, armLY:0, armLZ:-Math.PI/2, legLX:0.20, legRX:-0.20, legSpread:0.40 },
  { pool:'back', rx:-Math.PI/2, rz:0, armRX:-Math.PI*0.85, armRY:0, armRZ:0, armLX:-Math.PI*0.85, armLY:0, armLZ:0, legLX:0.10, legRX:-0.10, legSpread:0.15 },
  { pool:'back', rx:-Math.PI/2, rz:0.35, armRX:-0.4, armRY:0.6, armRZ: Math.PI*0.35, armLX:0, armLY:0, armLZ:-Math.PI*0.30, legLX:0.60, legRX:-0.10, legSpread:0.35 },
  { pool:'back', rx:-Math.PI/2, rz:-0.25, armRX:-1.10, armRY:0, armRZ:0.30, armLX:0.10, armLY:0, armLZ:-0.50, legLX:0.90, legRX:0.10, legSpread:0.25 },
  { pool:'back', rx:-Math.PI/2, rz:0, armRX:0, armRY:0, armRZ: Math.PI/2*1.25, armLX:0, armLY:0, armLZ:-Math.PI/2*1.25, legLX:0.05, legRX:-0.05, legSpread:0.65 },
  { pool:'front', rx:Math.PI/2, rz:0, armRX:-Math.PI/2, armRY:0, armRZ:0.3, armLX:-Math.PI/2, armLY:0, armLZ:-0.3, legLX:0.20, legRX:-0.20, legSpread:0.30 },
  { pool:'front', rx:Math.PI/2, rz:0, armRX:-0.3, armRY:0.9, armRZ:0.6, armLX:-0.3, armLY:-0.9, armLZ:-0.6, legLX:0.50, legRX:-0.40, legSpread:0.40 },
  { pool:'front', rx:Math.PI/2, rz:-0.3, armRX:-0.8, armRY:0.4, armRZ:0.2, armLX:-0.1, armLY:0, armLZ:-1.0, legLX:0.80, legRX:0.70, legSpread:0.30 },
  { pool:'front', rx:Math.PI/2, rz:0, armRX:-1.2, armRY:0.4, armRZ:0.4, armLX:-0.2, armLY:-0.3, armLZ:-0.5, legLX:0.30, legRX:-0.60, legSpread:0.35 },
  { pool:'front', rx:Math.PI/2, rz:0.15, armRX:-0.2, armRY:1.2, armRZ:0.7, armLX:-0.2, armLY:-1.2, armLZ:-0.7, legLX:0.15, legRX:-0.15, legSpread:0.45 },
  { pool:'side', side:'left', rx:0.15, rz:Math.PI/2, armRX:-0.4, armRY:0.3, armRZ:0.3, armLX:-0.2, armLY:-0.3, armLZ:-0.7, legLX:0.40, legRX:-0.20, legSpread:0.30 },
  { pool:'side', side:'left', rx:0.15, rz:Math.PI/2, armRX:-0.9, armRY:0.2, armRZ:0.6, armLX:-0.6, armLY:-0.4, armLZ:-0.6, legLX:1.00, legRX:0.80, legSpread:0.25 },
  { pool:'side', side:'left', rx:0.1, rz:Math.PI/2, armRX:-0.3, armRY:0, armRZ: Math.PI*0.4, armLX:-0.3, armLY:0, armLZ:-Math.PI*0.4, legLX:0.15, legRX:-0.15, legSpread:0.50 },
  { pool:'side', side:'right', rx:0.15, rz:-Math.PI/2, armRX:-0.4, armRY:-0.3, armRZ:0.7, armLX:-0.2, armLY:0.3, armLZ:-0.3, legLX:0.20, legRX:-0.40, legSpread:0.30 },
  { pool:'side', side:'right', rx:0.15, rz:-Math.PI/2, armRX:-0.6, armRY:-0.4, armRZ:0.6, armLX:-0.9, armLY:-0.2, armLZ:-0.6, legLX:0.80, legRX:1.00, legSpread:0.25 },
  { pool:'side', side:'right', rx:0.1, rz:-Math.PI/2, armRX:-0.3, armRY:0, armRZ: Math.PI*0.4, armLX:-0.3, armLY:0, armLZ:-Math.PI*0.4, legLX:-0.15, legRX:0.15, legSpread:0.50 },
];

function pickDeathPose(localAng) {
  const aAbs = Math.abs(localAng);
  let pool;
  if (aAbs < Math.PI * 0.35) pool = 'back';
  else if (aAbs > Math.PI * 0.65) pool = 'front';
  else pool = 'side';
  let cands;
  if (pool === 'side') {
    const sideKey = localAng > 0 ? 'right' : 'left';
    cands = DEATH_POSES.filter(p => p.pool === 'side' && p.side === sideKey);
    if (!cands.length) cands = DEATH_POSES.filter(p => p.pool === 'side');
  } else {
    cands = DEATH_POSES.filter(p => p.pool === pool);
  }
  return cands[Math.floor(Math.random() * cands.length)];
}

const CORPSE_TEST_PTS = [
  [ 0.00, 0.00, 0], [ 0.00, 0.55, 0], [ 0.00, 1.10, 0], [ 0.00, 1.65, 0],
  [ 0.30, 1.10, 0], [-0.30, 1.10, 0],
];
const _corpseTmpV = new THREE.Vector3();
function fixCorpseGround(e) {
  e.updateMatrixWorld(true);
  let needLift = 0;
  for (let i = 0; i < CORPSE_TEST_PTS.length; i++) {
    const tp = CORPSE_TEST_PTS[i];
    _corpseTmpV.set(tp[0], tp[1], tp[2]);
    e.localToWorld(_corpseTmpV);
    const gh = H(_corpseTmpV.x, _corpseTmpV.z);
    const diff = gh - _corpseTmpV.y;
    if (diff > needLift) needLift = diff;
  }
  return needLift;
}

function mkEn(x, z, group) {
  const id = enemyIdCounter++;
  const g = new THREE.Group();
  const hd = bx(.3, .3, .3, skM, 0, 1.65, 0); hd.userData.head = 1;
  const lm = sx => { const p = new THREE.Group(); p.position.set(sx * .15, .8, 0); p.add(bx(.25, .8, .25, dkM, 0, -.4, 0)); return p; };
  const l1 = lm(-1), l2 = lm(1);
  const aim = new THREE.Group(); aim.position.set(0, 1.45, 0);
  const armR = new THREE.Group(); armR.position.set(0.12, 0, 0);
  const armL = new THREE.Group(); armL.position.set(-0.12, 0, 0);
  const gun = new THREE.Group(); gun.position.set(0, -.12, .22);
  gun.add(bx(.08, .1, .55, dkM, 0, 0, .15));
  gun.add(bx(.05, .05, .28, dkM, 0, .03, .52));
  gun.add(bx(.07, .16, .08, barkM, 0, -.13, .05));
  gun.add(bx(.07, .09, .22, barkM, 0, -.02, -.13));
  gun.add(bx(.06, .04, .14, dkM, 0, .08, .3));
  const efl = bx(.1, .1, .02, eflM, 0, .03, .68); efl.visible = false; gun.add(efl);
  armR.add(gun);
  const hR = new THREE.Mesh(new THREE.BoxGeometry(.11, .13, .14), skM); hR.position.set(0, -.22, .2); armR.add(hR);
  const hL = new THREE.Mesh(new THREE.BoxGeometry(.11, .13, .14), skM); hL.position.set(0, -.05, .46); armL.add(hL);
  const seg = (ax, ay, az, bx2, by, bz, w) => {
    const dd = new THREE.Vector3(bx2 - ax, by - ay, bz - az), len = dd.length();
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, len, w), cmM);
    m.position.set((ax + bx2) / 2, (ay + by) / 2, (az + bz) / 2);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dd.normalize());
    return m;
  };
  armR.add(seg(0, 0, 0, 0, -.22, .2, .15));
  armL.add(seg(0, 0, 0, 0, -.05, .46, .15));
  aim.add(armR, armL);
  g.add(hd, bx(.6, .7, .3, cmM, 0, 1.15, 0), bx(.34, .12, .34, dkM, 0, 1.84, 0), l1, l2, aim);
  g.rotation.order = 'YXZ';
  g.position.set(x, H(x, z), z);
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  const roleRoll = Math.random();
  const role = roleRoll < 0.5 ? 'assault' : (roleRoll < 0.85 ? 'flanker' : 'sniper');
  const prefMin = role === 'sniper' ? 18 : (role === 'flanker' ? 10 : 7);
  const prefMax = role === 'sniper' ? 34 : (role === 'flanker' ? 20 : 14);
  g.userData = {
    id, hp: 180, maxHp: 180, l1, l2, aim, armR, armL, gun, efl,
    ph: R() * 6, cd: 1 + R() * 2,
    hx: x, hz: z, dir: R() * 6.28, t: 0, stop: 0,
    dead: 0, fall: 0, roll: 0,
    aimX: 0, firing: 0, recoil: 0, aim0: 0,
    state: 'patrol', stateT: 0, prevState: 'patrol',
    lastSeen: -99, lastPx: x, lastPz: z, lastHeard: -99,
    burstLeft: 0, burstCd: 0, coverX: 0, coverZ: 0,
    role, prefMin, prefMax,
    aggression: 0.5 + Math.random() * 1.0,
    reactionTime: 0.35 + Math.random() * 0.35,
    seeStart: -99, lastAlert: -99, coverSince: -99,
    flankSide: Math.random() < 0.5 ? 1 : -1, aimYaw: 0,
    lastHit: -99, peekState: 'hidden', peekT: 0,
    lastCoverTry: -99, coverTryCd: 0,
    strafePhase: R() * 6.28, zigPhase: R() * 6.28,
    moveSpeed: 0, walkPhase: 0,
    dodgeT: 0, dodgeX: 0, dodgeZ: 0,
    lastPlayerX: x, lastPlayerZ: z, lastPlayerVX: 0, lastPlayerVZ: 0,
    burstT: 0, stayT: 0, burstDX: 0, burstDZ: 0,
    flankCount: 0, burstWasLong: false, burstMaxLen: 1,
    suppressT: 0, suppressCD: 0,
    deathLocalAng: 0,
    deathPose: null,
    group: group || null
  };
  sc.add(g); en.push(g);
  if (group) group.members.push(g);
  return id;
}

let sx = 0, sz = 125;
while (H(sx, sz) < 1.6) sz -= 2;
const camps = [];
for (let t = 0; camps.length < 5 && t < 800; t++) {
  const a = R() * 6.28, r = 25 + R() * 75;
  const x = Math.cos(a) * r, z = Math.sin(a) * r, h = H(x, z);
  if (h > 2 && h < 7 && Math.hypot(x - sx, z - sz) > 55 && camps.every(c => Math.hypot(c[0] - x, c[1] - z) > 40)) camps.push([x, z]);
}
camps.forEach(([cx, cz], campIdx) => {
  hut(cx, cz);
  const group = {
    id: campIdx, members: [], advancerIdx: 0, advancerTime: 0,
    panicUntil: 0, deadRecent: [], track: [], lastContact: -99
  };
  for (let i = 0; i < 3; i++) {
    const a = R() * 6.28;
    const x = cx + Math.cos(a) * (6 + R() * 4);
    const z = cz + Math.sin(a) * (6 + R() * 4);
    if (H(x, z) < .6) continue;
    if (blk(x, z, 0.6)) continue;
    let tooClose = false;
    for (const o of en) { if (Math.hypot(o.position.x - x, o.position.z - z) < 2.0) { tooClose = true; break; } }
    if (tooClose) continue;
    mkEn(x, z, group);
  }
  const c = new THREE.Mesh(BX, barkM); c.castShadow = true;
  c.position.set(cx + 4, H(cx + 4, cz) + .5, cz);
  sc.add(c); ob.push([cx + 4, cz, .8]); c.userData.solid = 1; solid.push(c);
});
Log.world('Лагерей: ' + camps.length + ', всего врагов: ' + en.length);
Log.world('Поз смерти в таблице: ' + DEATH_POSES.length);

const gn = new THREE.Group();
const fl = bx(.12, .12, .02, new THREE.MeshBasicMaterial({ color: 0xffd060 }), 0, .03, -.62);
fl.visible = false;
gn.add(bx(.07, .11, .5, dkM, 0, 0, 0), bx(.03, .03, .3, dkM, 0, .03, -.38), bx(.06, .1, .22, barkM, 0, -.02, .3), bx(.05, .18, .07, dkM, 0, -.13, -.05), bx(.1, .08, .14, skM, 0, -.09, .12), fl);
gn.position.set(.22, -.2, -.45);
cam.add(gn);
const flL = new THREE.PointLight(0xffcc66, 0, 14, 2);
flL.position.set(0, .03, -.65);
gn.add(flL);

const holeTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 32;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(16, 16, 1, 16, 16, 14);
  grd.addColorStop(0, 'rgba(5,3,2,1)'); grd.addColorStop(.4, 'rgba(30,20,14,.9)');
  grd.addColorStop(.75, 'rgba(60,45,30,.5)'); grd.addColorStop(1, 'rgba(60,45,30,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 32, 32);
  for (let i = 0; i < 12; i++) {
    const a = Math.random()*6.28, r = 5 + Math.random()*7;
    g.fillStyle = 'rgba(20,12,8,' + (0.5 + Math.random()*0.4) + ')';
    g.beginPath(); g.arc(16 + Math.cos(a)*r, 16 + Math.sin(a)*r, 1 + Math.random()*1.5, 0, 7); g.fill();
  }
  return new THREE.CanvasTexture(c);
})();
const crackTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 1, 32, 32, 30);
  grd.addColorStop(0, 'rgba(4,3,2,1)'); grd.addColorStop(.25, 'rgba(18,14,10,.9)');
  grd.addColorStop(.55, 'rgba(35,28,22,.45)'); grd.addColorStop(1, 'rgba(35,28,22,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  for (let i = 0; i < 7; i++) {
    const a = Math.random()*6.28;
    const segs = 3 + Math.floor(Math.random()*3);
    const segLen = (10 + Math.random()*14) / segs;
    g.strokeStyle = 'rgba(6,4,3,' + (0.55 + Math.random()*0.35) + ')';
    g.lineWidth = 0.7 + Math.random()*0.9; g.lineCap = 'round';
    g.beginPath(); let x = 32, y = 32; g.moveTo(x, y);
    for (let s = 0; s < segs; s++) {
      const aa = a + (Math.random()-.5)*.55;
      x += Math.cos(aa)*segLen; y += Math.sin(aa)*segLen;
      g.lineTo(x, y);
    }
    g.stroke();
  }
  for (let i = 0; i < 14; i++) {
    const a = Math.random()*6.28, r = 3 + Math.random()*4;
    g.fillStyle = 'rgba(15,10,7,' + (0.4 + Math.random()*0.4) + ')';
    g.beginPath(); g.arc(32 + Math.cos(a)*r, 32 + Math.sin(a)*r, 0.8 + Math.random()*1.2, 0, 7); g.fill();
  }
  return new THREE.CanvasTexture(c);
})();
const footTex = (() => {
  const c = document.createElement('canvas'); c.width = 80; c.height = 128;
  const g = c.getContext('2d'); g.clearRect(0, 0, 80, 128);
  const blob = (cx, cy, rx, ry, a) => {
    g.save(); g.translate(cx, cy); g.scale(1, ry / rx);
    const grd = g.createRadialGradient(0, 0, rx*0.05, 0, 0, rx);
    grd.addColorStop(0.00, 'rgba(5,3,1,' + a + ')');
    grd.addColorStop(0.45, 'rgba(14,9,4,' + (a*0.85) + ')');
    grd.addColorStop(0.78, 'rgba(22,15,8,' + (a*0.4) + ')');
    grd.addColorStop(1.00, 'rgba(22,15,8,0)');
    g.fillStyle = grd; g.beginPath(); g.arc(0, 0, rx, 0, 6.283); g.fill();
    g.restore();
  };
  blob(22,14,9.0,9.0,0.85); blob(33,9,6.5,6.5,0.78); blob(43,11,5.5,5.5,0.70);
  blob(52,15,4.5,4.5,0.60); blob(59,22,4.0,4.0,0.50);
  blob(40,44,20,15,0.95); blob(40,74,12,16,0.32); blob(40,108,17,17,0.95);
  const t = new THREE.CanvasTexture(c); t.anisotropy = 4;
  return t;
})();

const holeM = new THREE.MeshBasicMaterial({ map: holeTex, transparent: true, depthWrite: false, alphaTest: .05, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
const crackM = new THREE.MeshBasicMaterial({ map: crackTex, transparent: true, depthWrite: false, alphaTest: .05, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
const HPG = new THREE.PlaneGeometry(1, 1);
const decals = [];
for (let i = 0; i < 32; i++) { const m = new THREE.Mesh(HPG, holeM); m.visible = false; m.renderOrder = 2; sc.add(m); decals.push({ mesh: m, life: 0, owner: null }); }
let decNext = 0;
const cracks = [];
for (let i = 0; i < 16; i++) { const m = new THREE.Mesh(HPG, crackM); m.visible = false; m.renderOrder = 2; sc.add(m); cracks.push({ mesh: m, life: 0, owner: null }); }
let crNext = 0;

const _hn = new THREE.Vector3(), _hu = new THREE.Vector3();
function faceDecal(d, pt, nrm, scale, life, owner) {
  d.mesh.visible = true;
  d.mesh.scale.setScalar(scale);
  if (owner && owner.group) {
    if (d.mesh.parent !== owner.group) { if (d.mesh.parent) d.mesh.parent.remove(d.mesh); owner.group.add(d.mesh); }
    owner.group.updateMatrixWorld(true);
    const localPt = owner.group.worldToLocal(pt.clone());
    d.mesh.position.copy(localPt);
    d.mesh.up.set(0, 1, 0);
    const tgt = new THREE.Vector3(localPt.x + nrm.x, localPt.y + nrm.y, localPt.z + nrm.z);
    d.mesh.lookAt(tgt);
  } else {
    if (d.mesh.parent && d.mesh.parent !== sc) { d.mesh.parent.remove(d.mesh); sc.add(d.mesh); }
    d.mesh.position.copy(pt).addScaledVector(nrm, .04);
    _hn.copy(nrm).normalize();
    _hu.set(0, 1, 0); if (Math.abs(_hn.y) > .95) _hu.set(1, 0, 0);
    _hu.applyAxisAngle(_hn, Math.random()*6.28);
    d.mesh.up.copy(_hu);
    d.mesh.lookAt(pt.x + _hn.x, pt.y + _hn.y, pt.z + _hn.z);
  }
  d.life = life;
  d.owner = owner || null;
}
function addHole(pt, nrm, owner) { const d = decals[decNext]; decNext = (decNext+1)%decals.length; faceDecal(d, pt, nrm, .14 + Math.random()*.07, 8, owner); }
function addCrack(pt, nrm, owner) { const d = cracks[crNext]; crNext = (crNext+1)%cracks.length; faceDecal(d, pt, nrm, .3 + Math.random()*.15, 10, owner); }

const footGeo = new THREE.PlaneGeometry(0.18, 0.32); footGeo.rotateX(-Math.PI / 2);
const footprints = [];
for (let i = 0; i < 48; i++) {
  const m = new THREE.Mesh(footGeo, new THREE.MeshBasicMaterial({ map: footTex, transparent: true, opacity: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }));
  m.visible = false; m.renderOrder = 2; sc.add(m);
  footprints.push({ mesh: m, life: 0, lifeMax: 1, wet: false });
}
let footNext = 0;
function addFootprint(x, z, wet) {
  const d = footprints[footNext]; footNext = (footNext+1) % footprints.length;
  d.mesh.visible = true;
  d.mesh.position.set(x, H(x, z) + 0.02, z);
  d.mesh.rotation.set(0, yaw, 0);
  d.mesh.material.opacity = wet ? 0.85 : 0.42;
  d.wet = wet; d.life = wet ? 6 : 26; d.lifeMax = d.life;
}

function addFootSplash(x, z, intensity) {
  intensity = intensity || 0.5;
  const count = Math.floor(5 + intensity * 8);
  const upMin = 1.2 + intensity * 0.9;
  const upRange = 1.0 + intensity * 1.6;
  const spread = 0.3 + intensity * 0.7;
  const dropScale = 0.55 + intensity * 0.35;
  const lifeMax = 0.55 - intensity * 0.08;
  for (let i = 0; i < count; i++) {
    const s = splashes[spNext]; spNext = (spNext+1) % splashes.length;
    s.mesh.visible = true;
    s.mesh.position.set(x + (Math.random()-.5)*0.25, 0.03, z + (Math.random()-.5)*0.25);
    s.mesh.scale.setScalar(dropScale);
    const a = Math.random()*6.28, r = Math.random()*spread;
    s.v.set(Math.cos(a)*r, upMin + Math.random()*upRange, Math.sin(a)*r);
    s.life = lifeMax * (0.8 + Math.random()*0.4);
  }
  const r = ringPool[ringNext]; ringNext = (ringNext+1) % ringPool.length;
  r.mesh.visible = true;
  r.mesh.position.set(x, .02, z);
  r.mesh.scale.setScalar(0.08);
  r.maxScale = 0.35 + intensity * 0.9;
  const ringLife = 0.3 + intensity * 0.1;
  r.mesh.material.opacity = 0.55 + intensity * 0.15;
  r.life = ringLife; r.lifeMax = ringLife;
  if (intensity > 1.8) {
    const r2 = ringPool[ringNext]; ringNext = (ringNext+1) % ringPool.length;
    r2.mesh.visible = true;
    r2.mesh.position.set(x, .021, z);
    r2.mesh.scale.setScalar(0.08);
    r2.maxScale = 0.6 + intensity * 0.7;
    const rl2 = 0.45 + intensity * 0.08;
    r2.mesh.material.opacity = 0.6;
    r2.life = rl2; r2.lifeMax = rl2;
  }
}

const tracers = [];
for (let i = 0; i < 16; i++) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
  const m = new THREE.LineBasicMaterial({ color: 0xffe38a, transparent: true, opacity: .9 });
  const l = new THREE.Line(g, m); l.frustumCulled = false; l.visible = false; sc.add(l);
  tracers.push({ line: l, life: 0 });
}
let trNext = 0;
function addTracer(a, b) {
  const t = tracers[trNext]; trNext = (trNext+1) % tracers.length;
  const p = t.line.geometry.attributes.position.array;
  p[0]=a.x; p[1]=a.y; p[2]=a.z; p[3]=b.x; p[4]=b.y; p[5]=b.z;
  t.line.geometry.attributes.position.needsUpdate = true;
  t.line.visible = true; t.line.material.opacity = .9; t.life = .07;
}

const sparkGeo = new THREE.SphereGeometry(.045, 4, 3);
const sparks = [];
for (let i = 0; i < 80; i++) {
  const m = new THREE.Mesh(sparkGeo, new THREE.MeshBasicMaterial({ color: 0xffd070, transparent: true, opacity: 1 }));
  m.visible = false; sc.add(m);
  sparks.push({ mesh: m, v: new THREE.Vector3(), life: 0 });
}
let spkNext = 0;
function addSparks(pt, dir, count) {
  for (let i = 0; i < count; i++) {
    const s = sparks[spkNext]; spkNext = (spkNext+1) % sparks.length;
    s.mesh.visible = true;
    s.mesh.position.copy(pt);
    s.mesh.scale.setScalar(1);
    s.mesh.material.opacity = 1;
    const spread = .55;
    s.v.set(dir.x+(Math.random()-.5)*spread, dir.y+(Math.random()-.5)*spread+.35, dir.z+(Math.random()-.5)*spread);
    s.v.normalize().multiplyScalar(3.5 + Math.random()*4);
    s.life = .25 + Math.random()*.3;
  }
}

const dustGeo = new THREE.SphereGeometry(.12, 5, 4);
const dustPool = [];
for (let i = 0; i < 90; i++) {
  const m = new THREE.Mesh(dustGeo, new THREE.MeshBasicMaterial({ color: 0xc8b48a, transparent: true, opacity: .7, depthWrite: false }));
  m.visible = false; sc.add(m);
  dustPool.push({ mesh: m, v: new THREE.Vector3(), life: 0, lifeMax: 1 });
}
let dustNext = 0;
function addDust(pt, color, count, spread, up) {
  for (let i = 0; i < count; i++) {
    const p = dustPool[dustNext]; dustNext = (dustNext+1) % dustPool.length;
    p.mesh.material.color.setHex(color);
    p.mesh.material.opacity = .7;
    p.mesh.visible = true;
    p.mesh.position.copy(pt);
    p.mesh.scale.setScalar(1);
    const a = Math.random()*6.28, r = Math.random()*spread;
    p.v.set(Math.cos(a)*r, up*(.5 + Math.random()), Math.sin(a)*r);
    p.life = .7 + Math.random()*.5; p.lifeMax = p.life;
  }
}

const debrisGeo = new THREE.BoxGeometry(.055, .055, .055);
const debrisPool = [];
for (let i = 0; i < 130; i++) {
  const m = new THREE.Mesh(debrisGeo, new THREE.MeshLambertMaterial({ color: 0xffffff }));
  m.visible = false; sc.add(m);
  debrisPool.push({ mesh: m, v: new THREE.Vector3(), life: 0, lifeMax: 1, spin: new THREE.Vector3() });
}
let debrisNext = 0;
function addDebris(pt, colors, count, spread, speed) {
  for (let i = 0; i < count; i++) {
    const p = debrisPool[debrisNext]; debrisNext = (debrisNext+1) % debrisPool.length;
    p.mesh.material.color.setHex(colors[Math.floor(Math.random()*colors.length)]);
    p.mesh.visible = true;
    p.mesh.position.copy(pt);
    const a = Math.random()*6.28, r = Math.random()*spread;
    p.v.set(Math.cos(a)*r, speed*(.6 + Math.random()*.8), Math.sin(a)*r);
    p.spin.set((Math.random()-.5)*16, (Math.random()-.5)*16, (Math.random()-.5)*16);
    p.mesh.rotation.set(Math.random()*6, Math.random()*6, Math.random()*6);
    p.life = .8 + Math.random()*.5; p.lifeMax = p.life;
  }
}

const fiberGeo = new THREE.BoxGeometry(.02, .22, .02);
const fiberPool = [];
for (let i = 0; i < 100; i++) {
  const m = new THREE.Mesh(fiberGeo, new THREE.MeshLambertMaterial({ color: 0xd8c890 }));
  m.visible = false; sc.add(m);
  fiberPool.push({ mesh: m, v: new THREE.Vector3(), life: 0, spin: new THREE.Vector3() });
}
let fiberNext = 0;
function addFibers(pt, dir, count, color) {
  for (let i = 0; i < count; i++) {
    const p = fiberPool[fiberNext]; fiberNext = (fiberNext+1) % fiberPool.length;
    p.mesh.material.color.setHex(color || 0xd8c890);
    p.mesh.visible = true;
    p.mesh.position.copy(pt);
    p.mesh.rotation.set(Math.random()*6, Math.random()*6, Math.random()*6);
    const spread = 1.2;
    p.v.set(dir.x+(Math.random()-.5)*spread, dir.y+Math.random()*.8+.3, dir.z+(Math.random()-.5)*spread);
    p.v.normalize().multiplyScalar(3 + Math.random()*2.5);
    p.spin.set((Math.random()-.5)*18, (Math.random()-.5)*18, (Math.random()-.5)*18);
    p.life = .7 + Math.random()*.5;
  }
}

const sapGeo = new THREE.SphereGeometry(.04, 4, 3);
const sapPool = [];
for (let i = 0; i < 80; i++) {
  const m = new THREE.Mesh(sapGeo, new THREE.MeshBasicMaterial({ color: 0xaad040, transparent: true, opacity: .9 }));
  m.visible = false; sc.add(m);
  sapPool.push({ mesh: m, v: new THREE.Vector3(), life: 0 });
}
let sapNext = 0;
function addSap(pt, nrm, count) {
  for (let i = 0; i < count; i++) {
    const s = sapPool[sapNext]; sapNext = (sapNext+1) % sapPool.length;
    s.mesh.visible = true;
    s.mesh.position.copy(pt).addScaledVector(nrm, .05);
    s.mesh.material.opacity = .9;
    const spread = 1.0;
    s.v.set(nrm.x+(Math.random()-.5)*spread, nrm.y*.5+Math.random()*.8, nrm.z+(Math.random()-.5)*spread);
    s.v.normalize().multiplyScalar(1.5 + Math.random()*2.5);
    s.life = .6 + Math.random()*.5;
  }
}

function addLeafShreds(pt, dir, count) { addDebris(pt, [0x3a8a25,0x2f6a1a,0x4a9a30,0x5aaa40,0x6aba50], count, 1.2, 3.0); }
function addFruitSplash(pt, dir, color) { addDebris(pt, [color,0x5a3a18,0x3a2a10], 8, 1.5, 3); addDust(pt, 0xfff8e8, 5, 0.8, 1.5); addDust(pt, 0xffffff, 3, 1.2, 1.2); }

const fallingBits = [];
function detachLeaf(palm, leaf) {
  if (!leaf.attached) return;
  leaf.attached = false;
  const wp = new THREE.Vector3(); leaf.mesh.getWorldPosition(wp);
  const wq = new THREE.Quaternion(); leaf.mesh.getWorldQuaternion(wq);
  sc.attach(leaf.mesh);
  leaf.mesh.position.copy(wp);
  leaf.mesh.quaternion.copy(wq);
  fallingBits.push({
    mesh: leaf.mesh,
    v: new THREE.Vector3((R()-.5)*1.5, 1.2+R()*1.5, (R()-.5)*1.5),
    spin: new THREE.Vector3((R()-.5)*5, (R()-.5)*5, (R()-.5)*5),
    life: 8, isFruit: false, color: 0x3a8a25
  });
  const i = palm.leaves.indexOf(leaf); if (i >= 0) palm.leaves.splice(i, 1);
}
function detachFruit(palm, fruit) {
  if (!fruit.attached) return;
  fruit.attached = false;
  const wp = new THREE.Vector3(); fruit.mesh.getWorldPosition(wp);
  sc.attach(fruit.mesh);
  fruit.mesh.position.copy(wp);
  fallingBits.push({
    mesh: fruit.mesh,
    v: new THREE.Vector3((R()-.5)*2, 1, (R()-.5)*2),
    spin: new THREE.Vector3((R()-.5)*8, (R()-.5)*8, (R()-.5)*8),
    life: 8, isFruit: true, color: 0x5a3a18
  });
  const i = palm.fruits.indexOf(fruit); if (i >= 0) palm.fruits.splice(i, 1);
}
function startPalmFall(palm, dir) {
  palm.falling = true;
  palm.fallAngle = 0; palm.fallVel = 0; palm.prevAngle = 0;
  palm.fallDir = Math.atan2(-dir.x, -dir.z);
  const vl = Math.hypot(dir.x, dir.z) || 1;
  palm.fallDirVec.set(dir.x/vl, 0, dir.z/vl);
  palm.group.rotation.y = palm.fallDir;
  if (palm.obArr) {
    const idx = ob.indexOf(palm.obArr);
    if (idx >= 0) ob.splice(idx, 1);
    palm.obArr = null;
  }
  Log.inc('palFell');
  Log.info('Палма (' + palm.type + ') начинает падение, направление ' + (palm.fallDir*57.3).toFixed(1) + '°');
  snd('fall');
}
function palmPtWorld(palm, t) {
  const h = palm.trunkH || 0, lean = palm.trunkLean || 0;
  const lx = lean * t, ly = h * t;
  const ax = palm.group.rotation.x, ay = palm.group.rotation.y;
  const cx = Math.cos(ax), sx2 = Math.sin(ax);
  const cy = Math.cos(ay), sy2 = Math.sin(ay);
  const y1 = ly * cx, z1 = ly * sx2;
  return {
    x: palm.group.position.x + lx * cy + z1 * sy2,
    y: palm.group.position.y + y1,
    z: palm.group.position.z - lx * sy2 + z1 * cy
  };
}
function palmMinDiff(palm) {
  let minD = Infinity;
  for (const t of [0.15, 0.4, 0.7, 1.0]) {
    const p = palmPtWorld(palm, t);
    const d = p.y - H(p.x, p.z);
    if (d < minD) minD = d;
  }
  return minD;
}
function palmHitsRock(palm) {
  const tr = palm.type === 'adult' ? 0.35 : 0.25;
  for (const t of [0.3, 0.45, 0.6, 0.75, 0.9, 1.0]) {
    const wp = palmPtWorld(palm, t);
    for (const r of rocks) {
      const rx = r[0], rz2 = r[1], rad = r[2], ry = r[3], radY = r[4];
      const dx = wp.x - rx, dz = wp.z - rz2;
      const rxE = rad + tr, ryE = radY + tr;
      const dy = wp.y - ry;
      const nx = dx/rxE, ny = dy/ryE, nz = dz/rxE;
      if (nx*nx + ny*ny + nz*nz < 1) return { x: wp.x, y: wp.y, z: wp.z };
    }
  }
  return null;
}
function finalizePalmFall(palm) {
  palm.landed = true;
  const md = palmMinDiff(palm);
  if (md < 0.05) palm.group.position.y += (0.05 - md);
  const adult = palm.type === 'adult';
  const radius = adult ? 0.7 : 0.5;
  const spacing = adult ? 1.0 : 0.85;
  const N = Math.max(4, Math.ceil((palm.trunkH || 3) / spacing));
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const wp = palmPtWorld(palm, t);
    ob.push([wp.x, wp.z, radius]);
  }
  if (palm.crownGroup) {
    const tipWP = palmPtWorld(palm, 1.0);
    ob.push([tipWP.x, tipWP.z, adult ? 1.6 : 1.1]);
  }
  palm.group.updateMatrixWorld(true);
  for (const leaf of palm.leaves.slice()) {
    const wp = new THREE.Vector3(); leaf.mesh.getWorldPosition(wp);
    if (wp.y < H(wp.x, wp.z) + 0.15) detachLeaf(palm, leaf);
  }
  for (const fruit of palm.fruits.slice()) {
    const wp = new THREE.Vector3(); fruit.mesh.getWorldPosition(wp);
    if (wp.y < H(wp.x, wp.z) + 0.1) detachFruit(palm, fruit);
  }
  const gp = palm.group.position;
  addDust(new THREE.Vector3(gp.x, H(gp.x, gp.z) + 0.1, gp.z), 0x8a7a5a, 20, 3.5, 2.5);
  addDust(new THREE.Vector3(gp.x, H(gp.x, gp.z) + 0.1, gp.z), 0xc0a878, 12, 5, 1.8);
  Log.info('Палма (' + palm.type + ') упала на землю');
  snd('thud');
}
function breakPalmOnObstacle(palm, contact) {
  palm.landed = true;
  const bp = new THREE.Vector3(contact.x, contact.y, contact.z);
  addSap(bp, new THREE.Vector3(0,1,0), 10);
  addFibers(bp, new THREE.Vector3(palm.fallDirVec.x, 0.6, palm.fallDirVec.z), 14, 0xd8c890);
  addDebris(bp, [0x6a4a28,0x8a6a40,0xd8c890,0x9a8a60], 12, 1.6, 3.2);
  addDust(bp, 0x8a6a40, 10, 1.6, 2.6);
  addDust(bp, 0xc0a878, 6, 2.5, 1.6);
  Log.inc('palmBroke');
  Log.info('Палма (' + palm.type + ') сломалась об валун');
  snd('fall'); snd('thud');
  if (palm.crownGroup) {
    const wp = new THREE.Vector3(), wq = new THREE.Quaternion();
    palm.crownGroup.getWorldPosition(wp);
    palm.crownGroup.getWorldQuaternion(wq);
    sc.attach(palm.crownGroup);
    palm.crownGroup.position.copy(wp);
    palm.crownGroup.quaternion.copy(wq);
    const ddx = palm.fallDirVec.x, ddz = palm.fallDirVec.z;
    fallingBits.push({
      mesh: palm.crownGroup,
      v: new THREE.Vector3(ddx*2.5+(R()-.5)*1.5, 1.5+R()*1.5, ddz*2.5+(R()-.5)*1.5),
      spin: new THREE.Vector3((R()-.5)*3, (R()-.5)*3, (R()-.5)*3),
      life: 14, isFruit: false, color: 0x3a8a25, isBig: true
    });
    palm.crownGroup = null;
  }
  palm.group.updateMatrixWorld(true);
  for (const leaf of palm.leaves.slice()) {
    const wp = new THREE.Vector3(); leaf.mesh.getWorldPosition(wp);
    if (wp.y < H(wp.x, wp.z) + 0.15) detachLeaf(palm, leaf);
  }
  const adult = palm.type === 'adult';
  const radius = adult ? 0.55 : 0.4;
  const keepT = 0.65;
  const N = adult ? 8 : 5;
  for (let i = 0; i <= N; i++) {
    const t = (i / N) * keepT;
    const wp = palmPtWorld(palm, t);
    ob.push([wp.x, wp.z, radius]);
  }
  for (const d of decals) if (d.owner === palm) { d.life = 0.0001; d.mesh.visible = false; d.owner = null; }
  for (const d of cracks) if (d.owner === palm) { d.life = 0.0001; d.mesh.visible = false; d.owner = null; }
}
function smashYoungPalm(palm, dir) {
  for (const leaf of palm.leaves.slice()) detachLeaf(palm, leaf);
  const cx = palm.x, cz = palm.z, cy = H(cx, cz) + 0.15;
  addLeafShreds(new THREE.Vector3(cx, cy, cz), dir, 12);
  addSap(new THREE.Vector3(cx, cy, cz), new THREE.Vector3(0,1,0), 5);
  addDust(new THREE.Vector3(cx, cy, cz), 0x8a6a40, 6, 1.5, 2.0);
  addDust(new THREE.Vector3(cx, cy, cz), 0xaad880, 4, 1.8, 1.6);
  if (palm.obArr) { const idx = ob.indexOf(palm.obArr); if (idx >= 0) ob.splice(idx, 1); palm.obArr = null; }
  for (const d of decals) if (d.owner === palm) { d.life = 0.0001; d.mesh.visible = false; d.owner = null; }
  for (const d of cracks) if (d.owner === palm) { d.life = 0.0001; d.mesh.visible = false; d.owner = null; }
  sc.remove(palm.group);
  const idx = palms.indexOf(palm); if (idx >= 0) palms.splice(idx, 1);
  Log.info('Молодая палма разлетелась от попадания');
  snd('thud');
}
function hitPalm(palm, part, idx, point, normal, dir) {
  if (palm.falling) {
    addHole(point, normal, palm);
    addDust(point, 0xa88868, 3, 0.6, 1.2);
    addDebris(point, [0x6a4a28,0x8a6a40,0xd8c890], 3, 1.0, 2.0);
    if (part === 'trunk') addFibers(point, dir, 3, 0xd8c890);
    return;
  }
  switch (part) {
    case 'trunk': {
      const nearBase = (point.y - palm.baseY) < 1.2 && palm.trunkH > 2;
      palm.trunkHp -= 30;
      palm.leanDir = Math.atan2(-dir.x, -dir.z);
      addHole(point, normal, palm);
      addSap(point, normal, 5);
      addFibers(point, dir, 7, 0xd8c890);
      if (nearBase) {
        addDust(point, 0x8a6a40, 6, 1.5, 2.5);
        addDebris(point, [0x6a4a28,0x8a6a40], 4, 1.5, 2.5);
      }
      const ratio = 1 - palm.trunkHp / palm.maxTrunkHp;
      palm.leaning = Math.min(1, ratio * 1.1);
      const dmgRatio = Math.max(0, Math.min(1, 1 - palm.trunkHp / palm.maxTrunkHp));
      Log.info('Палма (' + palm.type + '): HP ' + Math.max(0, palm.trunkHp) + '/' + palm.maxTrunkHp + ' (урон ' + (dmgRatio*100).toFixed(0) + '%)');
      if (palm.trunkHp <= 0) {
        if (palm.type === 'young') smashYoungPalm(palm, dir);
        else startPalmFall(palm, dir);
      } else if (ratio > 0.5) addCrack(point, normal, palm);
      break;
    }
    case 'leaf': {
      const leaf = palm.leaves.find(l => l.idx === idx);
      if (!leaf || !leaf.attached) break;
      leaf.hp -= 35;
      addLeafShreds(point, dir, 8);
      addSap(point, normal, 3);
      if (leaf.hp <= 0) detachLeaf(palm, leaf);
      break;
    }
    case 'petiole': {
      const leaf = palm.leaves.find(l => l.idx === idx);
      if (!leaf || !leaf.attached) break;
      addSap(point, normal, 6);
      addFibers(point, dir, 5, 0xb8a878);
      detachLeaf(palm, leaf);
      break;
    }
    case 'crown': {
      palm.crownHp -= 25;
      addLeafShreds(point, dir, 10);
      addSap(point, normal, 6);
      if (palm.crownHp <= 0 && !palm.crownDead) palm.crownDead = true;
      break;
    }
    case 'fruit': {
      const fruit = palm.fruits.find(f => f.idx === idx);
      if (!fruit || !fruit.attached) break;
      addFruitSplash(point, dir, 0x5a3a18);
      detachFruit(palm, fruit);
      break;
    }
  }
}
function hitKelp(kelp, point, dir) {
  if (kelp.free) { addSplash(point); return; }
  kelp.free = true;
  kelp.velX = dir.x * 1.2;
  kelp.velZ = dir.z * 1.2;
  const green = [0x2d5a2a,0x3f6a34,0x4a8a3a,0x5aaa40,0x6aba50];
  addDebris(point, green, 12, 1.4, 3.2);
  addDust(point, 0x3a6a2a, 5, 1.0, 1.6);
  addSplash(point);
  snd('kelp');
}

const waterM = new THREE.MeshBasicMaterial({ color: 0xbfe8ff, transparent: true, opacity: .9 });
const DRPG = new THREE.SphereGeometry(.06, 5, 4);
const splashes = [];
for (let i = 0; i < 64; i++) { const m = new THREE.Mesh(DRPG, waterM.clone()); m.visible = false; sc.add(m); splashes.push({ mesh: m, v: new THREE.Vector3(), life: 0 }); }
let spNext = 0;
const ringPool = [];
const RG = new THREE.RingGeometry(.15, .25, 20); RG.rotateX(-Math.PI / 2);
for (let i = 0; i < 16; i++) {
  const m = new THREE.Mesh(RG, new THREE.MeshBasicMaterial({ color: 0xdff4ff, transparent: true, opacity: .85, depthWrite: false }));
  m.visible = false; sc.add(m);
  ringPool.push({ mesh: m, life: 0, lifeMax: .55, maxScale: 2.2 });
}
let ringNext = 0;
function addSplash(pt) {
  for (let i = 0; i < 10; i++) {
    const s = splashes[spNext]; spNext = (spNext+1) % splashes.length;
    s.mesh.visible = true;
    s.mesh.position.copy(pt);
    s.mesh.scale.setScalar(1);
    const a = Math.random()*6.28, r = Math.random()*1.5;
    s.v.set(Math.cos(a)*r, 2 + Math.random()*2.5, Math.sin(a)*r);
    s.life = .6 + Math.random()*.35;
  }
  const r = ringPool[ringNext]; ringNext = (ringNext+1) % ringPool.length;
  r.mesh.visible = true;
  r.mesh.position.set(pt.x, .02, pt.z);
  r.mesh.scale.setScalar(.1);
  r.maxScale = 2.2;
  r.mesh.material.opacity = .85;
  r.life = .55; r.lifeMax = .55;
}
function addSandHit(pt) { addDust(pt, 0x8a6a40, 10, 1.5, 3.2); addDust(pt, 0xc0a878, 8, 2.5, 2.2); addDebris(pt, [0x6a4a28,0x8a6a40,0x9a8a60], 7, 1.8, 2.8); }
function addGrassHit(pt) { addDebris(pt, [0x3a8a25,0x2f6a1a,0x4a9a30,0x5aaa40], 14, 2.0, 3.2); addDust(pt, 0x2a5a15, 4, 1.0, 2.0); addDust(pt, 0xb0a080, 7, 1.6, 1.8); }

function updatePalms(dt) {
  const windAng = Math.atan2(-wind.dirX, -wind.dirZ);
  const wK = wind.strength * 0.18;
  const swayAmpBase = 0.015 + wind.strength * 0.05;
  for (const palm of palms) {
    if (palm.falling) {
      if (!palm.landed) {
        palm.prevAngle = palm.fallAngle;
        palm.fallVel += 6 * dt;
        palm.fallVel = Math.min(palm.fallVel, 2.2);
        palm.fallAngle -= palm.fallVel * dt;
        if (palm.fallAngle < -Math.PI / 2) palm.fallAngle = -Math.PI / 2;
        palm.group.rotation.x = palm.fallAngle;
        palm.group.rotation.z = 0;
        const rockHit = palmHitsRock(palm);
        if (rockHit) {
          palm.fallAngle = palm.prevAngle;
          palm.group.rotation.x = palm.fallAngle;
          breakPalmOnObstacle(palm, rockHit);
          continue;
        }
        const md = palmMinDiff(palm);
        if (md < 0.05 || palm.fallAngle <= -Math.PI / 2) finalizePalmFall(palm);
      }
      continue;
    }
    const sways = palm.swayPhase || 0;
    let leanX = 0, leanZ = 0;
    if (palm.leaning > 0 && palm.leanDir !== undefined) {
      const phi = palm.group.rotation.y;
      const delta = phi - palm.leanDir;
      const k = palm.leaning * 0.18;
      leanX = -k * Math.cos(delta);
      leanZ = -k * Math.sin(delta);
    }
    const wDelta = palm.group.rotation.y - windAng;
    const windLeanX = -wK * Math.cos(wDelta);
    const windLeanZ = -wK * Math.sin(wDelta);
    const swayFreq = 1.1 + wind.strength * 0.9;
    const swayAmp = swayAmpBase;
    palm.group.rotation.x = leanX + windLeanX + Math.cos(T * swayFreq + sways) * swayAmp;
    palm.group.rotation.z = leanZ + windLeanZ + Math.sin(T * (swayFreq*1.15) + sways) * swayAmp * 1.3;
  }
  for (let i = fallingBits.length - 1; i >= 0; i--) {
    const b = fallingBits[i];
    b.v.y -= 18 * dt;
    b.mesh.position.addScaledVector(b.v, dt);
    b.mesh.rotation.x += b.spin.x * dt;
    b.mesh.rotation.y += b.spin.y * dt;
    b.mesh.rotation.z += b.spin.z * dt;
    const gy = H(b.mesh.position.x, b.mesh.position.z) + 0.05;
    if (b.mesh.position.y < gy) {
      b.mesh.position.y = gy;
      b.v.x *= .3; b.v.z *= .3;
      if (Math.abs(b.v.y) < 1.5) b.v.y = 0; else b.v.y *= -0.3;
      b.spin.multiplyScalar(.5);
      b.life -= dt * 3;
    } else b.life -= dt;
    if (b.life <= 0) { sc.remove(b.mesh); fallingBits.splice(i, 1); }
  }
}

function updateKelps(dt) {
  const wAmpMul = 1 + wind.strength * 0.9;
  for (const k of kelps) {
    if (k.free) {
      const targetY = -1.2;
      k.group.position.y += (targetY - k.group.position.y) * Math.min(1, dt * 1.1);
      const t = T * 0.2 + k.phase;
      k.group.position.x += (Math.sin(t)*0.15 + k.velX + wind.dirX*wind.strength*0.4) * dt;
      k.group.position.z += (Math.cos(t*1.4)*0.15 + k.velZ + wind.dirZ*wind.strength*0.4) * dt;
      k.velX *= 1 - dt * 0.9;
      k.velZ *= 1 - dt * 0.9;
      k.group.rotation.y += 0.18 * dt;
      k.group.rotation.z = Math.sin(T*1.6 + k.phase) * .35 * wAmpMul;
      k.group.rotation.x = Math.cos(T*1.0 + k.phase*1.3) * .25 * wAmpMul;
    } else {
      k.group.rotation.z = (Math.sin(T*1.1 + k.phase)*.13 + Math.sin(T*2.3 + k.phase*1.7)*.05) * wAmpMul;
      k.group.rotation.x = Math.cos(T*.85 + k.phase) * .09 * wAmpMul;
    }
  }
}

function updateFX(dt) {
  for (const d of decals) if (d.life > 0) { d.life -= dt; if (d.life <= 0) d.mesh.visible = false; }
  for (const d of cracks) if (d.life > 0) { d.life -= dt; if (d.life <= 0) d.mesh.visible = false; }
  for (const f of footprints) {
    if (f.life > 0) {
      f.life -= dt;
      if (f.life <= 0) { f.mesh.visible = false; continue; }
      const t = f.life / f.lifeMax;
      const base = f.wet ? 0.85 : 0.42;
      f.mesh.material.opacity = base * Math.min(1, t * 2);
    }
  }
  for (const t of tracers) {
    if (t.life > 0) {
      t.life -= dt;
      if (t.life <= 0) t.line.visible = false;
      else t.line.material.opacity = t.life / 0.07 * .9;
    }
  }
  for (const s of sparks) {
    if (s.life > 0) {
      s.life -= dt;
      if (s.life <= 0) { s.mesh.visible = false; continue; }
      s.v.y -= 22 * dt;
      s.mesh.position.addScaledVector(s.v, dt);
      const gy = H(s.mesh.position.x, s.mesh.position.z) + .02;
      if (s.mesh.position.y < gy) { s.mesh.position.y = gy; s.v.set(s.v.x*.3, -s.v.y*.25, s.v.z*.3); if (Math.abs(s.v.y) < 1) s.v.set(0,0,0); }
      s.mesh.scale.setScalar(Math.max(.1, s.life * 3));
      s.mesh.material.opacity = Math.min(1, s.life * 3);
    }
  }
  for (const p of dustPool) {
    if (p.life > 0) {
      p.life -= dt;
      if (p.life <= 0) { p.mesh.visible = false; continue; }
      p.v.y -= 6 * dt;
      p.v.multiplyScalar(1 - dt * 1.8);
      p.mesh.position.addScaledVector(p.v, dt);
      const f = p.life / p.lifeMax;
      p.mesh.scale.setScalar(1 + (1 - f) * 2.2);
      p.mesh.material.opacity = .7 * f;
    }
  }
  for (const p of debrisPool) {
    if (p.life > 0) {
      p.life -= dt;
      if (p.life <= 0) { p.mesh.visible = false; continue; }
      p.v.y -= 24 * dt;
      p.mesh.position.addScaledVector(p.v, dt);
      p.mesh.rotation.x += p.spin.x * dt;
      p.mesh.rotation.y += p.spin.y * dt;
      p.mesh.rotation.z += p.spin.z * dt;
      const gy = H(p.mesh.position.x, p.mesh.position.z) + .02;
      if (p.mesh.position.y < gy) {
        p.mesh.position.y = gy;
        p.v.x *= .4; p.v.z *= .4;
        if (Math.abs(p.v.y) < 1.5) p.v.y = 0; else p.v.y *= -.3;
        p.spin.multiplyScalar(.5);
      }
    }
  }
  for (const p of fiberPool) {
    if (p.life > 0) {
      p.life -= dt;
      if (p.life <= 0) { p.mesh.visible = false; continue; }
      p.v.y -= 22 * dt;
      p.mesh.position.addScaledVector(p.v, dt);
      p.mesh.rotation.x += p.spin.x * dt;
      p.mesh.rotation.y += p.spin.y * dt;
      p.mesh.rotation.z += p.spin.z * dt;
      const gy = H(p.mesh.position.x, p.mesh.position.z) + .02;
      if (p.mesh.position.y < gy) {
        p.mesh.position.y = gy;
        p.v.x *= .3; p.v.z *= .3;
        if (Math.abs(p.v.y) < 1.5) p.v.y = 0; else p.v.y *= -.3;
        p.spin.multiplyScalar(.5);
      }
    }
  }
  for (const s of sapPool) {
    if (s.life > 0) {
      s.life -= dt;
      if (s.life <= 0) { s.mesh.visible = false; continue; }
      s.v.y -= 20 * dt;
      s.mesh.position.addScaledVector(s.v, dt);
      const gy = H(s.mesh.position.x, s.mesh.position.z) + .02;
      if (s.mesh.position.y < gy) { s.mesh.position.y = gy; s.v.set(0,0,0); }
      s.mesh.material.opacity = .9 * Math.min(1, s.life * 2);
    }
  }
  for (const s of splashes) {
    if (s.life > 0) {
      s.life -= dt;
      if (s.life <= 0) { s.mesh.visible = false; continue; }
      s.v.y -= 14 * dt;
      s.mesh.position.addScaledVector(s.v, dt);
      if (s.mesh.position.y < .03) { s.mesh.position.y = .03; s.v.set(0,0,0); }
      s.mesh.scale.setScalar(Math.max(.15, s.life * 1.6));
    }
  }
  for (const r of ringPool) {
    if (r.life > 0) {
      r.life -= dt;
      if (r.life <= 0) { r.mesh.visible = false; continue; }
      const f = 1 - r.life / r.lifeMax;
      const targetScale = r.maxScale || 2.2;
      r.mesh.scale.setScalar(0.08 + f * targetScale);
      r.mesh.material.opacity = 0.85 * (1 - f);
    }
  }
}

let AC, NB, on = 0, over = 0;
const tn = (a, b, d, v, ty = 'sine') => {
  const t = AC.currentTime, o = AC.createOscillator(), g = AC.createGain();
  o.type = ty;
  o.frequency.setValueAtTime(a, t);
  o.frequency.exponentialRampToValueAtTime(b, t + d);
  g.gain.setValueAtTime(v, t);
  g.gain.exponentialRampToValueAtTime(.001, t + d);
  o.connect(g).connect(AC.destination);
  o.start(t); o.stop(t + d);
};
const ns = (fr, d, v, ty = 'lowpass') => {
  const t = AC.currentTime, s = AC.createBufferSource(), f = AC.createBiquadFilter(), g = AC.createGain();
  s.buffer = NB; f.type = ty; f.frequency.value = fr;
  g.gain.setValueAtTime(v, t);
  g.gain.exponentialRampToValueAtTime(.001, t + d);
  s.connect(f).connect(g).connect(AC.destination);
  s.start(t, Math.random()); s.stop(t + d);
};
const snd = (k, v = 1) => {
  if (!AC) return;
  ({
    g: () => { ns(3000, .22, .6); tn(140, 40, .18, .6); },
    e: () => { ns(1500, .25, .35 * v); tn(100, 40, .2, .3 * v); },
    s: () => ns(500, .09, .12),
    h: () => tn(120, 50, .25, .5, 'sawtooth'),
    m: () => tn(1400, 900, .08, .15),
    d: () => tn(300, 50, .5, .25, 'square'),
    r: () => { ns(4000, .05, .25, 'highpass'); setTimeout(() => ns(3000, .06, .3, 'highpass'), 700); setTimeout(() => ns(5000, .05, .3, 'highpass'), 1300); },
    w: () => { ns(2200, .35, .4, 'bandpass'); tn(400, 80, .3, .25); },
    ws: () => { ns(2600, .18, .38, 'bandpass'); tn(800, 250, .15, .22); },
    wsBig: () => { ns(3500, .55, .6, 'bandpass'); setTimeout(() => ns(1600, .35, .5, 'lowpass'), 40); tn(600, 120, .4, .35); setTimeout(() => tn(400, 90, .35, .3), 80); },
    i: () => { ns(900, .08, .35, 'bandpass'); tn(2000, 600, .05, .15); },
    k: () => { tn(2800, 1400, .22, .25, 'triangle'); setTimeout(() => tn(2000, 800, .15, .18, 'triangle'), 60); ns(5000, .08, .2, 'highpass'); },
    n: () => { ns(1800, .14, .45, 'bandpass'); tn(1400, 500, .06, .15); },
    kelp: () => { ns(1600, .18, .32, 'bandpass'); tn(600, 180, .16, .22); },
    sand: () => { ns(900, .18, .4, 'lowpass'); tn(180, 70, .14, .25); },
    grass: () => { ns(3400, .12, .22, 'highpass'); ns(1600, .14, .18, 'bandpass'); },
    fall: () => { ns(400, .5, .32, 'lowpass'); tn(180, 60, .4, .32, 'sawtooth'); tn(120, 40, .55, .28); },
    thud: () => { ns(130, .35, .5, 'lowpass'); tn(80, 30, .4, .42); },
    wind: () => ns(400, .6, .2, 'lowpass')
  })[k]();
};
function ini() {
  if (AC) return;
  AC = new (window.AudioContext || window.webkitAudioContext)();
  NB = AC.createBuffer(1, AC.sampleRate * 2, AC.sampleRate);
  const d = NB.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const s = AC.createBufferSource(), f = AC.createBiquadFilter(), g = AC.createGain(), o = AC.createOscillator(), og = AC.createGain();
  s.buffer = NB; s.loop = true;
  f.type = 'lowpass'; f.frequency.value = 420;
  g.gain.value = .12;
  o.frequency.value = .12; og.gain.value = .08;
  o.connect(og).connect(g.gain);
  s.connect(f).connect(g).connect(AC.destination);
  s.start(); o.start();
  setInterval(() => {
    if (on && !over && Math.random() < .6) {
      const q = 2200 + Math.random() * 1500;
      tn(q, q * 1.5, .12, .04);
      setTimeout(() => tn(q * 1.1, q * 1.7, .1, .04), 160);
    }
  }, 3500);
}

let px = sx, pz = sz, py = H(sx, sz) + 1.7;
let vy = 0, yaw = 0, pitch = 0;
let hp = 100, mag = 30, res = 120, kills = 0, lastHit = -9;
let rl = 0, fcd = 0, rec = 0, ph = 0, stp = 0, fire = 0, dm = 0, T = 0;
let playerWet = 0, footSide = 1;
let prevPx = px, prevPz = pz, playerVelX = 0, playerVelZ = 0;
let stepSoundTimer = 0;
let wasInWater = false, wasInAir = false;
let spacePrevFrame = false;

const K = {};
const rc = new THREE.Raycaster();
const v0 = new THREE.Vector2(0, 0);
rc.far = 120;
const _nm = new THREE.Matrix3();
const _mzlV = new THREE.Vector3();

function raycastHit() {
  const hs = rc.intersectObjects(sc.children, true);
  let hit = null;
  for (const h of hs) {
    let o = h.object;
    while (o) {
      if (o.userData.l1) {
        if (!o.userData.dead) hit = { kind: 'enemy', enemy: o, head: !!h.object.userData.head, dist: h.distance };
        break;
      }
      if (o.userData.solid) {
        const kelpRef = h.object.userData.kelp;
        if (kelpRef) { hit = { kind: 'world', point: h.point.clone(), normal: new THREE.Vector3(0,1,0), dist: h.distance, surface: 'kelp', kelp: kelpRef }; break; }
        _nm.getNormalMatrix(h.object.matrixWorld);
        const n = h.face ? h.face.normal.clone().applyMatrix3(_nm).normalize() : new THREE.Vector3(0,1,0);
        const palmRef = h.object.userData.palm;
        const palmPart = h.object.userData.palmPart;
        const palmIndex = h.object.userData.palmIndex;
        let surface;
        if (palmRef) surface = 'palm';
        else if (o.userData.rock) surface = 'rock';
        else if (o === groundMesh) { const hh = H(h.point.x, h.point.z); surface = hh < 0.9 ? 'sand' : hh < 7 ? 'grass' : 'rock'; }
        else surface = 'wood';
        hit = { kind: 'world', point: h.point.clone(), normal: n, dist: h.distance, surface, palm: palmRef, palmPart, palmIndex };
        break;
      }
      o = o.parent;
    }
    if (hit) break;
  }
  const org = rc.ray.origin, dir = rc.ray.direction;
  if (dir.y < -1e-4) {
    const t = -org.y / dir.y;
    if (t > 0) {
      const wx = org.x + dir.x * t, wz = org.z + dir.z * t;
      if (H(wx, wz) < 0 && (!hit || t < hit.dist)) return { kind: 'water', point: new THREE.Vector3(wx, 0, wz), dist: t };
    }
  }
  return hit;
}
function hurt(n) {
  hp -= n; lastHit = T; dm = 1; snd('h');
  Log.damage('Игрок получил ' + n.toFixed(1) + ' урона. HP: ' + Math.max(0, hp).toFixed(0) + '/100');
  Log.add('damageTaken', n);
  if (hp <= 0) {
    hp = 0;
    Log.summary('Игрок убит');
    Log.save('death');
    end('ВЫ ПОГИБЛИ');
  }
}
function end(t) {
  over = 1;
  document.exitPointerLock && document.exitPointerLock();
  $('ti').textContent = t;
  $('msg').innerHTML = 'Нажмите, чтобы сыграть заново';
  $('ov').style.display = 'flex';
}
function reload() { if (rl > 0 || mag >= 30 || res <= 0) return; rl = 1.4; snd('r'); Log.info('Перезарядка (запас ' + res + ')'); }

function shootRay(mzl, org, dir, depth) {
  rc.set(org, dir);
  const h = raycastHit();
  let endPt;
  if (!h) endPt = org.clone().addScaledVector(dir, 120);
  else if (h.kind === 'enemy') endPt = h.enemy.position.clone().setY(h.enemy.position.y + 1.4);
  else endPt = h.point.clone();
  addTracer(mzl, endPt);
  if (!h) return;
  if (h.kind === 'enemy') {
    const u = h.enemy.userData;
    const dmgDealt = h.head ? 999 : 32;
    u.hp -= dmgDealt;
    u.lastSeen = T; u.lastPx = px; u.lastPz = pz;
    const wasFullHit = !h.head;
    u.lastHit = T;
    Log.hit('Враг #' + u.id + ' (' + u.role + '): ' + (h.head ? 'HEADSHOT' : 'тело') + ', урон ' + dmgDealt + ', hp ' + Math.max(0, u.hp).toFixed(0) + '/' + u.maxHp);
    Log.inc(h.head ? 'headshots' : 'hits');
    Log.add('damageDealt', dmgDealt);
    if (wasFullHit && u.hp > 0) {
      const sgn = Math.random() < 0.5 ? 1 : -1;
      const perpAng = Math.atan2(px - h.enemy.position.x, pz - h.enemy.position.z) + Math.PI / 2 * sgn;
      u.dodgeT = 0.35; u.dodgeX = Math.sin(perpAng); u.dodgeZ = Math.cos(perpAng);
    }
    if (u.state === 'patrol') u.state = 'search';
    snd('m');
    $('cx').style.borderColor = '#f44';
    setTimeout(() => $('cx').style.borderColor = '', 120);
    if (u.hp > 0 && u.hp <= u.maxHp * 0.6 && T - u.lastAlert > 1.5) {
      u.lastAlert = T; alertOthers(h.enemy, 30);
    }
    if (u.hp <= 0 && !u.dead) {
      u.dead = 1; kills++; res += 15; snd('d');
      u.aim0 = u.aim.rotation.x;
      u.roll = (R() - .5) * .9;
      u.fall = 0;
      u.efl.visible = false;
      u.firing = 0;
      {
        const epos = h.enemy.position;
        const hitFromAng = Math.atan2(px - epos.x, pz - epos.z);
        u.deathLocalAng = Math.atan2(Math.sin(hitFromAng - h.enemy.rotation.y), Math.cos(hitFromAng - h.enemy.rotation.y));
        u.deathPose = pickDeathPose(u.deathLocalAng);
      }
      Log.death('Враг #' + u.id + ' (' + u.role + ') убит. Поза: ' + (u.deathPose ? u.deathPose.pool + (u.deathPose.side ? '/' + u.deathPose.side : '') : '?') + '. Всего ' + kills + '/' + en.length);
      alertOthers(h.enemy, 40);
      if (u.group) {
        u.group.deadRecent.push(T);
        u.group.deadRecent = u.group.deadRecent.filter(t => T - t < 10);
        if (u.group.deadRecent.length >= 2) {
          u.group.panicUntil = T + 6;
          Log.ai('Группа #' + u.group.id + ' в панике: убито ' + u.group.deadRecent.length + ' за 10 сек');
        }
      }
      const ep = h.enemy.position;
      const ang = Math.atan2(ep.x - px, ep.z - pz);
      sc.attach(u.gun);
      u.gunDead = u.gun;
      u.gunDead.userData.settled = 0;
      u.gunV = new THREE.Vector3(
        Math.sin(ang)*1.6 + (R()-.5)*2.2,
        2.6 + R()*1.6,
        Math.cos(ang)*1.6 + (R()-.5)*2.2
      );
      if (kills >= en.length) {
        Log.summary('Все враги уничтожены');
        Log.save('win');
        end('ОСТРОВ ЗАЧИЩЕН!');
      }
    }
    return;
  }
  if (h.kind === 'water') { addSplash(h.point); snd('w'); return; }
  if (h.kind === 'world') {
    if (h.surface === 'kelp') { hitKelp(h.kelp, h.point, dir); return; }
    if (h.palm) { hitPalm(h.palm, h.palmPart, h.palmIndex, h.point, h.normal, dir); return; }
    if (h.surface === 'rock') {
      addDebris(h.point, [0x9a9890,0x7a7870,0xb0a8a0,0x6a6860], 6, 1.2, 3);
      const dot = dir.dot(h.normal);
      const cosFromNormal = -dot;
      const ricoChance = Math.max(0, .9 - cosFromNormal * 1.9);
      if (Math.random() < ricoChance && depth < 2) {
        Log.inc('ricochets');
        const refl = dir.clone().sub(h.normal.clone().multiplyScalar(2 * dot)).normalize();
        refl.x += (Math.random()-.5)*.12; refl.y += (Math.random()-.5)*.12; refl.z += (Math.random()-.5)*.12;
        refl.normalize();
        addSparks(h.point, refl, 6 + Math.floor(Math.random()*4));
        snd('k');
        const newOrg = h.point.clone().addScaledVector(h.normal, .06);
        shootRay(h.point.clone(), newOrg, refl, depth + 1);
        return;
      }
      addSparks(h.point, h.normal, 3);
      addCrack(h.point, h.normal);
      snd('n');
      return;
    }
    if (h.surface === 'sand') { addSandHit(h.point); addHole(h.point, h.normal); snd('sand'); return; }
    if (h.surface === 'grass') { addGrassHit(h.point); addHole(h.point, h.normal); snd('grass'); return; }
    addHole(h.point, h.normal);
    snd('i');
  }
}
function shoot() {
  if (mag <= 0) { reload(); return; }
  mag--; fcd = .11; rec = 1;
  pitch = Math.min(1.4, pitch + .01);
  snd('g');
  fl.visible = true; fl.t = .05;
  flL.intensity = 7;
  Log.shot('Выстрел. Патронов ' + mag + '/' + res);
  hearPlayerShot();
  cam.position.set(px, py, pz);
  cam.rotation.set(pitch, yaw, 0);
  cam.updateMatrixWorld();
  rc.setFromCamera(v0, cam);
  const org = rc.ray.origin.clone(), dir = rc.ray.direction.clone();
  _mzlV.set(.22, -.17, -.65);
  cam.localToWorld(_mzlV);
  shootRay(_mzlV.clone(), org, dir, 0);
}

function pl(dt) {
  // клавиатура + сенсорные стики
  const f = (K.KeyW ? 1 : 0) - (K.KeyS ? 1 : 0) - touchInput.moveY;
  const r = (K.KeyD ? 1 : 0) - (K.KeyA ? 1 : 0) + touchInput.moveX;
  const running = K.ShiftLeft || K.ShiftRight;
  const sp = (running ? 8.5 : 5) * dt;

  yaw += ((K.ArrowLeft ? 1 : 0) - (K.ArrowRight ? 1 : 0)) * 2 * dt;
  pitch = Math.max(-1.4, Math.min(1.4, pitch + ((K.ArrowUp ? 1 : 0) - (K.ArrowDown ? 1 : 0)) * 1.5 * dt));
  // сенсорный обзор
  yaw -= touchInput.lookX * 2.5 * dt;
  pitch = Math.max(-1.4, Math.min(1.4, pitch - touchInput.lookY * 1.8 * dt));

  const dx = -Math.sin(yaw) * f + Math.cos(yaw) * r;
  const dz = -Math.cos(yaw) * f - Math.sin(yaw) * r;
  const l = Math.hypot(dx, dz);
  const terrainHere = H(px, pz);
  if (terrainHere < 0) playerWet = 1;
  else playerWet = Math.max(0, playerWet - dt * 0.22);
  if (l > 0.05) {
    let nx = px + dx / l * sp;
    let nz = pz + dz / l * sp;
    for (const o of ob) {
      const ex = nx - o[0], ez = nz - o[1];
      const d = Math.hypot(ex, ez), m = o[2] + .4;
      if (d < m && d > 0) { nx = o[0] + ex / d * m; nz = o[1] + ez / d * m; }
    }
    if (H(nx, nz) > -.7) { px = nx; pz = nz; }
    ph += sp * 1.5;
    stp -= sp;
    if (stp <= 0 && py <= H(px, pz) + 1.75) {
      const inWater = H(px, pz) < 0;
      if (inWater) {
        stp = running ? 1.5 : 2.0;
        addFootSplash(px, pz, running ? 1.0 : 0.55);
        snd('ws');
      } else {
        stp = running ? 2.6 : 2;
        snd('s');
        if (H(px, pz) < 0.9) {
          footSide *= -1;
          const fx = px + Math.cos(yaw) * 0.18 * footSide;
          const fz = pz - Math.sin(yaw) * 0.18 * footSide;
          addFootprint(fx, fz, playerWet > 0.3);
        }
      }
      hearPlayerSteps();
    }
  }
  const gy = H(px, pz) + 1.7;
  if (K.Space && py <= gy + .02) {
    if (!spacePrevFrame) Log.info('Игрок прыгнул');
    vy = 7;
  }
  spacePrevFrame = !!K.Space;
  vy -= 22 * dt;
  py += vy * dt;
  if (py < gy) { py = gy; vy = 0; }
  const inWaterNow = H(px, pz) < 0;
  const headHeight = py - H(px, pz);
  const inAirNow = headHeight > 1.85;
  if (inWaterNow && !wasInWater && !inAirNow) {
    addFootSplash(px, pz, 0.8); snd('ws'); Log.info('Игрок вошёл в воду');
  }
  if (inWaterNow && !wasInAir && inAirNow && wasInWater) {
    addFootSplash(px, pz, 1.4); snd('ws'); Log.info('Игрок прыгнул из воды');
  }
  if (inWaterNow && wasInAir && !inAirNow) {
    addFootSplash(px, pz, 2.5); snd('wsBig');
    dm = Math.max(dm, 0.15);
    Log.info('Игрок приземлился в воду (большой плеск)');
  }
  wasInWater = inWaterNow;
  wasInAir = inAirNow;
  if (rl > 0) { rl -= dt; if (rl <= 0) { const n = Math.min(30 - mag, res); mag += n; res -= n; } }
  fcd -= dt;
  if (fire && fcd <= 0 && rl <= 0) shoot();
  if (fl.visible && (fl.t -= dt) <= 0) fl.visible = false;
  if (T - lastHit > 6 && hp < 100) hp = Math.min(100, hp + 8 * dt);
  rec *= Math.pow(.0005, dt);
  const mv = l > 0.05 ? 1 : 0;
  const rp = rl > 0 ? Math.sin(Math.PI * (1 - rl / 1.4)) : 0;
  gn.position.set(.22 + Math.cos(ph*.5)*.01*mv, -.2 + Math.abs(Math.sin(ph))*.012*mv - rp*.1, -.45 + rec*.07);
  gn.rotation.set(rec*.07 - rp*.8, 0, rp*.4);
  cam.position.set(px, py + Math.sin(ph)*.035*mv, pz);
  cam.rotation.set(pitch, yaw, 0);
  sky.position.copy(cam.position);
  cam.updateMatrixWorld();
}

function up(e, dt) {
  const u = e.userData;
  const p = e.position;
  const dx = px - p.x, dz = pz - p.z;
  const d = Math.hypot(dx, dz);
  const dy = py - (p.y + 1.45);
  if (u.firing > 0) { u.firing -= dt; if (u.firing <= 0) u.efl.visible = false; }
  u.recoil = Math.max(0, u.recoil - dt * 4);

  if (u.dead) {
    u.fall = Math.min(1.7, u.fall + dt * 1.4);
    const f = Math.min(1, u.fall), ease = f * f * (3 - 2 * f);
    const yw = e.rotation.y;
    const hx = p.x - Math.sin(yw) * 1.6;
    const hz = p.z - Math.cos(yw) * 1.6;
    const feetY = H(p.x, p.z);
    const headY = H(hx, hz);
    const slope = Math.max(-0.55, Math.min(0.55, Math.atan2(headY - feetY, 1.6)));
    const pose = u.deathPose || DEATH_POSES[0];
    p.y = feetY + .02;
    e.rotation.x = pose.rx * ease;
    e.rotation.z = pose.rz * ease;
    if (f > 1) {
      const b = Math.sin((f - 1) * 10) * .03 * Math.max(0, 1 - (f - 1) / .7);
      e.rotation.x += -b * 1.55 * Math.sign(pose.rx || 1);
    } else if (slope !== 0 && pose.rx !== 0) {
      e.rotation.x += slope * ease * (pose.rx > 0 ? -1 : 1) * 0.5;
    }
    u.aim.rotation.x = u.aim0 * (1 - ease);
    u.aim.rotation.y = 0; u.aim.rotation.z = 0;
    u.armR.rotation.set(pose.armRX * ease, pose.armRY * ease, pose.armRZ * ease);
    u.armL.rotation.set(pose.armLX * ease, pose.armLY * ease, pose.armLZ * ease);
    u.l1.rotation.x = pose.legLX * ease;
    u.l2.rotation.x = pose.legRX * ease;
    u.l1.rotation.z = pose.legSpread * ease;
    u.l2.rotation.z = -pose.legSpread * ease;
    if (ease > 0.15) {
      const lift = fixCorpseGround(e);
      if (lift > 0) e.position.y += lift;
    }
    if (u.gunDead && !u.gunDead.userData.settled) {
      u.gunV.y -= 26 * dt;
      u.gunDead.position.x += u.gunV.x * dt;
      u.gunDead.position.y += u.gunV.y * dt;
      u.gunDead.position.z += u.gunV.z * dt;
      u.gunDead.rotation.x += dt * 2.6;
      u.gunDead.rotation.y += dt * 1.3;
      const gy2 = H(u.gunDead.position.x, u.gunDead.position.z) + .1;
      if (u.gunDead.position.y <= gy2) {
        u.gunDead.position.y = gy2;
        if (u.gunV.y < -.8) { u.gunV.y *= -.25; u.gunV.x *= .4; u.gunV.z *= .4; u.gunDead.rotation.x += .4; }
        else { u.gunV.set(0, 0, 0); u.gunDead.userData.settled = 1; u.gunDead.rotation.set(0, u.gunDead.rotation.y, Math.PI / 2); }
      }
    }
    return;
  }

  const seesP = d < 45 && los(p.x, p.y + 1.5, p.z);
  if (seesP) {
    if (T - u.lastSeen > 0.8) u.seeStart = T;
    u.lastSeen = T; u.lastPx = px; u.lastPz = pz;
    if (T - u.lastAlert > 0.7) { u.lastAlert = T; alertOthers(e, 35); }
    if (u.group) {
      u.group.track.push({ x: px, z: pz, t: T });
      if (u.group.track.length > 5) u.group.track.shift();
      u.group.lastContact = T;
    }
  }
  const canReact = T - u.seeStart >= u.reactionTime;
  if (u.dodgeT > 0) { u.dodgeT -= dt; tryMoveAI(p, u.dodgeX, u.dodgeZ, 4.5 * dt, e); }
  const pvx = (px - u.lastPlayerX) / Math.max(0.001, dt);
  const pvz = (pz - u.lastPlayerZ) / Math.max(0.001, dt);
  u.lastPlayerVX = u.lastPlayerVX * 0.75 + pvx * 0.25;
  u.lastPlayerVZ = u.lastPlayerVZ * 0.75 + pvz * 0.25;
  u.lastPlayerX = px; u.lastPlayerZ = pz;
  const yawToEnemy = Math.atan2(p.x - px, p.z - pz);
  const aimDelta = Math.abs(Math.atan2(Math.sin(yawToEnemy - yaw), Math.cos(yawToEnemy - yaw)));
  const playerAimingAtMe = aimDelta < 0.35 && d < 25;
  const group = u.group;
  const panicking = group && group.panicUntil > T;

  if (panicking && u.state !== 'flee') {
    const awayAng = Math.atan2(p.x - px, p.z - pz);
    u.state = 'flee'; u.stateT = 3.5;
    u.coverX = p.x + Math.sin(awayAng) * 18;
    u.coverZ = p.z + Math.cos(awayAng) * 18;
    u.aimX *= .9; u.aim.rotation.x = -u.aimX;
    const tSpd = 5.2;
    u.moveSpeed += (tSpd - u.moveSpeed) * Math.min(1, dt * 5);
    const cdx = u.coverX - p.x, cdz = u.coverZ - p.z, cd = Math.hypot(cdx, cdz);
    if (cd > 2) {
      const ty = Math.atan2(cdx, cdz);
      const dyaw = Math.atan2(Math.sin(ty - e.rotation.y), Math.cos(ty - e.rotation.y));
      e.rotation.y += Math.max(-3.8*dt, Math.min(3.8*dt, dyaw));
      tryMoveAI(p, Math.sin(e.rotation.y), Math.cos(e.rotation.y), u.moveSpeed * dt, e);
    }
    p.y = H(p.x, p.z);
    u.ph += dt * 3;
    const w = Math.sin(u.ph) * .7;
    u.l1.rotation.x = w; u.l2.rotation.x = -w;
    return;
  }
  if (T - u.lastHit < 0.9 && u.state !== 'cover' && u.state !== 'flee' && u.hp > 0) {
    const cov = findCover(p.x, p.z, px, pz, e);
    if (cov) {
      u.state = 'cover'; u.coverX = cov.x; u.coverZ = cov.z;
      u.stateT = 4 + R() * 2; u.coverSince = T;
      u.peekState = 'hidden'; u.peekT = 0.4 + R() * 0.4;
      Log.ai('Враг #' + u.id + ' после урона → cover');
    } else {
      const awayAng = Math.atan2(p.x - px, p.z - pz);
      u.state = 'flee'; u.stateT = 1.5;
      u.coverX = p.x + Math.sin(awayAng) * 12;
      u.coverZ = p.z + Math.cos(awayAng) * 12;
      Log.ai('Враг #' + u.id + ' после урона → flee (нет укрытия)');
    }
  }
  if (seesP) {
    if (u.state === 'patrol' || u.state === 'search') { u.state = 'engage'; Log.ai('Враг #' + u.id + ' → engage'); }
    if (u.hp < u.maxHp * 0.4 && u.state === 'engage' && R() < .012) {
      const cov = findCover(p.x, p.z, px, pz, e);
      if (cov) {
        u.state = 'cover'; u.coverX = cov.x; u.coverZ = cov.z;
        u.stateT = 5; u.coverSince = T;
        u.peekState = 'hidden'; u.peekT = 0.5;
        Log.ai('Враг #' + u.id + ' ранен, ищет укрытие');
      } else {
        u.state = 'flee'; u.stateT = 2.2;
        const a = Math.atan2(-dx, -dz);
        u.coverX = p.x + Math.sin(a) * 18;
        u.coverZ = p.z + Math.cos(a) * 18;
        Log.ai('Враг #' + u.id + ' ранен, отступает');
      }
    }
  } else {
    const sinceSeen = T - u.lastSeen;
    const sinceHeard = T - u.lastHeard;
    if (sinceSeen > 5 && sinceHeard > 5 && u.state !== 'patrol') {
      u.state = 'patrol'; Log.ai('Враг #' + u.id + ' → patrol');
    } else if (sinceSeen > 1 && sinceHeard > 5 && u.state === 'engage') {
      u.state = 'search'; Log.ai('Враг #' + u.id + ' → search (потерял игрока)');
    }
  }
  let mvDir = 0, targetYaw = e.rotation.y, wantToShoot = false;
  if (u.state === 'patrol') {
    u.t -= dt;
    if (u.t < 0) {
      u.t = 2 + R() * 3;
      u.dir = Math.hypot(u.hx - p.x, u.hz - p.z) > 9 ? Math.atan2(u.hx - p.x, u.hz - p.z) : R() * 6.28;
      u.stop = R() < .3;
    }
    targetYaw = u.dir;
    if (!u.stop) mvDir = 1;
    u.aimX *= .92; u.aim.rotation.x = -u.aimX;
  } else if (u.state === 'search') {
    const ldx = u.lastPx - p.x, ldz = u.lastPz - p.z, ld = Math.hypot(ldx, ldz);
    if (ld > 2) { targetYaw = Math.atan2(ldx, ldz); mvDir = 1; }
    else u.state = 'patrol';
    u.aimX *= .9; u.aim.rotation.x = -u.aimX;
  } else if (u.state === 'engage') {
    const alive = group ? group.members.filter(m => !m.userData.dead) : [e];
    const myIdx = alive.indexOf(e);
    let iAmAdvancer = false;
    if (group && alive.length >= 2) {
      if (T - group.advancerTime > 2.0) {
        group.advancerTime = T;
        group.advancerIdx = (group.advancerIdx + 1) % alive.length;
      }
      iAmAdvancer = (myIdx === group.advancerIdx);
    }
    targetYaw = Math.atan2(dx, dz);
    const tof = d / 90;
    const leadX = px + u.lastPlayerVX * tof * u.aggression * 0.6;
    const leadZ = pz + u.lastPlayerVZ * tof * u.aggression * 0.6;
    const yawToAim = Math.atan2(leadX - p.x, leadZ - p.z);
    const relYaw = Math.atan2(Math.sin(yawToAim - e.rotation.y), Math.cos(yawToAim - e.rotation.y));
    const targetAimYaw = Math.max(-0.5, Math.min(0.5, relYaw));
    u.aimYaw += (targetAimYaw - u.aimYaw) * Math.min(1, dt * 6);
    u.aim.rotation.y = u.aimYaw;
    const aimY = Math.atan2(dy, Math.max(1, d));
    u.aimX += (Math.max(-.8, Math.min(.8, aimY)) - u.aimX) * Math.min(1, dt * 6);
    u.aim.rotation.x = -u.aimX - u.recoil * .09;
    wantToShoot = true;
    if (u.role === 'flanker' && u.flankCount >= 2) u.role = 'assault';
    if (u.burstT > 0) {
      u.burstT -= dt;
      tryMoveAI(p, u.burstDX, u.burstDZ, u.moveSpeed * dt, e);
    } else if (u.stayT > 0) {
      u.stayT -= dt;
    } else {
      const rnd = Math.random();
      if (group && alive.length >= 2) {
        if (iAmAdvancer) {
          if (d > u.prefMax) { u.burstDX = Math.sin(e.rotation.y); u.burstDZ = Math.cos(e.rotation.y); }
          else if (d < u.prefMin) { u.burstDX = -Math.sin(e.rotation.y); u.burstDZ = -Math.cos(e.rotation.y); }
          else {
            const sgn = Math.random() < 0.5 ? 1 : -1;
            const perpAng = e.rotation.y + Math.PI / 2 * sgn;
            u.burstDX = Math.sin(perpAng); u.burstDZ = Math.cos(perpAng);
          }
          u.burstT = 0.9 + R() * 0.6;
        } else u.stayT = 1.0 + R() * 1.0;
      } else {
        if (playerAimingAtMe) {
          const sgn = Math.random() < 0.5 ? 1 : -1;
          const perpAng = e.rotation.y + Math.PI / 2 * sgn;
          u.burstDX = Math.sin(perpAng); u.burstDZ = Math.cos(perpAng);
          u.burstT = 0.4 + R() * 0.4;
        } else if (u.role === 'sniper') {
          if (d < u.prefMin) { u.burstDX = -Math.sin(e.rotation.y); u.burstDZ = -Math.cos(e.rotation.y); u.burstT = 0.8; }
          else if (d > u.prefMax) { u.burstDX = Math.sin(e.rotation.y); u.burstDZ = Math.cos(e.rotation.y); u.burstT = 0.8; }
          else {
            if (rnd < 0.7) u.stayT = 1.0 + R() * 1.2;
            else {
              const sgn = Math.random() < 0.5 ? 1 : -1;
              const perpAng = e.rotation.y + Math.PI / 2 * sgn;
              u.burstDX = Math.sin(perpAng); u.burstDZ = Math.cos(perpAng);
              u.burstT = 0.5 + R() * 0.4;
            }
          }
        } else if (u.role === 'flanker' && u.flankCount < 2) {
          const toEnemyAng = Math.atan2(p.x - px, p.z - pz);
          const sideAng = toEnemyAng + u.flankSide * 1.1;
          u.burstDX = Math.sin(sideAng); u.burstDZ = Math.cos(sideAng);
          u.burstT = 0.9 + R() * 0.6;
          u.flankCount++;
          Log.ai('Враг #' + u.id + ' обход #' + u.flankCount);
        } else {
          if (rnd < 0.5) u.stayT = 0.7 + R() * 0.8;
          else {
            let dirAng;
            if (d < u.prefMin) dirAng = e.rotation.y + Math.PI;
            else if (d > u.prefMax) dirAng = e.rotation.y;
            else {
              const sgn = Math.random() < 0.5 ? 1 : -1;
              dirAng = e.rotation.y + Math.PI / 2 * sgn;
            }
            u.burstDX = Math.sin(dirAng); u.burstDZ = Math.cos(dirAng);
            u.burstT = 0.7 + R() * 0.7;
          }
        }
      }
    }
  } else if (u.state === 'cover') {
    const cdx = u.coverX - p.x, cdz = u.coverZ - p.z, cd = Math.hypot(cdx, cdz);
    if (cd > 1.5) { targetYaw = Math.atan2(cdx, cdz); mvDir = 1; }
    else {
      u.peekT -= dt;
      if (u.peekState === 'hidden') {
        if (u.peekT <= 0) { u.peekState = 'peek'; u.peekT = 1.1 + R() * 0.4; }
        u.stateT -= dt;
        if (u.stateT <= 0) u.state = 'engage';
      } else {
        if (seesP && canReact) {
          targetYaw = Math.atan2(dx, dz);
          const aimY = Math.atan2(dy, Math.max(1, d));
          u.aimX += (Math.max(-.8, Math.min(.8, aimY)) - u.aimX) * Math.min(1, dt * 8);
          u.aim.rotation.x = -u.aimX - u.recoil * .09;
          wantToShoot = true;
        }
        if (u.peekT <= 0) {
          u.peekState = 'hidden';
          u.peekT = 0.7 + R() * 1.0;
          if (u.coverTryCd <= 0) {
            u.coverTryCd = 3;
            const newCov = findCover(p.x, p.z, px, pz, e);
            if (newCov && (Math.hypot(newCov.x - u.coverX, newCov.z - u.coverZ) > 2.5)) {
              u.coverX = newCov.x; u.coverZ = newCov.z; u.coverSince = T;
              Log.ai('Враг #' + u.id + ' меняет укрытие');
            }
          }
        }
      }
      u.coverTryCd -= dt;
    }
  } else if (u.state === 'flee') {
    const cdx = u.coverX - p.x, cdz = u.coverZ - p.z, cd = Math.hypot(cdx, cdz);
    if (cd > 2) { targetYaw = Math.atan2(cdx, cdz); mvDir = 1; }
    else { u.stateT -= dt; if (u.stateT <= 0) u.state = 'engage'; }
    if (seesP && canReact) wantToShoot = true;
    u.aimX *= .9; u.aim.rotation.x = -u.aimX;
  }
  let tSpd = 1.2;
  if (u.state === 'patrol') tSpd = u.stop ? 0 : 1.2;
  else if (u.state === 'search') tSpd = 3.2;
  else if (u.state === 'engage') tSpd = u.role === 'sniper' ? 2.2 : (u.role === 'flanker' ? 3.8 : 3.6);
  else if (u.state === 'cover') tSpd = 4.4;
  else if (u.state === 'flee') tSpd = 4.8;
  u.moveSpeed += (tSpd - u.moveSpeed) * Math.min(1, dt * 5);
  const dyaw = Math.atan2(Math.sin(targetYaw - e.rotation.y), Math.cos(targetYaw - e.rotation.y));
  e.rotation.y += Math.max(-3.8*dt, Math.min(3.8*dt, dyaw));
  if (mvDir !== 0) {
    const mag = Math.abs(u.moveSpeed * mvDir) * dt;
    const dirX = Math.sin(e.rotation.y) * (mvDir > 0 ? 1 : -1);
    const dirZ = Math.cos(e.rotation.y) * (mvDir > 0 ? 1 : -1);
    tryMoveAI(p, dirX, dirZ, mag, e);
  }
  u.cd -= dt;
  u.suppressCD -= dt;
  const suppressFire = !seesP && (T - u.lastSeen) < 4 && d < 30 && u.suppressCD <= 0 && T - u.lastHeard < 6;
  if (suppressFire && R() < 0.02) {
    u.suppressCD = 1.5;
    const fakeEnd = new THREE.Vector3(u.lastPx, (py || 0), u.lastPz);
    _mzlV.set(0, .03, .3);
    e.localToWorld(_mzlV);
    addTracer(_mzlV.clone(), fakeEnd);
    u.efl.visible = true; u.firing = .07; u.recoil = 1;
    snd('e', 0.4);
    const drift = Math.hypot(px - u.lastPx, pz - u.lastPz);
    if (drift < 2 && Math.random() < 0.15) hurt(4 + R() * 4);
  }
  const facingTarget = Math.atan2(dx, dz);
  const faceDelta = Math.abs(Math.atan2(Math.sin(facingTarget - e.rotation.y), Math.cos(facingTarget - e.rotation.y)));
  const bodyFacingPlayer = faceDelta < 0.25;
  const safeToShoot = wantToShoot && d < 40 && canReact && bodyFacingPlayer && !friendlyInLine(e, px, pz);
  if (safeToShoot) {
    if (u.burstLeft > 0) {
      u.burstCd -= dt;
      if (u.burstCd <= 0) {
        u.burstCd = 0.09;
        u.burstLeft--;
        u.efl.visible = true;
        u.firing = .07;
        u.recoil = 1;
        snd('e', Math.max(.05, 1 - d / 45));
        const isSniper = u.role === 'sniper';
        const dmgBase = isSniper ? (9 + R() * 6) : (4 + R() * 4);
        const timeOnTarget = T - u.seeStart;
        const aimBonus = Math.min(0.15, Math.max(0, timeOnTarget) * 0.025);
        let accBase = isSniper ? (0.65 - d / 220) : (0.5 - d / 220);
        accBase += aimBonus;
        const burstPenalty = u.burstWasLong ? Math.min(0.25, (u.burstMaxLen - u.burstLeft) * 0.04) : 0;
        accBase -= burstPenalty;
        const acc = Math.max(0.08, Math.min(0.85, accBase));
        if (Math.random() < acc) hurt(dmgBase);
      }
    } else if (u.cd <= 0) {
      const isSniper = u.role === 'sniper';
      if (isSniper) { u.burstLeft = 1; u.burstMaxLen = 1; u.cd = 2.4 + R() * 1.4; }
      else if (u.burstWasLong) { u.burstLeft = 2 + Math.floor(R()*2); u.burstMaxLen = u.burstLeft; u.cd = 0.5 + R()*0.4; u.burstWasLong = false; }
      else { u.burstLeft = 6 + Math.floor(R()*5); u.burstMaxLen = u.burstLeft; u.cd = 1.5 + R()*1.0; u.burstWasLong = true; }
      u.burstCd = 0;
    }
  } else {
    u.burstLeft = 0;
    if (u.cd < .4) u.cd = .4 + R() * 1;
  }
  p.y = H(p.x, p.z);
  u.ph += ((mvDir !== 0 || u.burstT > 0) ? 1 : 0) * dt * 3;
  const w = Math.sin(u.ph) * .7 * ((mvDir !== 0 || u.burstT > 0) ? 1 : 0);
  u.l1.rotation.x = w;
  u.l2.rotation.x = -w;
}

// ============================================================================
// ИНИЦИАЛИЗАЦИЯ ВВОДА
// ============================================================================
const ov = $('ov');

function startGame() {
  if (over) { location.reload(); return; }
  ini(); if (AC) AC.resume();
  on = 1;
  ov.style.display = 'none';
  if (!mobileMode) {
    try { rd.domElement.requestPointerLock(); } catch (e) {}
  }
}

// клик (ПК) + тап (телефон)
ov.addEventListener('click', startGame);
ov.addEventListener('touchstart', e => { e.preventDefault(); startGame(); }, { passive: false });

document.addEventListener('pointerlockchange', () => {
  if (mobileMode) return;
  if (!document.pointerLockElement && on && !over) {
    on = 0; fire = 0;
    $('ti').textContent = 'ПАУЗА';
    ov.style.display = 'flex';
  }
});
addEventListener('mousemove', e => {
  if (mobileMode) return;
  if (document.pointerLockElement) {
    yaw -= e.movementX * .0022;
    pitch = Math.max(-1.4, Math.min(1.4, pitch - e.movementY * .0022));
  }
});
addEventListener('mousedown', e => { if (!mobileMode && on && !over && e.button == 0) fire = 1; });
addEventListener('mouseup', () => { if (!mobileMode) fire = 0; });
addEventListener('keydown', async e => {
  K[e.code] = 1;
  if (e.code == 'KeyR' && on) reload();
  if (e.code == 'KeyV' && on) setWindLevel((wind.level + 1) % 3);
  if (e.code == 'KeyL' && on) {
    if (!Log._fileHandle && Log.canWriteFile()) await Log.attachFile();
    Log.info('Ручное сохранение лога (L)');
    Log.save('manual');
  }
});
addEventListener('keyup', e => K[e.code] = 0);

// режим-переключатель
setMobileMode(mobileMode);
initMobileControls();
$('modeToggle').addEventListener('click', e => {
  e.stopPropagation();
  setMobileMode(!mobileMode);
});
$('modeToggle').addEventListener('touchstart', e => {
  e.stopPropagation();
  e.preventDefault();
  setMobileMode(!mobileMode);
}, { passive: false });

// ============================================================================
// ГЛАВНЫЙ ЦИКЛ
// ============================================================================
Log.header();
Log.info('Движок: ' + THREE.REVISION);
Log.world('Рельеф 330x330, вода 1200x1200, небо радиус 450');
Log.info('Солнце: +80x +120y +50z (следует за игроком)');
Log.info('Игрок стартует: x=' + px.toFixed(1) + ' z=' + pz.toFixed(1) + ' y=' + py.toFixed(1));
Log.info('Поз смерти: ' + DEATH_POSES.length + ' (руки/ноги независимы)');

let last = performance.now();
let firstFrameLogged = false;

(function lp(now) {
  requestAnimationFrame(lp);
  const dt = Math.min(.05, (now - last) / 1000);
  last = now;
  T += dt;
  Log.fps(dt);

  if (!firstFrameLogged) { firstFrameLogged = true; Log.info('Первый кадр отрендерен'); }

  const vxNow = (px - prevPx) / Math.max(0.001, dt);
  const vzNow = (pz - prevPz) / Math.max(0.001, dt);
  playerVelX = playerVelX * 0.8 + vxNow * 0.2;
  playerVelZ = playerVelZ * 0.8 + vzNow * 0.2;
  prevPx = px; prevPz = pz;

  sun.position.set(px + 80, 120, pz + 50);
  sun.target.position.set(px, 0, pz);
  sun.target.updateMatrixWorld();

  waterDriftX += wind.dirX * wind.strength * dt * 0.03;
  waterDriftZ += wind.dirZ * wind.strength * dt * 0.03;
  tW.offset.set(T * .02 + waterDriftX, T * .014 + waterDriftZ);

  if (waterMat.userData.shader) {
    const sh = waterMat.userData.shader;
    sh.uniforms.time.value = T;
    sh.uniforms.windDirX.value = wind.dirX;
    sh.uniforms.windDirZ.value = wind.dirZ;
    sh.uniforms.windStrength.value = wind.strength;
  }

  const cloudSp1 = 0.006 * wind.strength;
  const cloudSp2 = 0.004 * wind.strength;
  cloudOff1X += wind.dirX * cloudSp1 * dt; cloudOff1Z += wind.dirZ * cloudSp1 * dt;
  cloudOff2X += wind.dirX * cloudSp2 * dt; cloudOff2Z += wind.dirZ * cloudSp2 * dt;
  cloudMat1.map.offset.set(cloudOff1X, cloudOff1Z);
  cloudMat2.map.offset.set(cloudOff2X, cloudOff2Z);

  updateKelps(dt);
  flL.intensity = Math.max(0, flL.intensity - dt * 60);

  if (on && !over) {
    pl(dt);
    en.forEach(e => up(e, dt));
    updatePalms(dt);
    updateFX(dt);
    dm = Math.max(0, dm - dt * 1.5);
  }

  $('hb').style.width = hp + '%';
  $('am').textContent = rl > 0 ? 'Перезарядка…' : mag + ' / ' + res;
  $('kl').textContent = 'Враги: ' + kills + ' / ' + en.length;
  $('dm').style.opacity = dm;

  if (!on && !over) {
    cam.position.set(px, py + 4, pz);
    cam.rotation.set(-.15, Math.sin(T * .2) * .6, 0);
    sky.position.copy(cam.position);
  }

  rd.render(sc, cam);
})(performance.now());