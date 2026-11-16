// Văn phòng 3D dùng chung: bầu trời theo giờ, cây cối, toà nhà 6 phòng AI, nhân vật Thế Quân đi WASD.
// Trang chính (index.html) và trang xem trước (vanphong3d.html) cùng gọi createOffice().
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { CSS2DRenderer, CSS2DObject } from "three/addons/renderers/CSS2DRenderer.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

// Thẻ phòng, nhãn nhân vật, cần điều khiển cảm ứng: module tự tạo và tự gắn CSS (tiền tố vp-)
// để trang chính (index.html) và trang xem trước (vanphong3d.html) dùng chung một cảnh.
const STYLE = `
.vp-lbl { padding: 3px 9px; border-radius: 999px; color: #0f172a; font: 700 12px/1.4 "Segoe UI", system-ui, sans-serif; white-space: nowrap; text-align: center; transition: opacity .25s; }
.vp-lbl.click { pointer-events: auto; cursor: pointer; }
.vp-lbl .say, .vp-lbl .req { display: none; margin-top: 6px; max-width: 240px; white-space: normal; padding: 6px 10px; border-radius: 10px; background: rgba(15, 23, 42, .92); color: #f8fafc; font-weight: 500; font-size: 12px; text-align: left; }
.vp-lbl .req { margin: 0 0 6px; border: 1.5px solid var(--req, #fbbf24); }
.vp-lbl .req small { display: block; font-size: 10px; font-weight: 800; letter-spacing: .04em; text-transform: uppercase; color: var(--req, #fbbf24); }
.vp-lbl.near .say, .vp-lbl.has-req .req { display: block; }
body.hide-bubbles .vp-lbl .say, body.hide-bubbles .vp-lbl .req { display: none !important; }
.vp-room { position: fixed; z-index: 15; width: 320px; padding: 12px 16px; border: 1px solid rgba(255, 255, 255, .14); border-left: 4px solid var(--room, #f59e0b); border-radius: 16px; background: rgba(12, 18, 32, .82); backdrop-filter: blur(14px); color: #f1f5f9; font: 14px/1.45 "Segoe UI", system-ui, sans-serif; transition: opacity .3s; pointer-events: none; }
.vp-room[hidden] { display: block; opacity: 0; }
.vp-room small { display: block; color: #94a3b8; font-size: 11px; text-transform: uppercase; letter-spacing: .06em; }
.vp-room b { display: block; font-size: 16px; margin: 2px 0; }
.vp-room .who { font-size: 13px; font-weight: 600; color: var(--room, #f59e0b); }
.vp-room p { margin: 4px 0 0; font-size: 13px; color: #cbd5e1; }
.vp-joy, .vp-jump { display: none; }
@media (pointer: coarse) {
  /* Cần nổi: ẩn cho tới khi chạm nửa trái màn hình, hiện ngay dưới ngón tay (JS đặt left/top). */
  .vp-joy { display: block; position: fixed; z-index: 15; left: 0; top: 0; width: 120px; height: 120px; border-radius: 50%; background: rgba(15, 23, 42, .45); border: 2px solid rgba(255, 255, 255, .25); touch-action: none; pointer-events: none; opacity: 0; transition: opacity .12s; }
  .vp-joy.on { opacity: 1; transition: none; }
  .vp-joy i { position: absolute; left: 50%; top: 50%; width: 52px; height: 52px; margin: -26px 0 0 -26px; border-radius: 50%; background: rgba(245, 158, 11, .9); }
  .vp-jump { display: block; position: fixed; z-index: 15; right: 24px; bottom: 140px; width: 76px; height: 76px; border-radius: 50%; border: 1px solid rgba(255, 255, 255, .25); background: rgba(15, 23, 42, .6); color: #f1f5f9; font: 600 14px "Segoe UI", sans-serif; }
}
@media (max-width: 900px) { .vp-room { width: 44vw; padding: 8px 12px; } .vp-room b { font-size: 14px; } .vp-room p { font-size: 12px; } }
@media (max-width: 560px) { .vp-room { left: 16px !important; right: 16px !important; width: auto; } }
@media (prefers-reduced-motion: reduce) { .vp-room { transition: none; } }
`;

/**
 * Dựng văn phòng 3D đi lại được. opts:
 *  gl, lbl: phần tử chứa canvas và lớp nhãn; hour: giờ ban đầu (5–21);
 *  cardStyle: vị trí thẻ "Bạn đang ở" (CSS inline); onReady(); onNpcClick(id); onZone(zone).
 * Trả về API điều khiển cảnh (xem cuối hàm).
 */
export function createOffice(opts = {}) {
if (!document.getElementById("vp-style")) { const st = document.createElement("style"); st.id = "vp-style"; st.textContent = STYLE; document.head.appendChild(st); }

const { clamp, lerp, smoothstep, degToRad } = THREE.MathUtils;
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
const css = (n) => "#" + n.toString(16).padStart(6, "0");

// Ngẫu nhiên có hạt giống: cây, mây, hoa đứng yên một chỗ mỗi lần tải trang.
let seed = 20261102;
const rnd = () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const range = (a, b) => a + rnd() * (b - a);
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];

let gl;
try {
  gl = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
} catch {
  throw new Error("Trình duyệt này không bật được WebGL nên không vẽ được cảnh 3D.");
}
gl.setPixelRatio(Math.min(devicePixelRatio, 1.5));
gl.toneMapping = THREE.ACESFilmicToneMapping;
gl.toneMappingExposure = 0.5;
gl.shadowMap.enabled = true;
gl.shadowMap.type = THREE.PCFSoftShadowMap;
gl.shadowMap.autoUpdate = false;   // vẽ lại bóng cách một khung (xem vòng lặp): bóng trễ 1/60 giây, khó thấy, đỡ ~1/4 thời gian mỗi khung
opts.gl.appendChild(gl.domElement);
gl.domElement.style.touchAction = "none";
const lblR = new CSS2DRenderer();
opts.lbl.appendChild(lblR.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0xbcd9ee, 0.0014);
const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 4000);
const controls = new OrbitControls(camera, gl.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.enablePan = false;
controls.minDistance = 0.4;   // cuộn sát vào đầu = góc nhìn thứ nhất
controls.maxDistance = 90;
controls.maxPolarAngle = 1.45;
controls.rotateSpeed = 0.7;

// Kích thước theo chính khung chứa (#gl: phủ kín màn hình), không theo innerWidth/innerHeight: trên iPhone, sau khi xoay ngang
// hoặc thanh Safari co lại, innerHeight có lúc đo trước khi màn hình ổn định nên canvas thấp hơn màn hình, lộ dải nền tối ở đáy
// (CEO thấy 16/11/2026). Canvas luôn 100% khung (CSS) và đo lại khi khung đổi cỡ, khi xoay máy, khi thanh trình duyệt đổi.
gl.domElement.style.cssText += ";display:block;width:100%;height:100%";
const coKhung = () => [Math.max(1, opts.gl.clientWidth || innerWidth), Math.max(1, opts.gl.clientHeight || innerHeight)];
function resize() {
  const [w, h] = coKhung();
  gl.setSize(w, h, false);
  lblR.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
addEventListener("resize", resize);
addEventListener("orientationchange", () => { resize(); setTimeout(resize, 250); setTimeout(resize, 800); });
if (window.visualViewport) visualViewport.addEventListener("resize", resize);
if (window.ResizeObserver) new ResizeObserver(resize).observe(opts.gl);
resize();

// ================= Vật liệu, khối dùng chung & va chạm =================
const UNIT = new THREE.BoxGeometry(1, 1, 1);
// Ánh sáng bầu trời rất mạnh; giảm phần phản chiếu môi trường để màu không bị bạc.
const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0, envMapIntensity: 0.45, ...o });
function box(mat, sx, sy, sz, x, y, z, parent = scene, ry = 0) {
  const m = new THREE.Mesh(UNIT, mat);
  m.scale.set(sx, sy, sz); m.position.set(x, y, z); m.rotation.y = ry;
  m.castShadow = m.receiveShadow = true;
  parent.add(m);
  return m;
}
function cyl(mat, rt, rb, hgt, x, y, z, parent = scene, seg = 24) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, hgt, seg), mat);
  m.position.set(x, y, z); m.castShadow = m.receiveShadow = true;
  parent.add(m);
  return m;
}
function canvasTex(w, h, draw, repeat) {
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  draw(c.getContext("2d"), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = gl.capabilities.getMaxAnisotropy();
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  return t;
}
function wrapText(g, text, x, y, maxW, lineH) {
  let line = "";
  for (const word of text.split(" ")) {
    const test = line ? line + " " + word : word;
    if (g.measureText(test).width > maxW && line) { g.fillText(line, x, y); line = word; y += lineH; }
    else line = test;
  }
  if (line) g.fillText(line, x, y);
}

// Va chạm trên mặt phẳng XZ: hộp chữ nhật (tường, bàn, tủ) và hình tròn (thân cây, người, bàn tròn, hồ).
const boxes = [], circles = [];
const solidBox = (x0, z0, x1, z1) => boxes.push([Math.min(x0, x1), Math.min(z0, z1), Math.max(x0, x1), Math.max(z0, z1)]);
const solidCircle = (x, z, r) => circles.push([x, z, r]);
function collide(p, r) {
  for (let it = 0; it < 2; it++) {
    for (const [x0, z0, x1, z1] of boxes) {
      if (p.x < x0 - r || p.x > x1 + r || p.z < z0 - r || p.z > z1 + r) continue;
      const cx = clamp(p.x, x0, x1), cz = clamp(p.z, z0, z1), dx = p.x - cx, dz = p.z - cz, d2 = dx * dx + dz * dz;
      if (d2 >= r * r) continue;
      if (d2 > 1e-8) { const d = Math.sqrt(d2), k = (r - d) / d; p.x += dx * k; p.z += dz * k; continue; }
      const out = [[p.x - x0 + r, -1, 0], [x1 - p.x + r, 1, 0], [p.z - z0 + r, 0, -1], [z1 - p.z + r, 0, 1]].sort((a, b) => a[0] - b[0])[0];
      p.x += out[1] * out[0]; p.z += out[2] * out[0];
    }
    for (const [x, z, cr] of circles) {
      const dx = p.x - x, dz = p.z - z, m = r + cr;
      if (Math.abs(dx) > m || Math.abs(dz) > m) continue;
      const d = Math.hypot(dx, dz);
      if (d < m && d > 1e-6) { p.x = x + (dx / d) * m; p.z = z + (dz / d) * m; }
    }
  }
  const R = Math.hypot(p.x, p.z);
  if (R > 320) { p.x *= 320 / R; p.z *= 320 / R; }
}

// ================= Bầu trời, mây, sao =================
// Shader trời riêng: dải màu đỉnh trời → chân trời, đĩa mặt trời có quầng, trăng ban đêm.
// Sương mù lấy đúng màu chân trời nên mặt đất tan vào trời không có vệt nối.
const SKY = {
  day: { top: new THREE.Color(0x2a6bcc), hor: new THREE.Color(0xbcd9ee) },
  gold: { top: new THREE.Color(0x3b5b98), hor: new THREE.Color(0xf2a96f) },
  night: { top: new THREE.Color(0x040914), hor: new THREE.Color(0x17223a) },
};
const skyMat = new THREE.ShaderMaterial({
  uniforms: {
    uTop: { value: new THREE.Color() }, uHor: { value: new THREE.Color() }, uSunCol: { value: new THREE.Color() },
    uSun: { value: new THREE.Vector3(0, 1, 0) }, uMoon: { value: new THREE.Vector3(0, 1, 0) }, uNight: { value: 0 },
  },
  vertexShader: `varying vec3 vDir;
    void main() { vDir = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }`,
  fragmentShader: `uniform vec3 uTop, uHor, uSunCol, uSun, uMoon; uniform float uNight; varying vec3 vDir;
    void main() {
      vec3 d = normalize(vDir);
      vec3 col = mix(uHor, uTop, pow(clamp(d.y, 0.0, 1.0), 0.45));
      col = mix(col, uHor * 0.9, smoothstep(0.0, -0.2, d.y));
      float s = max(dot(d, normalize(uSun)), 0.0);
      col += uSunCol * (smoothstep(0.99955, 0.9998, s) * 6.0 + pow(s, 80.0) * 0.35 + pow(s, 6.0) * 0.2);
      float m = max(dot(d, normalize(uMoon)), 0.0);
      col += vec3(0.86, 0.9, 1.0) * uNight * (smoothstep(0.9994, 0.9997, m) * 1.1 + pow(m, 50.0) * 0.07);
      gl_FragColor = vec4(col, 1.0);
      #include <colorspace_fragment>
    }`,
  side: THREE.BackSide, depthWrite: false, fog: false, toneMapped: false,
});
const skyGeo = new THREE.SphereGeometry(1000, 48, 24);
const skyDome = new THREE.Mesh(skyGeo, skyMat);
skyDome.userData.live = true;   // đi theo camera
skyDome.renderOrder = -1;
scene.add(skyDome);

// Ánh sáng môi trường lấy từ chính bầu trời, nên vật thể đổi màu mượt theo giờ.
const pmrem = new THREE.PMREMGenerator(gl);
const envScene = new THREE.Scene();
envScene.add(new THREE.Mesh(skyGeo, skyMat));
let envRT = null, envDirty = true, envAt = 0;
function updateEnv() {
  const rt = pmrem.fromScene(envScene, 0.02);
  scene.environment = rt.texture;
  if (envRT) envRT.dispose();
  envRT = rt; envDirty = false; envAt = performance.now();
}

function cloudTexture() {
  return canvasTex(256, 128, (g) => {
    for (let i = 0; i < 16; i++) {
      const x = 46 + rnd() * 164, y = 58 + rnd() * 34, r = 20 + rnd() * 30;
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, "rgba(255,255,255,0.85)");
      gr.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    }
  });
}
const cloudTexs = [cloudTexture(), cloudTexture(), cloudTexture()];
const clouds = [];
for (let i = 0; i < 36; i++) {
  const mat = new THREE.SpriteMaterial({ map: cloudTexs[i % 3], transparent: true, depthWrite: false, fog: false });
  const s = new THREE.Sprite(mat);
  const a = rnd() * Math.PI * 2, r = range(180, 800), w = range(80, 170);
  s.position.set(Math.cos(a) * r, range(80, 190), Math.sin(a) * r);
  s.scale.set(w, w * 0.42, 1);
  s.userData = { speed: range(1, 2.6), alpha: range(0.7, 0.95) };
  scene.add(s);
  clouds.push(s);
}

const starPos = [];
for (let i = 0; i < 1800; i++) {
  const th = rnd() * Math.PI * 2, ph = Math.acos(rnd() * 0.98), r = 1500;
  starPos.push(r * Math.sin(ph) * Math.cos(th), r * Math.cos(ph), r * Math.sin(ph) * Math.sin(th));
}
const starGeo = new THREE.BufferGeometry();
starGeo.setAttribute("position", new THREE.Float32BufferAttribute(starPos, 3));
const starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false, fog: false });
scene.add(new THREE.Points(starGeo, starMat));

// ================= Ánh sáng =================
// Vùng đổ bóng của mặt trời đi theo nhân vật nên đi đâu cũng có bóng.
const sun = new THREE.DirectionalLight(0xffffff, 5);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.03;
Object.assign(sun.shadow.camera, { left: -55, right: 55, top: 55, bottom: -55, near: 1, far: 420 });
scene.add(sun, sun.target);
const hemi = new THREE.HemisphereLight(0xcfe7ff, 0x4d6b3a, 1.1);
// Ban đêm: ánh trăng xanh nhạt (không đổ bóng để nhẹ máy) + đèn thật chiếu xuống lối đi và quảng trường.
const moon = new THREE.DirectionalLight(0xa9bcff, 0);
moon.position.set(-80, 140, 60);
scene.add(moon);
const pathLights = [[0, 23], [0, 40]].map(([x, z]) => { const l = new THREE.PointLight(0xffd9a0, 0, 26, 1.5); l.position.set(x, 4.2, z); scene.add(l); return l; });
scene.add(hemi);

// ================= Mặt bằng tổng thể =================
const W = 84, D = 36, BASE = 0.5, H = 5;   // toà nhà: rộng (thêm cánh Tây nhà vệ sinh, cánh Đông gym), sâu, nền, cao tầng (mét)
const ROAD_Z = 66;
const POND = { x: -66, z: 34, r: 9 };

const grassTex = canvasTex(256, 256, (g) => {
  g.fillStyle = "#5b8c3a"; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 6000; i++) {
    g.fillStyle = `hsl(${86 + rnd() * 22}, ${36 + rnd() * 20}%, ${28 + rnd() * 22}%)`;
    g.fillRect(rnd() * 256, rnd() * 256, 1 + rnd() * 2, 2 + rnd() * 3);
  }
}, [520, 520]);
const ground = new THREE.Mesh(new THREE.CircleGeometry(2600, 72), std(0xffffff, { map: grassTex, roughness: 0.96 }));
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

const hillGeo = new THREE.SphereGeometry(1, 32, 16);
const hillMats = [0x4c7a3d, 0x557f40, 0x3f6b35].map((c) => std(c, { roughness: 1 }));
for (let i = 0; i < 18; i++) {
  const a = (i / 18) * Math.PI * 2 + rnd() * 0.25, r = range(430, 720);
  const hill = new THREE.Mesh(hillGeo, pick(hillMats));
  hill.scale.set(range(110, 220), range(30, 75), range(100, 190));
  hill.position.set(Math.cos(a) * r, -10, Math.sin(a) * r);
  scene.add(hill);
}

const asphalt = std(0x3b4048, { roughness: 0.92 });
const paving = std(0xc9c2b4, { roughness: 0.85 });
box(asphalt, 1800, 0.04, 10, 0, 0.02, ROAD_Z);
box(paving, 1800, 0.08, 3, 0, 0.04, ROAD_Z - 6.5);
box(paving, 1800, 0.08, 3, 0, 0.04, ROAD_Z + 6.5);
const dash = new THREE.InstancedMesh(UNIT, std(0xf1f5f9, { roughness: 0.7 }), 120);
const m4 = new THREE.Matrix4(), q4 = new THREE.Quaternion(), v3 = new THREE.Vector3(), s3 = new THREE.Vector3(), col = new THREE.Color();
const UP = new THREE.Vector3(0, 1, 0);
for (let i = 0; i < 120; i++) dash.setMatrixAt(i, m4.compose(v3.set(-480 + i * 8, 0.05, ROAD_Z), q4.identity(), s3.set(3.2, 0.02, 0.22)));
dash.receiveShadow = true;
scene.add(dash);

// Lối đi lát đá từ vỉa hè vào sảnh và quảng trường trước cửa
const pathFrom = D / 2 + 1.8, pathTo = ROAD_Z - 8;
box(paving, 5, 0.06, pathTo - pathFrom, 0, 0.03, (pathFrom + pathTo) / 2);
box(paving, 20, 0.06, 7, 0, 0.03, D / 2 + 5);

const water = new THREE.Mesh(new THREE.CircleGeometry(POND.r, 48), std(0x2c6e9b, { roughness: 0.06, metalness: 0.15 }));
water.rotation.x = -Math.PI / 2; water.position.set(POND.x, 0.06, POND.z); water.receiveShadow = true;
scene.add(water);
const rim = new THREE.Mesh(new THREE.TorusGeometry(POND.r + 0.3, 0.45, 10, 64), std(0x9ca3af, { roughness: 0.9 }));
rim.rotation.x = Math.PI / 2; rim.position.set(POND.x, 0.1, POND.z); rim.scale.z = 0.5; rim.receiveShadow = true;
scene.add(rim);
solidCircle(POND.x, POND.z, POND.r + 0.4);
const padMat = std(0x4d8b3a, { roughness: 0.7 });
for (let i = 0; i < 7; i++) {
  const pad = new THREE.Mesh(new THREE.CircleGeometry(range(0.5, 0.9), 16, 0.4, Math.PI * 1.85), padMat);
  const a = rnd() * Math.PI * 2, d = range(2, POND.r - 1.5);
  pad.rotation.set(-Math.PI / 2, 0, rnd() * 6); pad.position.set(POND.x + Math.cos(a) * d, 0.08, POND.z + Math.sin(a) * d);
  scene.add(pad);
}

// Ghế đá & đèn đường
const benchWood = std(0x8b5a2b, { roughness: 0.7 }), ironMat = std(0x1f2937, { roughness: 0.4, metalness: 0.7 });
function bench(x, z, ry, parent = scene) {
  const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ry; parent.add(g);
  box(benchWood, 2.2, 0.08, 0.6, 0, 0.5, 0, g);
  box(benchWood, 2.2, 0.5, 0.08, 0, 0.8, -0.28, g);
  for (const sx of [-0.95, 0.95]) box(ironMat, 0.08, 0.5, 0.55, sx, 0.25, 0, g);
  solidCircle(x, z, 1.0);
}
bench(POND.x + 11, POND.z - 2, -Math.PI / 2);
bench(POND.x, POND.z - 11.5, 0);
bench(7, 34, -Math.PI / 2);
bench(-7, 46, Math.PI / 2);

const lampMats = [];
const glowTex = canvasTex(64, 64, (g) => {
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, "rgba(255,226,170,1)"); gr.addColorStop(1, "rgba(255,226,170,0)");
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
});
const glows = [];
let glowNight = 0;   // độ sáng quầng đèn theo giờ; mờ dần khi camera đứng sát để không thành đốm to che màn hình
const lampMat = std(0xfff1d6, { emissive: 0xffd9a0, emissiveIntensity: 0.2, roughness: 0.3 });
lampMats.push(lampMat);
function lamp(x, z) {
  cyl(ironMat, 0.07, 0.1, 4, x, 2, z, scene, 10);
  const bulb = cyl(lampMat, 0.3, 0.22, 0.45, x, 4.1, z, scene, 16);
  bulb.castShadow = false;
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }));
  glow.position.set(x, 4.1, z); glow.scale.setScalar(2.2);
  scene.add(glow); glows.push(glow);
  solidCircle(x, z, 0.18);
}
for (const z of [28, 38, 48]) { lamp(-3.4, z); lamp(3.4, z); }
for (let x = -60; x <= 60; x += 20) lamp(x, ROAD_Z - 8.4);

// ================= Cây cối (instancing + gió lay) =================
const wind = { value: 0 }, windStrength = { value: 1 };
function windMat(o = {}) {
  const m = std(0xffffff, o);
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = wind; sh.uniforms.uWind = windStrength;
    sh.vertexShader = "uniform float uTime;\nuniform float uWind;\n" + sh.vertexShader.replace("#include <begin_vertex>", `#include <begin_vertex>
      #ifdef USE_INSTANCING
        vec3 ip = instanceMatrix[3].xyz;
      #else
        vec3 ip = vec3(0.0);
      #endif
      float hgt = max(position.y + 1.0, 0.0);
      float sw = (sin(uTime * 1.3 + ip.x * 0.21 + ip.z * 0.17) * 0.045 + sin(uTime * 2.9 + ip.z * 0.37) * 0.016) * uWind;
      transformed.x += sw * hgt;
      transformed.z += sw * 0.6 * hgt;`);
  };
  return m;
}
const leafParts = [], coneParts = [], trunkParts = [], bushParts = [], flowerParts = [];
const part = (list, x, y, z, sx, sy, sz, color, ry = 0) => list.push({ x, y, z, sx, sy, sz, color, ry });
const LEAF = [0x4f8a3c, 0x5c9a43, 0x3f7a35, 0x6aa84f, 0x77a843, 0x4a7f3a];
const AUTUMN = [0xd4a017, 0xc2601e, 0xb8862b];
const PINE = [0x2f5d3a, 0x376b43, 0x2a5233];
const shade = (hex, k) => col.set(hex).offsetHSL(0, 0, k).getHex();

function addTree(x, z, kind = rnd() < 0.3 ? "pine" : "round") {
  const s = range(0.8, 1.35);
  if (kind === "pine") {
    const th = 1.5 * s, c = pick(PINE);
    part(trunkParts, x, 0, z, 0.28 * s, th + 1.2 * s, 0.28 * s, 0x5a3d2b);
    for (let i = 0; i < 3; i++) {
      const r = (2.5 - i * 0.65) * s, hg = (3.3 - i * 0.45) * s;
      part(coneParts, x, th + i * 1.7 * s + hg / 2, z, r, hg, r, shade(c, i * 0.03), rnd() * 6);
    }
    solidCircle(x, z, 0.28 * s + 0.15);
  } else {
    const th = range(2.2, 3.2) * s, c = rnd() < 0.1 ? pick(AUTUMN) : pick(LEAF);
    part(trunkParts, x, 0, z, 0.32 * s, th + 0.9 * s, 0.32 * s, 0x6b4a33);
    part(leafParts, x, th + 1.7 * s, z, 2.2 * s, 2.0 * s, 2.2 * s, c);
    const n = 3 + Math.floor(rnd() * 3);
    for (let i = 0; i < n; i++) {
      const a = rnd() * Math.PI * 2, d = range(0.9, 1.6) * s, r = range(1.1, 1.6) * s;
      part(leafParts, x + Math.cos(a) * d, th + range(0.9, 2.6) * s, z + Math.sin(a) * d, r, r * 0.9, r, shade(c, range(-0.06, 0.06)));
    }
    solidCircle(x, z, 0.32 * s + 0.15);
  }
}
function freeSpot(x, z) {
  if (Math.abs(x) < W / 2 + 10 && z > -D / 2 - 12 && z < D / 2 + 12) return false; // toà nhà + quảng trường
  if (Math.abs(z - ROAD_Z) < 11) return false;                                      // đường + vỉa hè
  if (Math.abs(x) < 20 && z > 10 && z < ROAD_Z + 30) return false;                  // bãi cỏ trước sảnh
  if (Math.hypot(x - POND.x, z - POND.z) < POND.r + 5) return false;                // hồ
  return true;
}
for (let x = -150; x <= 150; x += 13) {
  if (Math.abs(x) < 20) continue;   // chừa khoảng nhìn thẳng từ đường vào sảnh
  addTree(x + range(-1, 1), ROAD_Z - 12.5, "round"); addTree(x + range(-1, 1), ROAD_Z + 12.5, "round");
}
for (let i = 0; i < 260; i++) {
  const a = rnd() * Math.PI * 2, r = range(45, 260), x = Math.cos(a) * r, z = Math.sin(a) * r;
  if (freeSpot(x, z)) addTree(x, z, z < -40 && rnd() < 0.7 ? "pine" : undefined);
}
// Bụi cây quanh toà nhà và bờ hồ (bụi thấp, đi xuyên được)
for (let x = -W / 2; x <= W / 2; x += 2.1) { if (Math.abs(x) > 11) part(bushParts, x, 0.55, D / 2 + 1.4, 0.9, 0.7, 0.8, pick(LEAF)); part(bushParts, x, 0.55, -D / 2 - 1.4, 0.9, 0.7, 0.8, pick(LEAF)); }
for (let z = -D / 2; z <= D / 2; z += 2.1) { part(bushParts, -W / 2 - 1.4, 0.55, z, 0.8, 0.7, 0.9, pick(LEAF)); part(bushParts, W / 2 + 1.4, 0.55, z, 0.8, 0.7, 0.9, pick(LEAF)); }
for (let i = 0; i < 26; i++) { const a = (i / 26) * Math.PI * 2; part(bushParts, POND.x + Math.cos(a) * (POND.r + 1.6), 0.45, POND.z + Math.sin(a) * (POND.r + 1.6), range(0.6, 1), range(0.5, 0.8), range(0.6, 1), pick(LEAF)); }
// Luống hoa hai bên quảng trường
const FLOWERS = [0xf472b6, 0xfacc15, 0xffffff, 0xf87171, 0xc084fc];
for (const sx of [-1, 1]) {
  for (let i = 0; i < 110; i++) {
    const x = sx * range(10.6, 14), z = range(D / 2 + 2, D / 2 + 8);
    part(flowerParts, x, 0.25, z, 1, 1, 1, pick(FLOWERS));
    if (i % 3 === 0) part(bushParts, x, 0.18, z, 0.35, 0.22, 0.35, pick(LEAF));
  }
}

function instanced(list, geo, mat, shadow = true) {
  const mesh = new THREE.InstancedMesh(geo, mat, list.length);
  list.forEach((p, i) => {
    q4.setFromAxisAngle(UP, p.ry);
    mesh.setMatrixAt(i, m4.compose(v3.set(p.x, p.y, p.z), q4, s3.set(p.sx, p.sy, p.sz)));
    mesh.setColorAt(i, col.set(p.color));
  });
  mesh.castShadow = shadow; mesh.receiveShadow = true;
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.computeBoundingSphere();
  scene.add(mesh);
  return mesh;
}
const trunkGeo = new THREE.CylinderGeometry(0.7, 1, 1, 8); trunkGeo.translate(0, 0.5, 0);
instanced(trunkParts, trunkGeo, std(0xffffff, { roughness: 1 }));
instanced(leafParts, new THREE.IcosahedronGeometry(1, 2), windMat({ roughness: 0.85 }));
instanced(coneParts, new THREE.ConeGeometry(1, 1, 12), windMat({ roughness: 0.9 }));
instanced(bushParts, new THREE.IcosahedronGeometry(1, 2), windMat({ roughness: 0.9 }));
instanced(flowerParts, new THREE.SphereGeometry(0.12, 8, 6), windMat({ roughness: 0.6 }), false);

// ================= Vỏ toà nhà =================
const concrete = std(0xd9d6cf, { roughness: 0.85 });
const metal = std(0x1f2933, { roughness: 0.35, metalness: 0.75 });
const glassMat = new THREE.MeshStandardMaterial({ color: 0xbcd8ec, roughness: 0.04, metalness: 0.1, transparent: true, opacity: 0.2, depthWrite: false, side: THREE.DoubleSide });
const cladding = std(0x8a6446, { roughness: 0.75 });

box(concrete, W + 1.2, BASE, D + 1.2, 0, BASE / 2, 0);
box(concrete, 7, 0.17, 1.2, 0, 0.085, D / 2 + 1.2);
box(concrete, 7, 0.34, 0.6, 0, 0.17, D / 2 + 0.9);

const woodTex = canvasTex(512, 512, (g) => {
  g.fillStyle = "#d8b98f"; g.fillRect(0, 0, 512, 512);
  const rows = 12, rh = 512 / rows;
  for (let r = 0; r < rows; r++) {
    let x = -rnd() * 100;
    while (x < 512) {
      const len = 120 + rnd() * 140;
      g.fillStyle = `hsl(32, 40%, ${54 + rnd() * 10}%)`; g.fillRect(x, r * rh, len, rh);
      g.fillStyle = "rgba(40,20,10,0.16)"; g.fillRect(x, r * rh, 2, rh);
      x += len;
    }
    g.fillStyle = "rgba(40,20,10,0.2)"; g.fillRect(0, r * rh, 512, 2);
  }
}, [12, 7]);
const floor = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.2, D - 0.2), std(0xffffff, { map: woodTex, roughness: 0.42 }));
floor.rotation.x = -Math.PI / 2; floor.position.y = BASE + 0.005; floor.receiveShadow = true;
scene.add(floor);

// Vách kính ngoài có đố nhôm; cửa chính mặt nam rộng 4m; giữa mặt bắc ốp gỗ (sau tường chữ).
const wy = BASE + H / 2;
// Tường, vách kính, mái: camera không được nằm sau những mặt này so với nhân vật
const camBlockers = [];
function curtain(x1, z1, x2, z2) {
  const len = Math.hypot(x2 - x1, z2 - z1), ry = -Math.atan2(z2 - z1, x2 - x1), cx = (x1 + x2) / 2, cz = (z1 + z2) / 2;
  const pane = box(glassMat, len, H, 0.06, cx, wy, cz, scene, ry);
  camBlockers.push(pane);
  pane.castShadow = false; pane.renderOrder = 2;
  const n = Math.max(1, Math.round(len / 2.5));
  for (let i = 0; i <= n; i++) {
    const t = i / n - 0.5;
    box(metal, 0.12, H, 0.14, cx + Math.cos(-ry) * len * t, wy, cz + Math.sin(-ry) * len * t, scene, ry);
  }
  for (const y of [BASE + 0.05, BASE + 3.1, BASE + H - 0.06]) box(metal, len, 0.1, 0.16, cx, y, cz, scene, ry);
  solidBox(Math.min(x1, x2) - 0.15, Math.min(z1, z2) - 0.15, Math.max(x1, x2) + 0.15, Math.max(z1, z2) + 0.15);
}
curtain(-W / 2, D / 2, -2, D / 2);
curtain(2, D / 2, W / 2, D / 2);
curtain(-W / 2, -D / 2, -6, -D / 2);
curtain(6, -D / 2, W / 2, -D / 2);
curtain(-W / 2, -D / 2, -W / 2, D / 2);
curtain(W / 2, -D / 2, W / 2, D / 2);
camBlockers.push(box(cladding, 12, H, 0.35, 0, wy, -D / 2));
solidBox(-6, -D / 2 - 0.2, 6, -D / 2 + 0.2);
box(metal, 4.2, 0.35, 0.2, 0, BASE + H - 0.6, D / 2);   // khung cửa
for (const sx of [-2.05, 2.05]) box(metal, 0.14, H, 0.2, sx, wy, D / 2);
const door = box(glassMat, 1.95, 3.6, 0.05, -3, BASE + 1.8, D / 2 + 0.16); door.castShadow = false;
for (const [x, z] of [[-W / 2, -D / 2], [W / 2, -D / 2], [-W / 2, D / 2], [W / 2, D / 2]]) box(metal, 0.45, H + 0.2, 0.45, x, wy, z);

// Mái: mờ dần khi nhân vật bước vào trong để camera nhìn được từ trên xuống.
const roof = new THREE.Group();
scene.add(roof);
const roofMats = [];
const rstd = (c, o) => { const m = std(c, { transparent: true, ...o }); roofMats.push(m); return m; };
const roofY = BASE + H;
const roofSlab = box(rstd(0xeef0f2, { roughness: 0.9 }), W + 3, 0.5, D + 3, 0, roofY + 0.25, 0, roof);
box(rstd(0x1f2933, { roughness: 0.35, metalness: 0.75 }), W + 3.1, 0.22, D + 3.1, 0, roofY + 0.55, 0, roof);
const panelMat = rstd(0x1e3a5f, { roughness: 0.22, metalness: 0.6 }), panelLeg = rstd(0x1f2933, { metalness: 0.7 });
for (let i = 0; i < 11; i++) for (let j = 0; j < 5; j++) {
  const p = box(panelMat, 4.6, 0.08, 2.2, -33 + i * 6.6, roofY + 1.1, -13 + j * 4, roof);
  p.rotation.x = -0.32;
  box(panelLeg, 0.08, 0.45, 0.08, -33 + i * 6.6, roofY + 0.9, -13 + j * 4, roof);
}
const hvac = rstd(0xcbd5e1, { roughness: 0.5, metalness: 0.4 });
box(hvac, 3, 1.4, 2, 24, roofY + 1.4, 11, roof);
box(hvac, 3, 1.4, 2, 24, roofY + 1.4, 14, roof);
// Mái che sảnh + biển tên
box(std(0xeef0f2, { roughness: 0.8 }), 9, 0.28, 4.4, 0, BASE + 4.1, D / 2 + 2.2);
for (const sx of [-4.2, 4.2]) { box(metal, 0.16, 4.1, 0.16, sx, BASE / 2 + 2.05, D / 2 + 4.2); solidCircle(sx, D / 2 + 4.2, 0.15); }
const signTex = canvasTex(1024, 160, (g, w, h) => {
  g.fillStyle = "#0f172a"; g.fillRect(0, 0, w, h);
  g.fillStyle = "#f59e0b"; g.font = "bold 82px Segoe UI, sans-serif"; g.textAlign = "center"; g.textBaseline = "middle";
  g.fillText("VĂN PHÒNG AI", w / 2, h / 2 + 4);
});
const sign = new THREE.Mesh(new THREE.PlaneGeometry(7.2, 1.1), new THREE.MeshStandardMaterial({ map: signTex, emissive: 0xffffff, emissiveMap: signTex, emissiveIntensity: 0.35 }));
sign.position.set(0, BASE + 4.6, D / 2 + 4.42);
scene.add(sign);

// ================= Nội thất =================
const inn = new THREE.Group();
inn.position.y = BASE;
scene.add(inn);
const oak = std(0xc9a27a, { roughness: 0.45 }), walnut = std(0x5b3a26, { roughness: 0.45 });
const white = std(0xf4f5f7, { roughness: 0.4 }), fabric = std(0x475569, { roughness: 0.95 }), dark = std(0x1e293b, { roughness: 0.5 });
const aluMat = std(0xcbd5e1, { roughness: 0.25, metalness: 0.85 });

function chair(x, z, ry, parent = inn) {
  const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ry; parent.add(g);
  box(fabric, 0.62, 0.1, 0.6, 0, 0.5, 0, g);
  box(fabric, 0.6, 0.72, 0.08, 0, 0.92, 0.28, g);
  cyl(aluMat, 0.04, 0.04, 0.42, 0, 0.25, 0, g, 8);
  cyl(dark, 0.32, 0.32, 0.05, 0, 0.04, 0, g, 5);
}
// Bàn làm việc: phía +z (cục bộ) là chỗ ngồi, màn hình ở mép -z quay về chỗ ngồi.
function desk(x, z, ry, hex, { top = oak, chairToo = true, screens = 1, scale = 1 } = {}) {
  const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ry; g.scale.setScalar(scale); inn.add(g);
  box(top, 2.3, 0.06, 1.15, 0, 0.75, 0, g);
  for (const sx of [-1.05, 1.05]) box(aluMat, 0.06, 0.72, 1.0, sx, 0.37, 0, g);
  const scr = new THREE.MeshStandardMaterial({ color: 0x0b1220, emissive: hex, emissiveIntensity: 0.6 });
  for (let i = 0; i < screens; i++) {
    const off = (i - (screens - 1) / 2) * 0.72, turn = screens > 1 ? -(i - (screens - 1) / 2) * 0.35 : 0;
    const mon = new THREE.Group(); mon.position.set(off, 0, -0.3); mon.rotation.y = turn; g.add(mon);
    box(dark, screens > 1 ? 0.68 : 0.95, 0.5, 0.05, 0, 1.15, 0, mon);
    const s = new THREE.Mesh(new THREE.PlaneGeometry(screens > 1 ? 0.62 : 0.88, 0.44), scr); s.position.set(0, 1.15, 0.03); mon.add(s);
    box(dark, 0.06, 0.3, 0.06, 0, 0.9, -0.04, mon);
  }
  box(white, 0.5, 0.02, 0.16, 0, 0.79, 0.12, g);
  if (chairToo) chair(0, 0.85, 0, g);
  solidBox(x - 1.2 * scale, z - 0.62 * scale, x + 1.2 * scale, z + 0.62 * scale);
  return g;
}
function plant(x, z, s = 1) {
  const g = new THREE.Group(); g.position.set(x, 0, z); g.scale.setScalar(s); inn.add(g);
  cyl(white, 0.38, 0.3, 0.7, 0, 0.35, 0, g, 20);
  const leaf = std(0x3f8a3a, { roughness: 0.8 });
  for (let i = 0; i < 5; i++) {
    const b = new THREE.Mesh(new THREE.IcosahedronGeometry(0.42, 1), leaf);
    b.position.set(range(-0.25, 0.25), 1.0 + i * 0.22, range(-0.25, 0.25)); b.castShadow = true;
    g.add(b);
  }
  solidCircle(x, z, 0.42 * s);
}
function sofa(x, z, len, ry, colr = 0x334155) {
  const m = std(colr, { roughness: 0.95 });
  const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ry; inn.add(g);
  box(m, len, 0.45, 0.95, 0, 0.32, 0, g); box(m, len, 0.6, 0.28, 0, 0.75, 0.38, g);
  for (const sx of [-1, 1]) box(m, 0.22, 0.6, 0.95, sx * (len / 2 - 0.11), 0.5, 0, g);
  const along = Math.abs(Math.sin(ry)) < 0.5;
  if (along) solidBox(x - len / 2, z - 0.5, x + len / 2, z + 0.5); else solidBox(x - 0.5, z - len / 2, x + 0.5, z + len / 2);
}
function rug(x0, x1, z0, z1, hex) { box(std(hex, { roughness: 1 }), x1 - x0 - 1.2, 0.02, z1 - z0 - 1.2, (x0 + x1) / 2, 0.01, (z0 + z1) / 2, inn).castShadow = false; }
// Kính mờ cho nhà vệ sinh: không nhìn xuyên được nhưng vẫn sáng.
const frostMat = new THREE.MeshStandardMaterial({ color: 0xe8eef5, roughness: 0.9, metalness: 0, transparent: true, opacity: 0.92, envMapIntensity: 0.45 });
function glassPane(x1, z1, x2, z2, y0, y1, mat = glassMat) {
  const len = Math.hypot(x2 - x1, z2 - z1), ry = -Math.atan2(z2 - z1, x2 - x1), cx = (x1 + x2) / 2, cz = (z1 + z2) / 2;
  const p = box(mat, len, y1 - y0, 0.05, cx, (y0 + y1) / 2, cz, inn, ry); p.castShadow = mat !== glassMat; p.renderOrder = 2;
  camBlockers.push(p);
  box(aluMat, len, 0.08, 0.1, cx, y0 + 0.04, cz, inn, ry);
  box(aluMat, len, 0.08, 0.1, cx, y1, cz, inn, ry);
}
// Vách kính trong nhà nằm ngang/dọc; door = toạ độ tâm cửa (rộng 2.4m) trên đoạn tường, null = kín.
function partition(x1, z1, x2, z2, door = null, mat = glassMat) {
  const horiz = z1 === z2, a = horiz ? x1 : z1, b = horiz ? x2 : z2;
  const seg = (p, q) => {
    if (q - p < 0.05) return;
    if (horiz) { glassPane(p, z1, q, z1, 0, H - 0.1, mat); solidBox(p, z1 - 0.1, q, z1 + 0.1); }
    else { glassPane(x1, p, x1, q, 0, H - 0.1, mat); solidBox(x1 - 0.1, p, x1 + 0.1, q); }
  };
  if (door === null) return seg(a, b);
  seg(a, door - 1.2); seg(door + 1.2, b);
  if (horiz) glassPane(door - 1.2, z1, door + 1.2, z1, 2.7, H - 0.1, mat); else glassPane(x1, door - 1.2, x1, door + 1.2, 2.7, H - 0.1, mat);
  for (const d of [door - 1.2, door + 1.2]) horiz ? box(aluMat, 0.1, 2.7, 0.12, d, 1.35, z1, inn) : box(aluMat, 0.12, 2.7, 0.1, x1, 1.35, d, inn);
}
// Bảng trắng đứng (canvas vẽ nội dung theo chức năng phòng)
function board(x, z, ry, tex) {
  const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ry; inn.add(g);
  box(dark, 2.7, 1.8, 0.06, 0, 1.85, 0, g);
  const p = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.7), new THREE.MeshStandardMaterial({ map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.2, roughness: 0.4 }));
  p.position.set(0, 1.85, 0.035); g.add(p);
  for (const sx of [-1.25, 1.25]) cyl(aluMat, 0.03, 0.03, 1.0, sx, 0.5, 0, g, 6);
  if (Math.abs(Math.sin(ry)) > 0.5) solidBox(x - 0.2, z - 1.35, x + 0.2, z + 1.35); else solidBox(x - 1.35, z - 0.2, x + 1.35, z + 0.2);
}
function boardTex(kind, accent) {
  return canvasTex(780, 510, (g, w, h) => {
    g.fillStyle = "#f8fafc"; g.fillRect(0, 0, w, h);
    g.fillStyle = css(accent); g.fillRect(0, 0, w, 14);
    g.fillStyle = "#0f172a"; g.textBaseline = "top"; g.font = "bold 38px Segoe UI, sans-serif";
    const title = { kanban: "Luồng việc của chu trình", design: "Design System · Vùng [2]", arch: "Kiến trúc hệ thống · Vùng [3]", audit: "Vùng [5] · Chốt chặn", frontend: "Giao diện · 375 / 768 / 1280" }[kind];
    g.fillText(title, 28, 34);
    if (kind === "kanban") {
      ["Chờ", "Đang làm", "Chờ duyệt", "Xong"].forEach((c, i) => {
        const x = 28 + i * 184;
        g.fillStyle = "#e2e8f0"; g.fillRect(x, 100, 168, 384);
        g.fillStyle = "#334155"; g.font = "bold 26px Segoe UI, sans-serif"; g.fillText(c, x + 12, 112);
        for (let k = 0; k < [3, 2, 1, 4][i]; k++) { g.fillStyle = ["#fde68a", "#bfdbfe", "#fbcfe8", "#bbf7d0"][(i + k) % 4]; g.fillRect(x + 12, 158 + k * 78, 144, 64); }
      });
    } else if (kind === "design") {
      ["#a855f7", "#f59e0b", "#0f172a", "#38bdf8", "#22c55e", "#f43f5e"].forEach((c, i) => { g.fillStyle = c; g.beginPath(); g.arc(70 + i * 82, 140, 30, 0, Math.PI * 2); g.fill(); });
      g.strokeStyle = "#475569"; g.lineWidth = 4;
      g.strokeRect(40, 210, 170, 270); g.strokeRect(60, 240, 130, 26); g.strokeRect(60, 280, 130, 90); g.strokeRect(60, 384, 60, 26);
      for (let i = 0; i < 3; i++) { g.strokeRect(250 + i * 170, 210, 150, 120); g.fillStyle = "#e9d5ff"; g.fillRect(262 + i * 170, 222, 126, 40); }
      g.fillStyle = "#334155"; g.font = "600 24px Segoe UI, sans-serif";
      ["Rỗng", "Đang tải", "Lỗi", "Có dữ liệu", "Thành công"].forEach((s, i) => g.fillText("● " + s, 250 + (i % 3) * 170, 360 + Math.floor(i / 3) * 44));
    } else if (kind === "frontend") {
      // Ba khung màn hình (điện thoại, máy tính bảng, máy tính) cùng một bố cục: đầu trang, thẻ nội dung, nút.
      [[40, 110, 120, 220], [200, 110, 210, 280], [450, 110, 300, 230]].forEach(([x, y, w, h]) => {
        g.strokeStyle = "#334155"; g.lineWidth = 4; g.strokeRect(x, y, w, h);
        g.fillStyle = css(accent); g.fillRect(x + 8, y + 8, w - 16, 22);
        const cols = w > 250 ? 3 : w > 150 ? 2 : 1, cw = (w - 16 - (cols - 1) * 8) / cols;
        for (let c = 0; c < cols; c++) { g.fillStyle = "#e2e8f0"; g.fillRect(x + 8 + c * (cw + 8), y + 40, cw, h * 0.45); }
        g.fillStyle = "#0f172a"; g.fillRect(x + 8, y + h - 36, Math.min(110, w - 16), 26);
      });
      g.fillStyle = "#334155"; g.font = "600 24px Segoe UI, sans-serif";
      ["✓ Tab / Enter", "✓ Tương phản AA", "✓ 5 trạng thái"].forEach((t, i) => g.fillText(t, 40 + i * 240, 440));
    } else if (kind === "arch") {
      const node = (x, y, t, c) => { g.fillStyle = c; g.fillRect(x, y, 190, 80); g.fillStyle = "#fff"; g.font = "bold 26px Segoe UI, sans-serif"; g.fillText(t, x + 16, y + 26); };
      const arrow = (x1, y1, x2, y2) => { g.strokeStyle = "#334155"; g.lineWidth = 5; g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke(); };
      node(30, 130, "Giao diện", "#3b82f6"); node(300, 130, "API + SSE", "#10b981"); node(560, 130, "AI Agent", "#a855f7");
      node(300, 330, "Cơ sở dữ liệu", "#f59e0b"); node(560, 330, "Hàng đợi việc", "#64748b");
      arrow(220, 170, 300, 170); arrow(490, 170, 560, 170); arrow(395, 210, 395, 330); arrow(655, 210, 655, 330);
    } else {
      g.font = "600 30px Segoe UI, sans-serif";
      [["✔ Không lộ khóa API, mật khẩu", "#15803d"], ["✔ Có xử lý lỗi, timeout, retry", "#15803d"], ["✔ Code khớp kế hoạch Vùng [3]", "#15803d"], ["✔ Giao diện đủ 5 trạng thái", "#15803d"], ["Blocker đang mở: 0", "#0f172a"]]
        .forEach(([t, c], i) => { g.fillStyle = c; g.fillText(t, 40, 120 + i * 70); });
    }
  });
}

// ---- Danh sách phòng: mỗi AI một phòng, ghi rõ chức năng ----
const ROOMS = [
  { id: "ceo", x0: -30, x1: -17, z0: 6, z1: 18, door: -23.5, color: 0xf59e0b, title: "PHÒNG GIÁM ĐỐC", who: "Thế Quân CEO (bạn) · Naruto", fn: "Chủ Dự Án: duyệt hướng đi, ra quyết định cuối cùng, cấp đặc cách cho cả đội." },
  { id: "pain", x0: -17, x1: -6, z0: 6, z1: 18, door: -11.5, color: 0xef4444, title: "PHÒNG ĐIỀU HÀNH", who: "Pain · Tổng quản lý", fn: "Điều phối chu trình tự động: giao lượt NEXT_OWNER, theo dõi tiến độ, báo cáo CEO." },
  { id: "hinata", x0: -30, x1: -18, z0: -18, z1: -6, door: -24, color: 0xa855f7, title: "PHÒNG ĐẶC TẢ & DESIGN SYSTEM", who: "Hinata · Antigravity (Gemini)", fn: "Viết đặc tả sản phẩm, luồng AI Agent và Design System giao diện — Vùng [2]." },
  { id: "itachi", x0: -18, x1: -6, z0: -18, z1: -6, door: -12, color: 0x10b981, title: "PHÒNG KIẾN TRÚC", who: "Itachi · GPT Sol", fn: "Chọn công nghệ, thiết kế CSDL, API, chia Phase và điều kiện nghiệm thu — Vùng [1] & [3]." },
  { id: "sasuke", x0: 6, x1: 18, z0: -18, z1: -6, door: 12, color: 0x3b82f6, title: "PHÒNG LẬP TRÌNH", who: "Sasuke · Codex Astra", fn: "Viết code Backend, API, CSDL và AI Agent đúng kế hoạch, sửa lỗi rồi ghi CLAIM_FIXED." },
  { id: "sakura", x0: 18, x1: 30, z0: -18, z1: -6, door: 24, color: 0xec4899, title: "PHÒNG KIỂM DUYỆT", who: "Sakura · Claude", fn: "Phản biện kiến trúc, săn lỗi bảo mật & hiệu năng, chốt chặn blocker — Vùng [5]." },
  { id: "meet", x0: 6, x1: 18, z0: 6, z1: 18, door: 12, color: 0x64748b, title: "PHÒNG HỌP HỘI CHẨN", who: "Cả đội", fn: "Họp duyệt Phase, chốt blocker và hướng đi cùng CEO." },
  { id: "wcnam", x0: -42, x1: -30, z0: -18, z1: -6, door: -36, frosted: true, color: 0x0ea5e9, title: "NHÀ VỆ SINH NAM", who: "Khu tiện ích · cánh Tây", fn: "3 buồng vệ sinh, 2 bồn tiểu, bồn rửa tay có gương và máy sấy tay." },
  { id: "wcnu", x0: -42, x1: -30, z0: 6, z1: 18, door: -36, frosted: true, color: 0xf472b6, title: "NHÀ VỆ SINH NỮ", who: "Khu tiện ích · cánh Tây", fn: "4 buồng vệ sinh, bồn rửa tay, gương trang điểm và máy sấy tay." },
  { id: "gym", x0: 30, x1: 42, z0: -18, z1: -6, door: 36, color: 0xf97316, title: "PHÒNG GYM · CARDIO", who: "Cả đội · cánh Đông", fn: "3 máy chạy bộ, giá tạ tay, gương tập. Vận động giữa các lượt làm việc." },
  // CEO đổi phòng gym xà đơn thành phòng Kakashi (11/11/2026).
  { id: "kakashi", x0: 30, x1: 42, z0: 6, z1: 18, door: 36, color: 0xa1a1aa, title: "PHÒNG FRONTEND & UI/UX", who: "Kakashi · Antigravity (Gemini)", fn: "Dựng giao diện theo Design System: component, 5 trạng thái, responsive, bàn phím — ghi CLAIM_FIXED." },
  { id: "lounge", x0: 18, x1: 30, z0: 6, z1: 18, door: null, open: true, color: 0x22c55e, title: "GÓC THƯ GIÃN & PANTRY", who: "Cả đội", fn: "Nghỉ giải lao, pha cà phê, trò chuyện giữa các lượt làm việc." },
];
const ZONES = [
  ...ROOMS,
  { id: "lobby", x0: -6, x1: 6, z0: 6, z1: 18, color: 0xf59e0b, title: "SẢNH LỄ TÂN", who: "Cửa chính", fn: "Đón khách. Đi thẳng lên phía bắc là Sảnh danh dự." },
  { id: "atrium", x0: -6, x1: 6, z0: -18, z1: -6, color: 0xfbbf24, title: "SẢNH DANH DỰ", who: "Tường chữ", fn: "THẾ QUÂN ĐẸP TRAI." },
  { id: "hall", x0: -42, x1: 42, z0: -6, z1: 6, color: 0x94a3b8, title: "HÀNH LANG CHÍNH", who: "Nối các phòng", fn: "Bắc: Đặc tả, Kiến trúc, Lập trình, Kiểm duyệt. Nam: Giám đốc, Điều hành, Họp, Thư giãn. Cuối hành lang phía Tây: nhà vệ sinh; phía Đông: phòng gym và phòng Frontend & UI/UX." },
];

function plaqueTex(r) {
  return canvasTex(1024, 400, (g, w, h) => {
    g.fillStyle = "#0f172a"; g.fillRect(0, 0, w, h);
    g.fillStyle = css(r.color); g.fillRect(0, 0, w, 16); g.fillRect(0, 0, 14, h);
    g.textBaseline = "top";
    g.fillStyle = css(r.color); g.font = "bold 70px Segoe UI, sans-serif"; g.fillText(r.title, 44, 40);
    g.fillStyle = "#f8fafc"; g.font = "600 42px Segoe UI, sans-serif"; g.fillText(r.who, 44, 132);
    g.fillStyle = "#cbd5e1"; g.font = "36px Segoe UI, sans-serif"; wrapText(g, r.fn, 44, 205, 940, 48);
  });
}
// Biển phòng gắn trên cửa, quay ra hành lang; tự phát sáng nên đêm vẫn đọc được.
const plaques = [];
function plaque(r) {
  const north = r.z1 <= -6, z = north ? r.z1 + 0.06 : r.z0 - 0.06, x = r.door ?? (r.x0 + r.x1) / 2;
  const tex = plaqueTex(r);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(4.0, 1.56), new THREE.MeshStandardMaterial({ map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.55, transparent: true }));
  const back = new THREE.Mesh(m.geometry, std(0x0f172a, { transparent: true }));
  back.rotation.y = Math.PI; back.position.z = -0.01; m.add(back);
  plaques.push({ front: m, back });
  m.position.set(x, r.open ? 3.3 : 3.75, z); m.rotation.y = north ? 0 : Math.PI;
  inn.add(m);
  if (r.open) for (const sx of [-1.6, 1.6]) cyl(aluMat, 0.02, 0.02, H - 4.05, x + sx, (H + 4.05) / 2, z, inn, 6);
}

// Tường các phòng: dãy bắc (z -18..-6) cửa quay xuống hành lang; dãy nam (z 6..18) cửa quay lên.
for (const r of ROOMS) {
  const north = r.z1 <= -6;
  if (!r.open) partition(r.x0, north ? r.z1 : r.z0, r.x1, north ? r.z1 : r.z0, r.door, r.frosted ? frostMat : glassMat);
  rug(r.x0, r.x1, r.z0, r.z1, shade(r.color, -0.25));
  plaque(r);
}
for (const x of [-30, -18, -6, 6, 18, 30]) partition(x, -D / 2 + 0.2, x, -6, null, x === -30 ? frostMat : glassMat);
for (const x of [-30, -17, -6, 6, 18, 30]) partition(x, 6, x, D / 2 - 0.2, null, x === -30 ? frostMat : glassMat);
// Nhà vệ sinh: lót kính mờ phía trong mặt kính ngoài trời
for (const z of [-D / 2 + 0.15, D / 2 - 0.15]) box(frostMat, 12, H - 0.1, 0.05, -36, (H - 0.1) / 2, z, inn).renderOrder = 2;
for (const z of [-12, 12]) box(frostMat, 0.05, H - 0.1, 12, -W / 2 + 0.15, (H - 0.1) / 2, z, inn).renderOrder = 2;

// ---- Phòng Giám đốc (của bạn) ----
desk(-23.5, 12.5, 0, 0xf59e0b, { top: walnut, scale: 1.2 });
const nameTex = canvasTex(512, 96, (g, w, h) => { g.fillStyle = "#111827"; g.fillRect(0, 0, w, h); g.fillStyle = "#fbbf24"; g.font = "bold 52px Segoe UI, sans-serif"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText("THẾ QUÂN · CEO", w / 2, h / 2); });
const nameplate = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.17), new THREE.MeshStandardMaterial({ map: nameTex }));
nameplate.position.set(-23.5, 1.05, 11.75); nameplate.rotation.set(-0.3, Math.PI, 0); inn.add(nameplate);
box(walnut, 0.45, 2.3, 6, -29.4, 1.15, 12, inn); solidBox(-29.7, 9, -29.1, 15);
for (let i = 0; i < 8; i++) box(std(pick([0x1d4ed8, 0xb91c1c, 0x15803d, 0xf59e0b, 0x334155])), 0.32, 0.5, 0.6, -29.1, 1.75 - (i % 2) * 0.7, 9.6 + i * 0.68, inn);
chair(-24.6, 10.2, Math.PI); chair(-22.4, 10.2, Math.PI);
sofa(-20, 17.0, 3.6, 0, 0x7c2d12);
cyl(aluMat, 0.03, 0.03, 3.2, -28.8, 1.6, 16.8, inn, 8);
const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.7), std(0xf97316, { side: THREE.DoubleSide, roughness: 0.8 }));
flag.position.set(-28.25, 2.85, 16.8); inn.add(flag);
plant(-17.9, 17.2, 1.2);

// ---- Phòng Điều hành (Pain) ----
desk(-11.5, 12.5, 0, 0xef4444, { chairToo: false, screens: 2 });
board(-16.4, 12, Math.PI / 2, boardTex("kanban", 0xef4444));
plant(-6.9, 17.2, 1.1);

// ---- Dãy bắc ----
desk(-24, -12.5, Math.PI, 0xa855f7, { chairToo: false });
board(-29.4, -12, Math.PI / 2, boardTex("design", 0xa855f7));
plant(-18.9, -17.2, 1.1);

desk(-12, -12.5, Math.PI, 0x10b981, { chairToo: false });
board(-17.4, -12, Math.PI / 2, boardTex("arch", 0x10b981));
box(walnut, 4, 2.2, 0.45, -10, 1.1, -17.4, inn); solidBox(-12, -17.7, -8, -17.1);
for (let i = 0; i < 6; i++) box(std(pick([0x065f46, 0x1e293b, 0xb91c1c, 0xf59e0b])), 0.5, 0.45, 0.3, -11.6 + i * 0.62, 1.6, -17.3, inn);

desk(12, -12.5, Math.PI, 0x3b82f6, { chairToo: false, screens: 3 });
const ledMats = [];
for (const z of [-16.9, -15.8]) {
  box(dark, 0.8, 2.1, 0.9, 16.9, 1.05, z, inn); solidBox(16.5, z - 0.45, 17.3, z + 0.45);
  for (let i = 0; i < 8; i++) {
    const m = new THREE.MeshStandardMaterial({ color: 0x0b1220, emissive: i % 3 ? 0x22c55e : 0x38bdf8, emissiveIntensity: 1 });
    ledMats.push(m);
    const l = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.02), m); l.position.set(16.48, 0.4 + i * 0.22, z + 0.25); l.rotation.y = -Math.PI / 2; inn.add(l);
  }
}
plant(6.9, -17.2, 1.1);

desk(24, -12.5, Math.PI, 0xec4899, { chairToo: false, screens: 2 });
board(29.4, -12, -Math.PI / 2, boardTex("audit", 0xec4899));
plant(18.9, -17.2, 1.1);

// ---- Phòng Frontend & UI/UX (Kakashi), cánh Đông dãy nam ----
desk(36, 12.5, 0, 0xa1a1aa, { chairToo: false, screens: 3 });
board(41.4, 12, -Math.PI / 2, boardTex("frontend", 0x71717a));
plant(30.9, 17.2, 1.1);

// ---- Phòng họp ----
const MT = { x: 12, z: 12.5 };
cyl(white, 2.0, 2.0, 0.08, MT.x, 0.76, MT.z, inn, 48);
cyl(aluMat, 0.12, 0.45, 0.72, MT.x, 0.36, MT.z, inn, 16);
for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; chair(MT.x + Math.cos(a) * 2.6, MT.z + Math.sin(a) * 2.6, -a - Math.PI / 2); }
solidCircle(MT.x, MT.z, 2.9);
box(dark, 3.4, 1.9, 0.08, MT.x, 2.1, 17.4, inn);
const tv = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 1.75), new THREE.MeshStandardMaterial({ color: 0x0b1220, emissive: 0x2563eb, emissiveIntensity: 0.5 }));
tv.position.set(MT.x, 2.1, 17.34); tv.rotation.y = Math.PI; inn.add(tv);
box(dark, 0.3, 1.2, 0.3, MT.x, 0.6, 17.4, inn); solidBox(MT.x - 1.7, 17.2, MT.x + 1.7, 17.6);

// ---- Góc thư giãn & pantry (mở ra hành lang) ----
sofa(22.5, 16.6, 4.6, 0);
sofa(19.3, 13.3, 3.4, -Math.PI / 2);
cyl(walnut, 0.9, 0.9, 0.06, 22.5, 0.45, 13.4, inn, 32); cyl(aluMat, 0.05, 0.05, 0.42, 22.5, 0.22, 13.4, inn, 8); solidCircle(22.5, 13.4, 0.95);
box(white, 0.9, 0.95, 9, 29.3, 0.48, 12.5, inn); box(dark, 1.0, 0.05, 9.1, 29.3, 0.98, 12.5, inn); box(white, 0.6, 0.9, 9, 29.6, 2.6, 12.5, inn);
solidBox(28.8, 8, 29.8, 17);
box(std(0xd1d5db, { roughness: 0.3, metalness: 0.6 }), 0.9, 2.1, 1.0, 29.3, 1.05, 7.2, inn); solidBox(28.8, 6.7, 29.8, 7.7);
for (const z of [10.5, 12, 13.5]) { cyl(dark, 0.22, 0.22, 0.06, 27.9, 0.75, z, inn, 16); cyl(aluMat, 0.03, 0.03, 0.72, 27.9, 0.38, z, inn, 6); }
const shadeMat = std(0xfff7e6, { emissive: 0xffe2b0, emissiveIntensity: 0.5, roughness: 0.6 });
cyl(aluMat, 0.03, 0.03, 1.7, 25.5, 0.85, 16.8, inn, 8); cyl(shadeMat, 0.25, 0.35, 0.4, 25.5, 1.8, 16.8, inn, 20);

// ---- Sảnh lễ tân ----
box(white, 4.4, 1.1, 0.9, 3.6, 0.55, 11, inn); box(oak, 4.6, 0.06, 1.1, 3.6, 1.13, 11, inn);
solidBox(1.3, 10.4, 5.9, 11.6);
chair(3.6, 10, Math.PI);
sofa(-4.6, 12, 3.2, -Math.PI / 2, 0x0f766e);
plant(5.2, 17.2, 1.3); plant(-5.2, 17.2, 1.3);

// ---- Hành lang ----
box(std(0x334155, { roughness: 1 }), W - 4, 0.02, 3.2, 0, 0.01, 0, inn).castShadow = false;
for (const x of [-27, -14, 14, 27]) plant(x, -4.9, 1);
bench(-20, 4.6, Math.PI, inn); bench(20, 4.6, Math.PI, inn);

// ---- Sảnh danh dự: tường chữ THẾ QUÂN ĐẸP TRAI ----
const logoTex = canvasTex(1600, 620, (g, w, h) => {
  g.textAlign = "center"; g.textBaseline = "middle";
  g.fillStyle = "#e2e8f0"; g.font = "600 70px Segoe UI, sans-serif"; g.fillText("VĂN PHÒNG AI", w / 2, 92);
  const grad = g.createLinearGradient(0, 200, 0, 470);
  grad.addColorStop(0, "#fff7c2"); grad.addColorStop(0.45, "#fbbf24"); grad.addColorStop(1, "#d97706");
  g.font = "900 168px Segoe UI, sans-serif";
  g.shadowColor = "rgba(251, 191, 36, 0.9)"; g.shadowBlur = 40;
  g.lineWidth = 10; g.strokeStyle = "#7c2d12"; g.strokeText("THẾ QUÂN", w / 2, 270);
  g.fillStyle = grad; g.fillText("THẾ QUÂN", w / 2, 270);
  g.strokeText("ĐẸP TRAI", w / 2, 450); g.fillText("ĐẸP TRAI", w / 2, 450);
  g.shadowBlur = 0; g.fillStyle = "#fbbf24";
  for (const [x, y, s] of [[180, 230, 26], [1420, 210, 32], [250, 470, 20], [1360, 480, 24], [800, 560, 18]]) {
    g.beginPath(); for (let i = 0; i < 8; i++) { const r = i % 2 ? s * 0.35 : s, a = (i / 8) * Math.PI * 2; g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); } g.fill();
  }
});
const logoMat = new THREE.MeshStandardMaterial({ map: logoTex, emissive: 0xffffff, emissiveMap: logoTex, emissiveIntensity: 0.7, transparent: true });
const logo = new THREE.Mesh(new THREE.PlaneGeometry(11.4, 4.4), logoMat);
logo.position.set(0, 2.55, -D / 2 + 0.2); inn.add(logo);
box(std(0xfbbf24, { emissive: 0xf59e0b, emissiveIntensity: 1.2 }), 11.6, 0.06, 0.12, 0, 0.06, -D / 2 + 0.3, inn).castShadow = false;
const logoLight = new THREE.SpotLight(0xffe2a8, 60, 16, 0.6, 0.6, 1.4);
logoLight.position.set(0, 4.6, -11); logoLight.target.position.set(0, 2.5, -D / 2); inn.add(logoLight, logoLight.target);
plant(-5, -14.5, 1.4); plant(5, -14.5, 1.4);

// ---- Đèn trần: thanh LED (sáng hơn khi trời tối) + đèn điểm không đổ bóng để nhẹ máy ----
const ledMat = std(0xffffff, { emissive: 0xfff3d6, emissiveIntensity: 0.6, roughness: 0.3 });
for (const r of ZONES) {
  if (r.id === "hall") { for (const x of [-36, -20, 0, 20, 36]) box(ledMat, 10, 0.05, 0.22, x, H - 0.05, 0, inn).castShadow = false; continue; }
  box(ledMat, 5, 0.05, 0.22, (r.x0 + r.x1) / 2, H - 0.05, (r.z0 + r.z1) / 2, inn).castShadow = false;
}
const roomLights = [];
for (const [x, z] of [[-24, -12], [-12, -12], [12, -12], [24, -12], [-23.5, 12], [-11.5, 12], [36, 12], [-15, 0], [15, 0], [-36, 0], [36, 0]]) {
  const p = new THREE.PointLight(0xffe7c4, 6, 18, 1.6);
  p.position.set(x, H - 0.6, z); inn.add(p); roomLights.push(p);
}

// ================= Nhân vật =================
const CG = {
  leg: (() => { const g = new THREE.CapsuleGeometry(0.11, 0.62, 4, 10); g.translate(0, -0.42, 0); return g; })(),
  arm: (() => { const g = new THREE.CapsuleGeometry(0.085, 0.5, 4, 10); g.translate(0, -0.33, 0); return g; })(),
  torso: new THREE.CapsuleGeometry(0.26, 0.38, 6, 14),
  head: new THREE.SphereGeometry(0.22, 24, 18),
  cap: new THREE.SphereGeometry(0.235, 22, 12, 0, Math.PI * 2, 0, Math.PI * 0.55),
  eye: new THREE.SphereGeometry(0.03, 8, 6),
  hand: new THREE.SphereGeometry(0.075, 10, 8),
  shoe: new THREE.BoxGeometry(0.2, 0.1, 0.3),
  spike: new THREE.ConeGeometry(0.075, 0.26, 6),
  cloak: new THREE.CylinderGeometry(0.31, 0.39, 1.0, 20, 1, true),
};
function spikes(head, mat, n, back = false) {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2, d = back
      ? new THREE.Vector3(Math.sin(a) * 0.6, 0.3 + Math.cos(a) * 0.4, -0.8).normalize()
      : new THREE.Vector3(Math.cos(a) * 0.75, 0.6, Math.sin(a) * 0.75 - 0.15).normalize();
    const s = new THREE.Mesh(CG.spike, mat);
    s.position.copy(d).multiplyScalar(0.22).add(new THREE.Vector3(0, 0.04, 0));
    s.quaternion.setFromUnitVectors(UP, d); s.castShadow = true;
    head.add(s);
  }
}
const HAIR = {
  spiky: (h, m) => spikes(h, m, 11),
  back: (h, m) => spikes(h, m, 7, true),
  long: (h, m) => { box(m, 0.44, 0.6, 0.12, 0, -0.18, -0.15, h); box(m, 0.42, 0.08, 0.1, 0, 0.17, 0.17, h); },
  bob: (h, m) => { const b = new THREE.Mesh(CG.head, m); b.scale.set(1.12, 0.75, 1.05); b.position.set(0, -0.03, -0.05); b.castShadow = true; h.add(b); },
  pony: (h, m) => { const t = cyl(m, 0.05, 0.035, 0.42, 0, -0.18, -0.24, h, 8); t.rotation.x = 0.35; },
};
const eyeDark = std(0x111827, { roughness: 0.3 });
function makeChar(o) {
  const root = new THREE.Group(); root.userData.live = true;
  const body = new THREE.Group(); body.scale.setScalar(0.85); root.add(body);
  const M = (c, extra) => std(c, { roughness: 0.65, ...extra });
  const skin = M(0xf1c9a5), top = M(o.top), pants = M(o.pants ?? 0x1f2937), shoes = M(0x111827), hair = M(o.hair, { roughness: 0.5 });
  const mk = (geo, mat, x, y, z, parent = body) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; parent.add(m); return m; };
  const legs = [-0.13, 0.13].map((x) => { const g = new THREE.Group(); g.position.set(x, 0.92, 0); body.add(g); mk(CG.leg, pants, 0, 0, 0, g); mk(CG.shoe, shoes, 0, -0.86, 0.05, g); return g; });
  mk(CG.torso, top, 0, 1.33, 0).scale.set(1, 1, 0.72);
  const arms = [-0.36, 0.36].map((x) => { const g = new THREE.Group(); g.position.set(x, 1.64, 0); g.rotation.z = x < 0 ? -0.08 : 0.08; body.add(g); mk(CG.arm, o.sleeve ? M(o.sleeve) : top, 0, 0, 0, g); mk(CG.hand, skin, 0, -0.7, 0, g); return g; });
  const head = new THREE.Group(); head.position.y = 1.98; body.add(head);
  mk(CG.head, skin, 0, 0, 0, head);
  const eyeM = o.eye ? std(o.eye, { roughness: 0.3 }) : eyeDark;
  for (const x of [-0.075, 0.075]) mk(CG.eye, eyeM, x, 0.02, 0.2, head);
  mk(CG.cap, hair, 0, 0.03, -0.015, head);
  HAIR[o.hairStyle](head, hair);
  if (o.cloak) {
    const c = mk(CG.cloak, M(o.cloak, { side: THREE.DoubleSide }), 0, 1.2, 0); c.scale.z = 0.78;
    const trim = new THREE.Mesh(new THREE.CylinderGeometry(0.395, 0.4, 0.12, 20, 1, true), M(o.trim, { side: THREE.DoubleSide }));
    trim.position.y = -0.45; trim.castShadow = true; c.add(trim);
  }
  return { root, body, legs, arms, head, phase: 0, speed: 0 };
}
function animateChar(c, dt, t) {
  const amt = clamp(c.speed / 4.2, 0, 1.5);
  c.phase += dt * (3 + c.speed * 2.1);
  const s = Math.sin(c.phase) * 0.7 * Math.min(amt, 1.15);
  c.legs[0].rotation.x = s; c.legs[1].rotation.x = -s;
  c.arms[0].rotation.x = -s * 0.85; c.arms[1].rotation.x = s * 0.85;
  c.body.position.y = Math.abs(Math.cos(c.phase)) * 0.07 * Math.min(amt, 1) + Math.sin(t * 2.2) * 0.012 * (1 - Math.min(amt, 1));
  if (c.busy && amt < 0.2) { c.arms[0].rotation.x = Math.sin(t * 16) * 0.3 - 0.9; c.arms[1].rotation.x = Math.sin(t * 16 + 1.5) * 0.3 - 0.9; }
}

// Người chơi: Thế Quân (áo choàng Hokage trắng viền cam, tóc vàng dựng)
const hero = makeChar({ hair: 0xfacc15, hairStyle: "spiky", top: 0xf97316, sleeve: 0x111827, pants: 0x1f2937, cloak: 0xf8fafc, trim: 0xea580c });
scene.add(hero.root);
// Nhãn tên kèm bong bóng: .req là việc được giao (luôn hiện), .say là câu nói khi lại gần.
function makeTag(text, color, line, id) {
  const tag = document.createElement("div");
  tag.className = "vp-lbl"; tag.style.background = css(color);
  tag.innerHTML = `<div class="req"><small></small><span></span></div><div></div><div class="say"></div>`;
  tag.children[1].textContent = text; tag.children[2].textContent = line || "";
  if (opts.onNpcClick) { tag.classList.add("click"); tag.addEventListener("click", () => opts.onNpcClick(id)); }
  return tag;
}
const heroTag = makeTag("Thế Quân (bạn)", 0xfbbf24, "", "ceo");
const heroLabel = new CSS2DObject(heroTag); heroLabel.position.set(0, 2.2, 0); hero.root.add(heroLabel);

// Các AI đứng ở bàn phòng mình, quay mặt ra cửa; lại gần thì quay sang nhìn và nói một câu.
const NPCS = [
  { room: "pain", name: "Pain · Tổng quản lý", color: 0xef4444, x: -11.5, z: 13.35, rot: Math.PI, look: { hair: 0xea580c, hairStyle: "spiky", top: 0x111827, cloak: 0x0b0b0f, trim: 0xb91c1c }, line: "Tôi điều phối chu trình: giao lượt theo NEXT_OWNER trong agent.md và báo cáo CEO." },
  { room: "hinata", name: "Hinata · Antigravity", color: 0xa855f7, x: -24, z: -13.35, rot: 0, look: { hair: 0x1e1b4b, hairStyle: "long", top: 0xe9e3f5, pants: 0x4c1d95, eye: 0xe0e7ff }, line: "Tôi viết đặc tả sản phẩm và thiết kế giao diện (Vùng [2])." },
  { room: "itachi", name: "Itachi · GPT Sol", color: 0x10b981, x: -12, z: -13.35, rot: 0, look: { hair: 0x0f172a, hairStyle: "pony", top: 0x111827, cloak: 0x0b0b0f, trim: 0xb91c1c, eye: 0xdc2626 }, line: "Tôi lập kiến trúc: công nghệ, CSDL, API và chia Phase (Vùng [1], [3])." },
  { room: "sasuke", name: "Sasuke · Codex Astra", color: 0x3b82f6, x: 12, z: -13.35, rot: 0, look: { hair: 0x0f172a, hairStyle: "back", top: 0xe2e8f0, pants: 0x1e3a8a }, line: "Tôi viết code theo kế hoạch đã duyệt và ghi CLAIM_FIXED." },
  { room: "kakashi", name: "Kakashi · Antigravity", color: 0xa1a1aa, x: 36, z: 13.35, rot: Math.PI, look: { hair: 0xe5e7eb, hairStyle: "spiky", top: 0x3f6212, pants: 0x1e293b, eye: 0x111827 }, line: "Tôi dựng giao diện theo Design System, đủ 5 trạng thái và chạy tốt trên mọi màn hình." },
  { room: "sakura", name: "Sakura · Claude", color: 0xec4899, x: 24, z: -13.35, rot: 0, look: { hair: 0xf9a8d4, hairStyle: "bob", top: 0xdc2626, pants: 0x1f2937, eye: 0x15803d }, line: "Tôi kiểm duyệt kiến trúc, bảo mật và giữ chốt chặn Vùng [5]." },
];
for (const n of NPCS) {
  n.c = makeChar(n.look);
  n.c.root.position.set(n.x, BASE, n.z); n.c.root.rotation.y = n.rot; n.yaw = n.rot;
  scene.add(n.c.root);
  solidCircle(n.x, n.z, 0.4);
  const tag = makeTag(n.name, n.color, n.line, n.room);
  const l = new CSS2DObject(tag); l.position.set(0, 2.2, 0); n.c.root.add(l);
  n.tag = tag;
}


// ================= Chi tiết vui nhộn =================
const funTick = [];   // các hàm chạy mỗi khung hình cho đồ trang trí có chuyển động
const steamTex = canvasTex(64, 64, (g) => {
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, "rgba(255,255,255,0.8)"); gr.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
});
const yellow = std(0xfacc15, { roughness: 0.35 }), orangeBeak = std(0xf97316, { roughness: 0.4 });
const gold = std(0xfbbf24, { roughness: 0.22, metalness: 1, envMapIntensity: 1.1 });
const near = (x, z, r) => Math.hypot(player.pos.x - x, player.pos.z - z) < r;

// Vịt cao su trên bàn mỗi AI ("debug vịt")
function duck(x, y, z, ry) {
  const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = ry; inn.add(g);
  const b = new THREE.Mesh(new THREE.SphereGeometry(0.08, 14, 10), yellow); b.scale.set(1, 0.8, 1.25); b.position.y = 0.06; g.add(b);
  const hd = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 10), yellow); hd.position.set(0, 0.14, 0.06); g.add(hd);
  const bk = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.05, 8), orangeBeak); bk.rotation.x = Math.PI / 2; bk.position.set(0, 0.135, 0.12); g.add(bk);
  for (const m of [b, hd, bk]) m.castShadow = true;
}
for (const x of [-24, -12, 12, 24]) duck(x + 0.85, 0.78, -12.05, 0);
duck(-12.35, 0.78, 12.05, Math.PI);
duck(35.15, 0.78, 12.05, Math.PI);
duck(-24.8, 0.92, 11.85, Math.PI);

// Biển vui dựng trong hành lang
function poster(x, z, ry, top, bottom, hex) {
  const tex = canvasTex(400, 520, (g, w, h) => {
    g.fillStyle = css(hex); g.fillRect(0, 0, w, h);
    g.fillStyle = "rgba(255,255,255,0.15)"; for (let i = 0; i < 6; i++) { g.beginPath(); g.arc(rnd() * w, rnd() * h, 30 + rnd() * 60, 0, Math.PI * 2); g.fill(); }
    g.fillStyle = "#fff"; g.textAlign = "center"; g.textBaseline = "middle";
    g.font = "900 54px Segoe UI, sans-serif"; wrapLines(g, top, w / 2, 170, 64);
    g.font = "600 34px Segoe UI, sans-serif"; wrapLines(g, bottom, w / 2, 380, 44);
  });
  const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ry; inn.add(g);
  box(dark, 1.16, 1.5, 0.05, 0, 1.45, 0, g);
  const pl = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.43), new THREE.MeshStandardMaterial({ map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.25 }));
  pl.position.set(0, 1.45, 0.03); g.add(pl);
  cyl(aluMat, 0.02, 0.02, 0.7, 0, 0.35, 0, g, 6); box(dark, 0.5, 0.04, 0.3, 0, 0.02, 0, g);
  solidBox(x - 0.6, z - 0.2, x + 0.6, z + 0.2);
}
function wrapLines(g, text, x, y, lh) { const lines = text.split("\n"); lines.forEach((l, i) => g.fillText(l, x, y + (i - (lines.length - 1) / 2) * lh)); }
poster(-18, -5.35, 0, "KHÔNG CÓ\nBUG", "chỉ có tính năng\nbất ngờ", 0x7c3aed);
poster(18, -5.35, 0, "COMMIT\nSỚM", "về nhà sớm", 0x0ea5e9);
poster(-17, 5.35, Math.PI, "HÔM NAY", "CEO vẫn\nđẹp trai ✨", 0xf59e0b);
poster(17.2, 5.35, Math.PI, "UỐNG\nNƯỚC ĐI", "code chạy\nmượt hơn", 0x10b981);

// Dây đèn màu nhấp nháy dọc trần hành lang
{
  const bulbs = [], wire = [];
  for (let x = -40; x <= 40; x += 4) {
    const pts = [];
    for (let i = 0; i <= 12; i++) {
      const u = i / 12, z = -5.6 + u * 11.2, y = H - 0.25 - Math.sin(u * Math.PI) * 0.6;
      pts.push(x + Math.sin(u * Math.PI) * 0.3, y, z);
      if (i > 0 && i < 12) bulbs.push([x + Math.sin(u * Math.PI) * 0.3, y - 0.08, z]);
    }
    for (let i = 0; i < 12; i++) wire.push(...pts.slice(i * 3, i * 3 + 6));
  }
  const wg = new THREE.BufferGeometry(); wg.setAttribute("position", new THREE.Float32BufferAttribute(wire, 3));
  inn.add(new THREE.LineSegments(wg, new THREE.LineBasicMaterial({ color: 0x334155 })));
  const COLORS = [0xf43f5e, 0xfacc15, 0x22c55e, 0x38bdf8, 0xa855f7, 0xfb923c].map((c) => new THREE.Color(c));
  const lights = new THREE.InstancedMesh(new THREE.SphereGeometry(0.07, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff }), bulbs.length);
  bulbs.forEach(([x, y, z], i) => lights.setMatrixAt(i, m4.makeTranslation(x, y, z)));
  inn.add(lights);
  const c = new THREE.Color();
  funTick.push((dt, t) => {
    for (let i = 0; i < bulbs.length; i++) {
      const k = 0.45 + 0.55 * Math.max(0, Math.sin(t * 2.4 + i * 1.7));
      lights.setColorAt(i, c.copy(COLORS[i % COLORS.length]).multiplyScalar(k));
    }
    lights.instanceColor.needsUpdate = true;
  });
}

// Bóng bay buộc ở sảnh, nhấp nhô
for (const [bx, bz] of [[-2.8, 16.4], [2.8, 16.4]]) {
  box(dark, 0.25, 0.12, 0.25, bx, 0.06, bz, inn);
  const strings = [], balloons = [];
  [0xf43f5e, 0x38bdf8, 0xfacc15].forEach((hex, i) => {
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.28, 18, 14), std(hex, { roughness: 0.25 }));
    b.scale.set(1, 1.18, 1); b.castShadow = true; b.userData.live = true; inn.add(b); balloons.push({ b, i, ox: (i - 1) * 0.35, oy: 2.7 + i * 0.35 });
    const lg = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
    const ln = new THREE.Line(lg, new THREE.LineBasicMaterial({ color: 0xe2e8f0 })); inn.add(ln); strings.push(ln);
  });
  solidCircle(bx, bz, 0.25);
  funTick.push((dt, t) => balloons.forEach(({ b, i, ox, oy }, k) => {
    const x = bx + ox + Math.sin(t * 0.9 + i) * 0.08, y = oy + Math.sin(t * 1.4 + i * 2) * 0.08, z = bz + Math.cos(t * 0.8 + i) * 0.08;
    b.position.set(x, y, z);
    const pos = strings[k].geometry.attributes.position;
    pos.setXYZ(0, bx, 0.12, bz); pos.setXYZ(1, x, y - 0.33, z); pos.needsUpdate = true;
  }));
}

// Bể cá ở sảnh
{
  const fx = -5.45, fz = 8;
  box(walnut, 0.6, 0.9, 2.1, fx, 0.45, fz, inn);
  const water = box(new THREE.MeshStandardMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.32, roughness: 0.05 }), 0.5, 0.75, 1.95, fx, 1.3, fz, inn);
  water.castShadow = false; water.renderOrder = 3;
  box(std(0xd6c7a1, { roughness: 1 }), 0.48, 0.06, 1.93, fx, 0.96, fz, inn);
  box(metal, 0.54, 0.04, 2.0, fx, 1.69, fz, inn);
  const fishes = [0xf97316, 0xfacc15, 0xef4444, 0x60a5fa].map((hex, i) => {
    const g = new THREE.Group(); g.userData.live = true; inn.add(g);
    const m = std(hex, { roughness: 0.4 });
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), m); body.scale.set(0.6, 0.8, 1.4); g.add(body);
    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.08, 6), m); tail.rotation.x = -Math.PI / 2; tail.position.z = -0.1; g.add(tail);
    return { g, tail, phase: i * 1.6, y: 1.1 + i * 0.12, sp: 0.35 + i * 0.07 };
  });
  solidBox(fx - 0.3, fz - 1.05, fx + 0.3, fz + 1.05);
  funTick.push((dt, t) => fishes.forEach((f) => {
    const s = Math.sin(t * f.sp + f.phase), dir = Math.cos(t * f.sp + f.phase);
    f.g.position.set(fx + Math.sin(t * 1.3 + f.phase) * 0.12, f.y + Math.sin(t * 2 + f.phase) * 0.04, fz + s * 0.8);
    f.g.rotation.y = dir >= 0 ? 0 : Math.PI;
    f.tail.rotation.y = Math.sin(t * 12 + f.phase) * 0.5;
  }));
}

// Cúp vàng "Giải Đẹp Trai Nhất Năm" giữa sảnh danh dự
{
  const tx = 0, tz = -10.6;
  box(std(0xf1f5f9, { roughness: 0.3 }), 1.0, 1.0, 1.0, tx, 0.5, tz, inn);
  const plateTex = canvasTex(512, 256, (g, w, h) => {
    g.fillStyle = "#111827"; g.fillRect(0, 0, w, h);
    g.fillStyle = "#fbbf24"; g.textAlign = "center"; g.textBaseline = "middle";
    g.font = "800 46px Segoe UI, sans-serif"; g.fillText("GIẢI ĐẸP TRAI", w / 2, 80); g.fillText("NHẤT NĂM", w / 2, 135);
    g.fillStyle = "#f8fafc"; g.font = "600 34px Segoe UI, sans-serif"; g.fillText("Thế Quân CEO", w / 2, 200);
  });
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.4), new THREE.MeshStandardMaterial({ map: plateTex, emissive: 0xffffff, emissiveMap: plateTex, emissiveIntensity: 0.3 }));
  plate.position.set(tx, 0.55, tz + 0.505); inn.add(plate);
  const cup = new THREE.Group(); cup.userData.live = true; cup.position.set(tx, 1.0, tz); inn.add(cup);
  const profile = [[0, 0], [0.22, 0], [0.22, 0.05], [0.08, 0.1], [0.05, 0.3], [0.08, 0.35], [0.25, 0.45], [0.3, 0.75], [0.27, 0.78]].map(([x, y]) => new THREE.Vector2(x, y));
  const body = new THREE.Mesh(new THREE.LatheGeometry(profile, 40), gold); body.castShadow = true; cup.add(body);
  for (const sx of [-1, 1]) { const hdl = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.025, 8, 20, Math.PI * 1.2), gold); hdl.position.set(sx * 0.3, 0.6, 0); hdl.rotation.z = sx > 0 ? -Math.PI * 0.6 : Math.PI * 1.6; cup.add(hdl); }
  const star = new THREE.Mesh(new THREE.OctahedronGeometry(0.1, 0), gold); star.position.y = 0.95; cup.add(star);
  solidCircle(tx, tz, 0.75);
  funTick.push((dt, t) => { cup.rotation.y = t * 0.5; star.position.y = 0.95 + Math.sin(t * 2) * 0.04; });
}

// Bàn bóng bàn trong hành lang, bóng nảy qua lại
{
  const px = 24, pz = 0.8;
  box(std(0x1e7a4f, { roughness: 0.5 }), 2.74, 0.05, 1.52, px, 0.76, pz, inn);
  box(white, 2.74, 0.052, 0.03, px, 0.762, pz, inn).castShadow = false;
  box(std(0xffffff, { transparent: true, opacity: 0.6 }), 0.02, 0.15, 1.6, px, 0.86, pz, inn);
  for (const [lx, lz] of [[-1.2, -0.65], [1.2, -0.65], [-1.2, 0.65], [1.2, 0.65]]) box(metal, 0.06, 0.74, 0.06, px + lx, 0.37, pz + lz, inn);
  for (const sx of [-1, 1]) { const pd = cyl(std(0xdc2626), 0.08, 0.08, 0.015, px + sx * 1.1, 0.8, pz + 0.4 * sx, inn, 16); pd.rotation.z = Math.PI / 2 * 0.2; }
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.025, 10, 8), std(0xffffff, { emissive: 0xffffff, emissiveIntensity: 0.3 }));
  ball.userData.live = true; inn.add(ball);
  solidBox(px - 1.4, pz - 0.8, px + 1.4, pz + 0.8);
  funTick.push((dt, t) => {
    const u = (t * 0.7) % 2, s = u < 1 ? u : 2 - u;   // qua lại giữa hai đầu bàn
    ball.position.set(px - 1.2 + s * 2.4, 0.8 + Math.abs(Math.sin(s * Math.PI * 2)) * 0.35, pz + Math.sin(t * 1.3) * 0.4);
  });
}

// Máy chơi game và ghế lười ở góc thư giãn
{
  const g = new THREE.Group(); g.position.set(19.2, 0, 7.6); g.rotation.y = Math.PI / 2; inn.add(g);
  box(std(0x7c3aed, { roughness: 0.5 }), 0.85, 1.9, 0.75, 0, 0.95, 0, g);
  box(dark, 0.86, 0.3, 0.5, 0, 1.0, 0.25, g);
  const scr = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0x22d3ee, emissiveIntensity: 0.9 });
  const sp = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.48), scr); sp.position.set(0, 1.45, 0.38); g.add(sp);
  const mq = canvasTex(256, 64, (c, w, h) => { c.fillStyle = "#111827"; c.fillRect(0, 0, w, h); c.fillStyle = "#facc15"; c.font = "900 34px Segoe UI, sans-serif"; c.textAlign = "center"; c.textBaseline = "middle"; c.fillText("BUG HUNTER", w / 2, h / 2); });
  const mqm = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.2), new THREE.MeshStandardMaterial({ map: mq, emissive: 0xffffff, emissiveMap: mq, emissiveIntensity: 0.8 })); mqm.position.set(0, 1.78, 0.38); g.add(mqm);
  const stick = cyl(dark, 0.015, 0.015, 0.12, -0.12, 1.21, 0.38, g, 6); stick.rotation.x = 0.2;
  for (const [bx, hex] of [[0.08, 0xef4444], [0.18, 0x22c55e]]) cyl(std(hex, { emissive: hex, emissiveIntensity: 0.4 }), 0.03, 0.03, 0.02, bx, 1.16, 0.4, g, 10);
  solidBox(18.8, 7.2, 19.6, 8.05);
  const hues = [0x22d3ee, 0xf472b6, 0xfacc15, 0x4ade80];
  funTick.push((dt, t) => { scr.emissive.setHex(hues[Math.floor(t * 1.5) % hues.length]); });
  for (const [bx, bz, hex] of [[24.2, 8.7, 0xec4899], [25.8, 9.8, 0x14b8a6], [21.6, 9.4, 0xf59e0b]]) {
    const bag = new THREE.Mesh(new THREE.SphereGeometry(0.55, 20, 14), std(hex, { roughness: 0.9 }));
    bag.scale.set(1, 0.62, 1); bag.position.set(bx, 0.34, bz); bag.castShadow = bag.receiveShadow = true; inn.add(bag);
    solidCircle(bx, bz, 0.55);
  }
}

// Máy pha cà phê bốc hơi ở pantry
{
  const cx = 29.3, cz = 10.8;
  box(std(0x111827, { roughness: 0.3, metalness: 0.4 }), 0.42, 0.55, 0.45, cx, 1.28, cz, inn);
  cyl(white, 0.05, 0.04, 0.1, cx - 0.1, 1.06, cz, inn, 12);
  const puffs = [0, 1, 2, 3].map(() => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: steamTex, transparent: true, depthWrite: false })); s.scale.setScalar(0.18); inn.add(s); return s; });
  funTick.push((dt, t) => puffs.forEach((s, i) => {
    const u = (t * 0.35 + i / puffs.length) % 1;
    s.position.set(cx - 0.1 + Math.sin(t * 2 + i) * 0.04, 1.16 + u * 0.7, cz + Math.cos(t * 1.7 + i) * 0.04);
    s.material.opacity = 0.55 * Math.sin(u * Math.PI); s.scale.setScalar(0.12 + u * 0.25);
  }));
}

// Mèo văn phòng đi dạo hành lang & sảnh, gặp bạn thì ngồi xuống "meo"
{
  const fur = std(0xf59e0b, { roughness: 0.85 }), belly = std(0xfff7ed, { roughness: 0.85 });
  const cat = new THREE.Group(); cat.userData.live = true; scene.add(cat);
  const mk = (geo, mat, x, y, z, parent = cat) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; parent.add(m); return m; };
  const body = mk(new THREE.CapsuleGeometry(0.15, 0.36, 4, 10), fur, 0, 0.3, 0); body.rotation.x = Math.PI / 2;
  const head = new THREE.Group(); head.position.set(0, 0.45, 0.3); cat.add(head);
  mk(new THREE.SphereGeometry(0.14, 16, 12), fur, 0, 0, 0, head);
  for (const sx of [-1, 1]) {
    const ear = mk(new THREE.ConeGeometry(0.05, 0.1, 4), fur, sx * 0.075, 0.13, 0, head); ear.rotation.z = -sx * 0.25;
    mk(new THREE.SphereGeometry(0.022, 8, 6), eyeDark, sx * 0.05, 0.03, 0.12, head);
  }
  mk(new THREE.SphereGeometry(0.018, 8, 6), std(0xf472b6), 0, -0.01, 0.14, head);
  const legs = [[-0.08, 0.16], [0.08, 0.16], [-0.08, -0.16], [0.08, -0.16]].map(([x, z]) => {
    const g = new THREE.Group(); g.position.set(x, 0.24, z); cat.add(g);
    const l = mk(new THREE.CylinderGeometry(0.035, 0.035, 0.24, 8), belly, 0, -0.12, 0, g); l.castShadow = true;
    return g;
  });
  const tail = new THREE.Group(); tail.position.set(0, 0.35, -0.3); cat.add(tail);
  const tl = mk(new THREE.CylinderGeometry(0.025, 0.035, 0.42, 8), fur, 0, 0.2, -0.05, tail); tl.rotation.x = -0.35;
  const PTS = [[-25, 2.2], [-12, 2.6], [-2, 2.8], [9, -1.6], [16, 2.6], [-17, -2.6], [0, 9], [-2.5, 15.2], [0, -8.5], [3, -12.5]];
  // Đổi khu (hành lang ↔ sảnh lễ tân ↔ sảnh danh dự) thì đi qua giữa hành lang trước, để không xuyên vách kính
  const zoneOf = (z) => (z < -6 ? "atrium" : z > 6 ? "lobby" : "hall");
  const st = { x: -12, z: 2.6, tx: -2, tz: 2.8, next: null, wait: 0, yaw: 0, sit: 0 };
  const col = [st.x, st.z, 0.3]; circles.push(col);
  const tag = makeTag("Mèo Bug", 0xfb923c, "Meo~ Nhớ commit trước khi về nha!", "cat");
  const lb = new CSS2DObject(tag); lb.position.set(0, 0.9, 0); cat.add(lb);
  funTick.push((dt, t) => {
    const dx = player.pos.x - st.x, dz = player.pos.z - st.z, dp = Math.hypot(dx, dz);
    let moving = false;
    if (dp < 2.6) { st.yaw = Math.atan2(dx, dz); }
    else if (st.wait > 0) st.wait -= dt;
    else {
      const vx = st.tx - st.x, vz = st.tz - st.z, d = Math.hypot(vx, vz);
      if (d < 0.2) {
        if (st.next) { [st.tx, st.tz] = st.next; st.next = null; }
        else {
          const [nx, nz] = pick(PTS);
          if (zoneOf(nz) !== zoneOf(st.z)) { st.tx = 0; st.tz = 0; st.next = [nx, nz]; } else { st.tx = nx; st.tz = nz; }
          st.wait = range(1.5, 5);
        }
      }
      else { const sp = Math.min(d, 1.1 * dt); st.x += (vx / d) * sp; st.z += (vz / d) * sp; st.yaw = Math.atan2(vx, vz); moving = true; }
    }
    st.sit = lerp(st.sit, moving ? 0 : 1, 1 - Math.exp(-4 * dt));
    let dy = st.yaw - cat.rotation.y; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    cat.rotation.y += dy * (1 - Math.exp(-8 * dt));
    cat.position.set(st.x, BASE, st.z);
    legs.forEach((g, i) => { g.rotation.x = moving ? Math.sin(t * 12 + (i % 2 ? Math.PI : 0) + (i > 1 ? Math.PI : 0)) * 0.6 : 0; });
    body.position.y = 0.3 - st.sit * 0.06; body.rotation.x = Math.PI / 2 - st.sit * 0.35;
    tail.rotation.z = Math.sin(t * (moving ? 6 : 2.5)) * 0.5;
    col[0] = st.x; col[1] = st.z;
    tag.classList.toggle("near", dp < 2.6);
    tag.style.opacity = dp < 18 ? 1 : 0;
  });
}

// Robot hút bụi chạy dọc hành lang
{
  const rb = new THREE.Group(); rb.userData.live = true; scene.add(rb);
  const base = cyl(std(0x334155, { roughness: 0.4, metalness: 0.3 }), 0.3, 0.3, 0.09, 0, 0.05, 0, rb, 28);
  cyl(std(0xe2e8f0, { roughness: 0.3 }), 0.24, 0.26, 0.02, 0, 0.1, 0, rb, 28);
  const led = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0x22c55e, emissiveIntensity: 1.5 });
  const l = new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 6), led); l.position.set(0, 0.11, 0.18); rb.add(l);
  base.castShadow = true;
  const tag = makeTag("Robot Dọn Dẹp", 0x94a3b8, "Đang hút bụi… và hút luôn bug 🐞", "robot");
  const lb = new CSS2DObject(tag); lb.position.set(0, 0.6, 0); rb.add(lb);
  const st = { x: -25, dir: 1 };
  const col = [st.x, -2.6, 0.32]; circles.push(col);
  funTick.push((dt, t) => {
    const z = -2.6 + Math.sin(st.x * 0.35) * 0.5;
    const dp = Math.hypot(player.pos.x - st.x, player.pos.z - z);
    if (dp > 1.2) st.x += st.dir * 0.9 * dt;
    if (st.x > 38) st.dir = -1; else if (st.x < -38) st.dir = 1;
    rb.position.set(st.x, BASE, -2.6 + Math.sin(st.x * 0.35) * 0.5);
    rb.rotation.y = st.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
    led.emissive.setHex(Math.floor(t * 2) % 2 ? 0x22c55e : 0x16a34a);
    col[0] = rb.position.x; col[1] = rb.position.z;
    tag.classList.toggle("near", dp < 2.5);
    tag.style.opacity = dp < 18 ? 1 : 0;
  });
}


// ================= Nhà vệ sinh (cánh Tây) =================
const ceramic = std(0xffffff, { roughness: 0.25 }), stallMat = std(0x94a3b8, { roughness: 0.5 }), mirrorMat = std(0xdbeafe, { roughness: 0.04, metalness: 1, envMapIntensity: 1.2 });
function toilet(x, z, ry) {
  const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ry; inn.add(g);
  cyl(ceramic, 0.2, 0.16, 0.42, 0, 0.21, 0.08, g, 20);
  cyl(ceramic, 0.23, 0.23, 0.05, 0, 0.44, 0.08, g, 20);
  box(ceramic, 0.42, 0.42, 0.18, 0, 0.65, -0.2, g);
}
// Dãy buồng vệ sinh dựa vào tường ngoài (zWall), cửa buồng quay vào giữa phòng
const stallDoorMat = std(0x64748b, { roughness: 0.5 });
function stalls(x0, n, zWall, dir) {
  const w = 1.6, depth = 1.7;
  for (let i = 0; i < n; i++) {
    const cx = x0 + i * w + w / 2, zc = zWall + dir * depth / 2;
    toilet(cx, zWall + dir * 0.35, dir > 0 ? 0 : Math.PI);
    box(stallMat, 0.6, 2.0, 0.04, cx - w / 2 + 0.3, 1.1, zWall + dir * depth, inn);       // vách trước
    const door = box(stallDoorMat, 0.7, 1.9, 0.04, cx + 0.32, 1.05, zWall + dir * (depth - 0.25), inn); door.rotation.y = dir * 0.6;   // cửa hé
  }
  for (let i = 0; i <= n; i++) box(stallMat, 0.04, 2.0, depth, x0 + i * w, 1.1, zWall + dir * depth / 2, inn);
  solidBox(x0, Math.min(zWall, zWall + dir * depth), x0 + n * w, Math.max(zWall, zWall + dir * depth));
}
function sinks(zFrom, zTo) {
  const x = -30.55, len = zTo - zFrom, zc = (zFrom + zTo) / 2;
  box(std(0x334155, { roughness: 0.4 }), 0.6, 0.85, len, x, 0.43, zc, inn);
  box(std(0xf1f5f9, { roughness: 0.2 }), 0.65, 0.05, len, x, 0.88, zc, inn);
  for (let z = zFrom + 0.8; z < zTo - 0.4; z += 1.4) { cyl(ceramic, 0.2, 0.16, 0.1, x - 0.05, 0.92, z, inn, 20); cyl(aluMat, 0.02, 0.02, 0.25, x + 0.18, 1.02, z, inn, 6); }
  const m = new THREE.Mesh(new THREE.PlaneGeometry(len - 0.2, 1.0), mirrorMat); m.position.set(-30.2, 1.75, zc); m.rotation.y = -Math.PI / 2; inn.add(m);
  box(std(0xe2e8f0), 0.2, 0.3, 0.3, -30.15, 1.3, zTo + 0.3, inn);   // máy sấy tay
  solidBox(-30.9, zFrom, -30.2, zTo);
}
stalls(-41.8, 3, -D / 2 + 0.1, 1);                         // nam: 3 buồng dựa tường bắc
for (const z of [-11.8, -10.4]) { box(ceramic, 0.35, 0.6, 0.3, -41.65, 1.0, z, inn); solidBox(-41.9, z - 0.2, -41.4, z + 0.2); }   // bồn tiểu
sinks(-15.2, -9.6);
stalls(-41.8, 4, D / 2 - 0.1, -1);                         // nữ: 4 buồng dựa tường nam
sinks(8.6, 13.8);
plant(-31.2, -7.2, 0.9); plant(-31.2, 7.2, 0.9);

// ================= Phòng gym (cánh Đông) =================
const rubber = std(0x1f2937, { roughness: 1 }), steel = std(0x9ca3af, { roughness: 0.3, metalness: 0.8 });
const beltTex = canvasTex(64, 256, (g, w, h) => { g.fillStyle = "#111827"; g.fillRect(0, 0, w, h); g.fillStyle = "#374151"; for (let y = 0; y < h; y += 16) g.fillRect(0, y, w, 4); }, [1, 6]);
function treadmill(x, z) {
  const g = new THREE.Group(); g.position.set(x, 0, z); inn.add(g);
  box(rubber, 0.9, 0.22, 2.0, 0, 0.11, 0, g);
  const belt = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 1.8), new THREE.MeshStandardMaterial({ map: beltTex, roughness: 0.9 }));
  belt.rotation.x = -Math.PI / 2; belt.position.set(0, 0.225, 0.05); g.add(belt);
  for (const sx of [-0.4, 0.4]) { const post = cyl(steel, 0.03, 0.03, 1.15, sx, 0.72, -0.85, g, 8); post.rotation.x = -0.15; }
  box(steel, 0.86, 0.05, 0.05, 0, 1.2, -0.9, g);
  box(dark, 0.6, 0.35, 0.08, 0, 1.38, -0.95, g);
  const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.25), new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0x22c55e, emissiveIntensity: 0.8 }));
  scr.position.set(0, 1.38, -0.905); g.add(scr);
  solidBox(x - 0.5, z - 1.05, x + 0.5, z + 1.05);
  return belt.material.map;
}
const belts = [32.6, 35.2, 37.8].map((x) => treadmill(x, -15.6));
belts.forEach((t, i) => { t.wrapT = THREE.RepeatWrapping; });
funTick.push((dt) => { for (const t of belts) t.offset.y -= dt * 1.6; });
// Giá tạ tay dựa tường Đông
box(steel, 0.5, 0.9, 3.2, 41.55, 0.45, -12, inn); solidBox(41.2, -13.6, 41.9, -10.4);
for (let i = 0; i < 6; i++) for (const lv of [0.55, 0.95]) {
  const db = cyl(std(pick([0xef4444, 0x3b82f6, 0x111827, 0xf59e0b]), { roughness: 0.6 }), 0.07, 0.07, 0.34, 41.5, lv, -13.3 + i * 0.52, inn, 12); db.rotation.x = Math.PI / 2;
}
const gymMirror = new THREE.Mesh(new THREE.PlaneGeometry(4.5, 2.2), mirrorMat); gymMirror.position.set(30.25, 1.6, -11.5); gymMirror.rotation.y = Math.PI / 2; inn.add(gymMirror);
box(rubber, 0.04, 2.3, 4.6, 30.2, 1.6, -11.5, inn);

// Biển cổ vũ (trước ở phòng xà đơn, nay là phòng Kakashi) dời sang tường Đông phòng cardio.
poster(41.5, -7.6, -Math.PI / 2, "TẬP XONG", "mới được code\ntiếp 💪", 0xf97316);

// ================= Điều khiển nhân vật =================
const SPAWN = { x: 0, z: D / 2 + 14, yaw: Math.PI };
const player = { pos: new THREE.Vector3(SPAWN.x, 0, SPAWN.z), vel: new THREE.Vector3(), yaw: SPAWN.yaw, y: 0, vy: 0, onGround: true };
const keys = new Set();
const joy = { x: 0, y: 0 };
const MOVE_KEYS = new Set(["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "ShiftLeft", "ShiftRight", "Space"]);
const typingIn = (el) => el instanceof HTMLElement && (el.isContentEditable || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || (el.tagName === "INPUT" && el.type !== "range"));
addEventListener("keydown", (e) => {
  if (typingIn(e.target) || e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.target instanceof HTMLInputElement && e.code.startsWith("Arrow")) return;
  if (MOVE_KEYS.has(e.code)) { keys.add(e.code); e.preventDefault(); if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur(); }
  if (e.code === "Space" && !e.repeat) jump();
  if (e.code === "KeyC") cameraBehind();
  if (e.code === "KeyR") goHome();
});
addEventListener("keyup", (e) => keys.delete(e.code));
addEventListener("blur", () => keys.clear());

function jump() { if (player.onGround) { player.vy = 5.4; player.onGround = false; } }
function groundY(x, z) {
  if (Math.abs(x) < W / 2 + 0.6 && Math.abs(z) < D / 2 + 0.6) return BASE;
  if (Math.abs(x) < 3.5 && z >= D / 2 + 0.6 && z < D / 2 + 1.8) return BASE * (1 - (z - D / 2 - 0.6) / 1.2);
  return 0;
}
const camFwd = new THREE.Vector3(), wish = new THREE.Vector3();
function updatePlayer(dt) {
  camera.getWorldDirection(camFwd); camFwd.y = 0; camFwd.normalize();
  const f = (keys.has("KeyW") || keys.has("ArrowUp") ? 1 : 0) - (keys.has("KeyS") || keys.has("ArrowDown") ? 1 : 0) - joy.y;
  const r = (keys.has("KeyD") || keys.has("ArrowRight") ? 1 : 0) - (keys.has("KeyA") || keys.has("ArrowLeft") ? 1 : 0) + joy.x;
  wish.set(camFwd.x * f - camFwd.z * r, 0, camFwd.z * f + camFwd.x * r);
  const mag = Math.min(1, wish.length());
  if (mag > 0.01) wish.normalize();
  const run = keys.has("ShiftLeft") || keys.has("ShiftRight") || Math.hypot(joy.x, joy.y) > 0.92;
  const speed = (run ? 8 : 4.2) * mag;
  // Tăng/giảm tốc mượt rồi xoay người dần về hướng đi
  player.vel.lerp(wish.multiplyScalar(speed), 1 - Math.exp(-10 * dt));
  player.pos.addScaledVector(player.vel, dt);
  collide(player.pos, 0.38);
  const sp = Math.hypot(player.vel.x, player.vel.z);
  if (sp > 0.3) {
    const target = Math.atan2(player.vel.x, player.vel.z);
    let d = target - player.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
    player.yaw += d * (1 - Math.exp(-12 * dt));
  }
  const gy = groundY(player.pos.x, player.pos.z);
  player.vy -= 18 * dt; player.y += player.vy * dt;
  if (player.y <= gy) {
    player.y = player.vy < -1 ? gy : lerp(player.y, gy, 1 - Math.exp(-20 * dt));
    if (gy - player.y < 0.02) player.y = gy;
    player.vy = 0; player.onGround = true;
  } else player.onGround = player.y - gy < 0.03;
  hero.root.position.set(player.pos.x, player.y, player.pos.z);
  hero.root.rotation.y = player.yaw;
  hero.speed = sp;
}

// Camera bám sau lưng: giữ nguyên góc người dùng đã xoay, chỉ dời theo nhân vật.
const focus = new THREE.Vector3(), lastFocus = new THREE.Vector3();
function cameraBehind() {
  const inHouse = Math.abs(player.pos.x) < W / 2 && Math.abs(player.pos.z) < D / 2;
  const dist = inHouse ? 4 : 9, back = new THREE.Vector3(-Math.sin(player.yaw), 0, -Math.cos(player.yaw));
  camera.position.set(player.pos.x + back.x * dist, player.y + (inHouse ? 2.4 : 5.2), player.pos.z + back.z * dist);
}
function goHome() {
  player.pos.set(SPAWN.x, 0, SPAWN.z); player.vel.set(0, 0, 0); player.yaw = SPAWN.yaw; player.y = 0; player.vy = 0;
  focus.set(player.pos.x, 2.2, player.pos.z); lastFocus.copy(focus); controls.target.copy(focus);
  cameraBehind();
}
const jumpBtn = document.createElement("button");
jumpBtn.className = "vp-jump"; jumpBtn.type = "button"; jumpBtn.textContent = "Nhảy"; jumpBtn.setAttribute("aria-label", "Nhảy");
jumpBtn.addEventListener("pointerdown", (e) => { e.preventDefault(); jump(); });
document.body.appendChild(jumpBtn);

// Cần điều khiển nổi kiểu game FPS (màn cảm ứng): chạm vào cảnh 3D ở nửa trái màn hình thì cần hiện ngay dưới ngón tay;
// kéo quá vành thì cả cần đi theo ngón tay; nhả tay thì ẩn. Nửa phải vẫn xoay camera (OrbitControls) như cũ, kể cả cùng lúc.
// Nghe ở pha capture của window và chặn sự kiện của ngón đang điều khiển, để OrbitControls không nhận nhầm ngón đó thành xoay.
const joyEl = document.createElement("div"), knob = document.createElement("i");
joyEl.className = "vp-joy"; joyEl.setAttribute("aria-hidden", "true"); joyEl.appendChild(knob); document.body.appendChild(joyEl);
const JOY_R = 60;   // bán kính vành (nửa cạnh 120px)
let joyId = null, joyCx = 0, joyCy = 0;
const joyPlace = () => { joyEl.style.left = (joyCx - JOY_R) + "px"; joyEl.style.top = (joyCy - JOY_R) + "px"; };
function joyMove(e) {
  let dx = e.clientX - joyCx, dy = e.clientY - joyCy;
  const d = Math.hypot(dx, dy);
  if (d > JOY_R) {   // kéo quá vành: dời tâm theo ngón tay (cần "trôi" theo), giữ hướng đang đẩy
    joyCx += dx * (1 - JOY_R / d); joyCy += dy * (1 - JOY_R / d); joyPlace();
    dx = e.clientX - joyCx; dy = e.clientY - joyCy;
  }
  knob.style.transform = `translate(${dx}px, ${dy}px)`;
  joy.x = dx / JOY_R; joy.y = dy / JOY_R;
}
function joyEnd() { joyId = null; joy.x = joy.y = 0; knob.style.transform = ""; joyEl.classList.remove("on"); }
addEventListener("pointerdown", (e) => {
  if (joyId !== null || e.pointerType === "mouse" || e.target !== gl.domElement || e.clientX > innerWidth / 2) return;
  joyId = e.pointerId;
  // Không để vành tràn ra ngoài màn hình (mép trái / trên / dưới)
  joyCx = Math.max(JOY_R + 4, e.clientX); joyCy = Math.min(Math.max(JOY_R + 4, e.clientY), innerHeight - JOY_R - 4);
  joyPlace(); joyEl.classList.add("on"); joyMove(e);
  e.stopPropagation(); e.preventDefault();
}, { capture: true });
addEventListener("pointermove", (e) => { if (e.pointerId !== joyId) return; joyMove(e); e.stopPropagation(); }, { capture: true });
for (const ev of ["pointerup", "pointercancel"]) addEventListener(ev, (e) => { if (e.pointerId !== joyId) return; joyEnd(); e.stopPropagation(); }, { capture: true });
addEventListener("blur", joyEnd);

// Thẻ "Bạn đang ở" đổi khi bước sang phòng khác
const card = document.createElement("div");
card.className = "vp-room"; card.hidden = true; card.setAttribute("aria-live", "polite");
card.style.cssText = opts.cardStyle || "top:16px;right:16px";
card.innerHTML = '<small>Bạn đang ở</small><b></b><div class="who"></div><p></p>';
document.body.appendChild(card);
let zoneId = null;
function updateZone() {
  const { x, z } = player.pos;
  const inside = Math.abs(x) < W / 2 && Math.abs(z) < D / 2;
  const zone = inside ? ZONES.find((r) => x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1) : null;
  const id = zone ? zone.id : "outside";
  if (id === zoneId) return inside;
  zoneId = id;
  const z2 = zone || { color: 0x22c55e, title: "KHUÔN VIÊN VĂN PHÒNG", who: "Ngoài trời", fn: "Cây xanh, hồ nước, đường dạo. Cửa chính ở phía bắc, đi thẳng theo lối đá." };
  card.style.setProperty("--room", css(z2.color));
  card.children[1].textContent = z2.title; card.children[2].textContent = z2.who; card.children[3].textContent = z2.fn;
  card.hidden = false;
  if (opts.onZone) opts.onZone({ id, title: z2.title, who: z2.who, fn: z2.fn });
  return inside;
}

// ================= Thời gian trong ngày =================
const SUN_WHITE = new THREE.Color(0xfff6ea), SUN_GOLD = new THREE.Color(0xffa860);
const CLOUD_DAY = new THREE.Color(0xffffff), CLOUD_GOLD = new THREE.Color(0xffc8a0), CLOUD_NIGHT = new THREE.Color(0x3a4458);
const sunDir = new THREE.Vector3();
let day = 1, golden = 0;
// Thời tiết đang hiển thị (đổi dần về weatherTarget): mây, mưa, sương, giông 0..1; gió = hệ số lay cây.
const WEATHER_CLEAR = { cloud: 0.2, rain: 0, fog: 0, storm: 0, wind: 1 };
const weather = { ...WEATHER_CLEAR }, weatherTarget = { ...WEATHER_CLEAR };
const OVERCAST_TOP = new THREE.Color(0x6b7787), OVERCAST_HOR = new THREE.Color(0xa9b3bd), CLOUD_RAIN = new THREE.Color(0x5b6472), FLASH = new THREE.Color(0xdde6ff);
const tmpCol = new THREE.Color();
let hourNow = 15.5, flash = 0;
function setHour(h) { hourNow = h; applySky(); }
function applySky() {
  const h = hourNow, w = weather;
  const t = (h - 6) / 13;                                   // 6:00 → 0, 19:00 → 1
  const elev = Math.sin(Math.PI * clamp(t, -0.16, 1.16)) * 62;
  const theta = lerp(115, -115, clamp(t, 0, 1));            // mọc đông (+x), lặn tây (-x), đi ngang phía trước sảnh
  sunDir.setFromSphericalCoords(1, degToRad(90 - elev), degToRad(theta));
  day = smoothstep(elev, -5, 9);
  golden = day * (1 - smoothstep(elev, 3, 26));
  const gloom = clamp(w.cloud * 0.7 + w.rain * 0.35 + w.fog * 0.3, 0, 0.92);   // trời u ám: nắng yếu, màu xám
  sun.intensity = 5.2 * day * smoothstep(elev, -2, 6) * (1 - gloom);
  sun.color.copy(SUN_WHITE).lerp(SUN_GOLD, golden);
  hemi.intensity = (0.5 + 0.65 * day) * (1 - gloom * 0.3) + flash * 2.5;
  hemi.color.set(0xcfe7ff).lerp(new THREE.Color(0x4a5a8c), 1 - day);
  moon.intensity = 1.1 * (1 - day) * (1 - w.cloud * 0.6);
  for (const l of pathLights) l.intensity = 30 * smoothstep(1 - day, 0.3, 0.9);
  gl.toneMappingExposure = lerp(0.85, 0.5, day);

  const night = 1 - day, u = skyMat.uniforms;
  u.uTop.value.copy(SKY.night.top).lerp(SKY.day.top, day).lerp(SKY.gold.top, golden * 0.55);
  u.uHor.value.copy(SKY.night.hor).lerp(SKY.day.hor, day).lerp(SKY.gold.hor, golden * 0.85);
  u.uSun.value.copy(sunDir);
  u.uTop.value.lerp(tmpCol.copy(OVERCAST_TOP).multiplyScalar(0.12 + 0.88 * day), gloom * 0.85).lerp(FLASH, flash * 0.5);
  u.uHor.value.lerp(tmpCol.copy(OVERCAST_HOR).multiplyScalar(0.12 + 0.88 * day), gloom * 0.8).lerp(FLASH, flash * 0.4);
  u.uSunCol.value.copy(SUN_WHITE).lerp(SUN_GOLD, golden).multiplyScalar(smoothstep(elev, -3, 2) * (1 - gloom));
  u.uMoon.value.set(-sunDir.x, Math.max(0.45, -sunDir.y), -sunDir.z);
  u.uNight.value = smoothstep(night, 0.4, 1);
  scene.fog.color.copy(u.uHor.value);
  starMat.opacity = smoothstep(night, 0.4, 1) * (1 - w.cloud);
  scene.fog.density = 0.0014 + w.rain * 0.0035 + w.fog * 0.012;
  rainMat.opacity = 0.75 * (0.45 + 0.55 * day) + flash * 0.25;
  for (const c of clouds) {
    c.material.color.copy(CLOUD_DAY).lerp(CLOUD_GOLD, golden * (1 - gloom)).lerp(CLOUD_RAIN, Math.min(1, w.rain + w.storm * 0.5) * 0.85).lerp(CLOUD_NIGHT, night);
    c.material.opacity = c.userData.alpha * (0.35 + 0.65 * day) * (0.3 + 0.7 * w.cloud);
  }
  for (const m of lampMats) m.emissiveIntensity = 0.2 + 3 * night;
  glowNight = 0.75 * smoothstep(night, 0.3, 0.9);
  ledMat.emissiveIntensity = 0.6 + 1.6 * night;
  shadeMat.emissiveIntensity = 0.5 + 1.5 * night;
  for (const p of roomLights) p.intensity = 5 + 22 * night;

  envDirty = true;
}

// ================= Mưa =================
const RAIN_N = 4500, RAIN_BOX = 40, RAIN_H = 34;
const drops = Array.from({ length: RAIN_N }, () => ({ x: range(-RAIN_BOX, RAIN_BOX), y: range(0, RAIN_H), z: range(-RAIN_BOX, RAIN_BOX), sp: range(24, 32) }));
const rainPos = new Float32Array(RAIN_N * 6);
const rainGeo = new THREE.BufferGeometry();
rainGeo.setAttribute("position", new THREE.BufferAttribute(rainPos, 3));
const rainMat = new THREE.LineBasicMaterial({ color: 0xdbe7f3, transparent: true, opacity: 0.7, depthWrite: false });
const rain = new THREE.LineSegments(rainGeo, rainMat);
rain.frustumCulled = false; rain.visible = false;
scene.add(rain);
const wrap = (v, c) => c + ((((v - c) % (2 * RAIN_BOX)) + 3 * RAIN_BOX) % (2 * RAIN_BOX)) - RAIN_BOX;
function updateRain(dt) {
  rain.visible = weather.rain > 0.02;
  if (!rain.visible) return;
  const active = Math.floor(RAIN_N * weather.rain), cx = camera.position.x, cz = camera.position.z, slant = 0.12 * weather.wind;
  for (let i = 0; i < RAIN_N; i++) {
    const d = drops[i], o = i * 6;
    d.y -= d.sp * dt; if (d.y < 0) d.y += RAIN_H;
    const x = wrap(d.x, cx), z = wrap(d.z, cz);
    const indoors = Math.abs(x) < W / 2 + 1.6 && Math.abs(z) < D / 2 + 1.6 && d.y < roofY + 0.8;
    if (i >= active || indoors) { rainPos.fill(-50, o, o + 6); continue; }
    rainPos[o] = x; rainPos[o + 1] = d.y; rainPos[o + 2] = z;
    rainPos[o + 3] = x - slant * 1.4; rainPos[o + 4] = d.y + 1.4; rainPos[o + 5] = z;
  }
  rainGeo.attributes.position.needsUpdate = true;
}
let nextBolt = 4;
function updateWeather(dt) {
  let moving = false;
  for (const k in weatherTarget) {
    const before = weather[k];
    weather[k] = lerp(before, weatherTarget[k], 1 - Math.exp(-0.5 * dt));   // đổi dần trong vài giây
    if (Math.abs(weather[k] - weatherTarget[k]) > 0.002) moving = true;
  }
  windStrength.value = weather.wind;
  // Giông: chớp loé ngẫu nhiên 5–14 giây một lần
  if (weather.storm > 0.5 && !reduceMotion) { nextBolt -= dt; if (nextBolt <= 0) { flash = 1; nextBolt = range(5, 14); } }
  const flashing = flash > 0;
  flash = Math.max(0, flash - dt * 4);
  if (moving || flashing) applySky();
  updateRain(dt);
}

setHour(clamp(opts.hour ?? 15.5, 5, 21));

// ================= Vòng lặp =================
goHome();
controls.update();
const clock = new THREE.Clock();
let first = true, indoor = 0;   // indoor: 0 ngoài trời → 1 trong nhà (đổi dần để camera không giật)
const ray = new THREE.Raycaster();
const camBlockersAll = [...camBlockers, roofSlab];
const desiredCam = new THREE.Vector3(), renderedCam = new THREE.Vector3(NaN, NaN, NaN), armDir = new THREE.Vector3();
let arm = 9, frameNo = 0;
const plaqueMeshes = plaques.flatMap((p) => [p.front, p.back]);

// Gộp vật đứng yên: cảnh có hơn nghìn khối nhỏ, mỗi khối là một lệnh vẽ (cả lượt vẽ bóng) nên card đồ hoạ tích hợp
// nghẽn ở khâu gửi lệnh chứ không phải ở số điểm ảnh. Khối không bao giờ di chuyển, cùng chất liệu và cùng cách đổ bóng
// được gộp thành một lưới. Chất liệu vẫn dùng chung nên đèn nhấp nháy, màn hình đổi màu… vẫn chạy như cũ.
// Không gộp: vật đánh dấu userData.live (nhân vật, mèo, robot, cá, bóng bay, cúp…), tường/kính/biển phòng dùng để dò camera
// (raycast cần đúng vật). Vật trong suốt chỉ gộp với vật cùng chất liệu và cùng thứ tự vẽ.
function mergeStatic() {
  scene.updateMatrixWorld(true);
  const keep = new Set([...camBlockersAll, ...plaqueMeshes]), groups = new Map();
  scene.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh || o.isSkinnedMesh || keep.has(o)) return;
    for (let p = o; p; p = p.parent) if (p.userData.live || !p.visible) return;
    const m = o.material, g = o.geometry;
    if (Array.isArray(m) || o.matrixWorld.determinant() <= 0 || Object.keys(g.morphAttributes).length) return;
    const key = [m.uuid, o.castShadow, o.receiveShadow, o.renderOrder, Boolean(g.index), Object.keys(g.attributes).sort()].join("|");
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(o);
  });
  for (const list of groups.values()) {
    if (list.length < 2) continue;
    const geos = list.map((o) => o.geometry.clone().applyMatrix4(o.matrixWorld));
    const merged = mergeGeometries(geos, false);
    for (const g of geos) g.dispose();
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, list[0].material);
    mesh.castShadow = list[0].castShadow; mesh.receiveShadow = list[0].receiveShadow; mesh.renderOrder = list[0].renderOrder;
    mesh.matrixAutoUpdate = false;   // toạ độ đã là toạ độ thế giới
    scene.add(mesh);
    for (const o of list) o.removeFromParent();
  }
}
mergeStatic();

// Tự chỉnh độ phân giải theo sức máy: chậm (dưới ~45 khung/giây) thì hạ từng nấc, đủ nhanh thì nâng lại.
// Nấc vừa bị hạ vì chậm thì 30 giây sau mới thử lại, để hình không nhoè–nét liên tục.
const PR_MAX = Math.min(devicePixelRatio, 1.5), PR_MIN = Math.min(PR_MAX, 1);
let pr = PR_MAX, prBad = Infinity, prBadUntil = 0, qFrames = 0, qTime = 0;
function adaptQuality(raw) {
  if (raw > 0.25) return;   // vừa quay lại tab hoặc máy khựng một nhịp: bỏ qua
  qFrames++; qTime += raw;
  if (qTime < 2) return;
  const avg = qTime / qFrames, now = performance.now();
  qFrames = 0; qTime = 0;
  let next = pr;
  if (avg > 1 / 45 && pr > PR_MIN) { prBad = pr; prBadUntil = now + 30000; next = Math.max(PR_MIN, pr - 0.25); }
  else if (avg < 1 / 55 && pr < PR_MAX && (pr + 0.25 < prBad || now > prBadUntil)) next = Math.min(PR_MAX, pr + 0.25);
  if (next !== pr) { pr = next; gl.setPixelRatio(pr); const [w, h] = coKhung(); gl.setSize(w, h, false); }
}
gl.setAnimationLoop(() => {
  const raw = clock.getDelta(), dt = Math.min(raw, 0.05), t = clock.elapsedTime;
  adaptQuality(raw);
  if (!reduceMotion) wind.value = t;
  updateWeather(dt);

  for (const c of clouds) {
    c.position.x += dt * c.userData.speed;
    if (c.position.x > 850) c.position.x = -850;
  }

  updatePlayer(dt);
  animateChar(hero, dt, t);
  const inside = updateZone();

  // Camera dời theo nhân vật (độ cao được làm mượt để nhảy không giật hình).
  // desiredCam là chỗ người dùng muốn đặt camera; camera thật có thể bị tường đẩy vào gần hơn.
  if (camera.position.equals(renderedCam)) camera.position.copy(desiredCam);
  indoor = lerp(indoor, inside ? 1 : 0, 1 - Math.exp(-4 * dt));
  // Trong nhà: nhìn từ ngang vai, không cho camera vọt lên cao nhìn từ trên xuống (kiểu game bắn súng góc nhìn thứ ba)
  controls.minPolarAngle = 0.95 * indoor;
  focus.set(player.pos.x, lerp(lastFocus.y, player.y + lerp(2.2, 1.65, indoor), 1 - Math.exp(-8 * dt)), player.pos.z);
  camera.position.add(v3.subVectors(focus, lastFocus));
  controls.target.copy(focus);
  lastFocus.copy(focus);
  controls.update();
  desiredCam.copy(camera.position);
  // Cần camera co giãn: có tường/kính/mái chắn giữa nhân vật và camera thì kéo camera vào trước chỗ chắn,
  // hết chắn thì giãn ra từ từ. Nhờ vậy camera không đứng sau tường hay nhìn xuyên vách.
  armDir.subVectors(desiredCam, focus);
  const armFree = armDir.length();
  armDir.divideScalar(armFree || 1);
  // Trong nhà tự kéo camera gần (tối đa 4 m) dù ngoài trời đang để xa; ra ngoài thì trả lại khoảng cách cũ
  let armWant = lerp(armFree, Math.min(armFree, 4), indoor);
  // Không bao giờ vượt lên trên trần nhà khi đang ở trong nhà
  if (inside && armDir.y > 0.01) armWant = Math.min(armWant, Math.max(0.3, (BASE + H - 0.35 - focus.y) / armDir.y));
  ray.set(focus, armDir); ray.far = armWant;
  const wall = ray.intersectObjects(camBlockersAll, false)[0];
  const armTarget = wall ? Math.max(0.3, wall.distance - 0.35) : armWant;
  arm = armTarget < arm ? armTarget : lerp(arm, armTarget, 1 - Math.exp(-3 * dt));
  camera.position.copy(focus).addScaledVector(armDir, Math.min(arm, armWant));
  renderedCam.copy(camera.position);
  hero.body.visible = arm > 0.9;   // camera sát đầu = góc nhìn thứ nhất: ẩn thân để không che màn hình


  // AI quay sang nhìn khi bạn lại gần, nói một câu
  for (const n of NPCS) {
    const dx = player.pos.x - n.x, dz = player.pos.z - n.z, d = Math.hypot(dx, dz);
    const want = d < 6 ? Math.atan2(dx, dz) : n.rot;
    let dd = want - n.yaw; dd = Math.atan2(Math.sin(dd), Math.cos(dd));
    n.yaw += dd * (1 - Math.exp(-5 * dt));
    n.c.root.rotation.y = n.yaw;
    animateChar(n.c, dt, t + n.x);
    const near = d < 4, show = d < 22;
    if (n.near !== near) { n.near = near; n.tag.classList.toggle("near", near); }
    if (n.show !== show) { n.show = show; n.tag.style.opacity = show ? 1 : 0; }
  }
  for (const m of ledMats) if (rnd() < 0.04) m.emissiveIntensity = rnd() < 0.5 ? 0.2 : 1.4;
  logoMat.emissiveIntensity = 0.7 + Math.sin(t * 2) * 0.2;
  for (const g of glows) g.material.opacity = glowNight * smoothstep(g.position.distanceTo(camera.position), 6, 16);
  for (const f of funTick) f(dt, t);

  // Biển phòng nằm chắn giữa camera và nhân vật thì mờ đi để không che tầm nhìn
  v3.set(player.pos.x, player.y + 1.2, player.pos.z);
  const toHero = v3.clone().sub(camera.position), heroDist = toHero.length();
  ray.set(camera.position, toHero.normalize()); ray.far = heroDist;
  const blocking = new Set(ray.intersectObjects(plaqueMeshes, false).map((h) => h.object));
  for (const { front, back } of plaques) {
    const o = lerp(front.material.opacity, blocking.has(front) || blocking.has(back) ? 0.12 : 1, 1 - Math.exp(-10 * dt));
    front.material.opacity = back.material.opacity = o;
  }

  // Vùng đổ bóng đi theo nhân vật
  sun.target.position.set(player.pos.x, 0, player.pos.z);
  sun.position.copy(sunDir).multiplyScalar(180).add(sun.target.position);

  if (envDirty && performance.now() - envAt > 180) updateEnv();
  skyDome.position.copy(camera.position);
  gl.shadowMap.needsUpdate = (frameNo++ & 1) === 0;
  gl.render(scene, camera);
  lblR.render(scene, camera);
  if (first) { first = false; if (opts.onReady) opts.onReady(); }
});

// ================= API cho trang =================
const NPC_BY_ID = Object.fromEntries(NPCS.map((n) => [n.room, n]));
const tagOf = (id) => (id === "ceo" ? heroTag : NPC_BY_ID[id]?.tag);
// Đứng giữa phòng, quay mặt về bàn của người phụ trách; camera đặt sau lưng.
function goToRoom(id) {
  if (id === "all" || id === "gate") { goHome(); if (id === "all") camera.position.set(player.pos.x, 40, player.pos.z + 46); return; }
  const r = ZONES.find((z) => z.id === id);
  if (!r) return;
  const north = r.z1 <= -6;
  player.pos.set(r.door ?? (r.x0 + r.x1) / 2, 0, north ? -10.2 : 10.2);
  player.vel.set(0, 0, 0); player.vy = 0; player.y = BASE; player.yaw = north ? Math.PI : 0;
  focus.set(player.pos.x, player.y + 2.2, player.pos.z); lastFocus.copy(focus); controls.target.copy(focus);
  cameraBehind();
}
function setDistance(d) {
  const dir = v3.subVectors(camera.position, controls.target).normalize();
  camera.position.copy(controls.target).addScaledVector(dir, clamp(d, controls.minDistance, controls.maxDistance));
}
return {
  camera, controls, ZONES, npcIds: NPCS.map((n) => n.room),
  setHour: (h) => setHour(clamp(h, 5, 21)),
  // Thời tiết: { cloud, rain, fog, storm (0..1), wind (hệ số lay cây) }; cảnh đổi dần sang trạng thái mới.
  setWeather: (w) => Object.assign(weatherTarget, WEATHER_CLEAR, w),
  goToRoom, goHome, cameraBehind, jump, setDistance,
  getDistance: () => desiredCam.distanceTo(controls.target),
  // Bong bóng việc được giao trên đầu nhân vật (chỉ dùng textContent, không chèn HTML)
  say(id, { tag = "", text = "", color = 0xfbbf24 } = {}) {
    const el = tagOf(id); if (!el) return;
    const req = el.querySelector(".req");
    req.style.setProperty("--req", css(color));
    req.firstChild.textContent = tag; req.lastChild.textContent = text;
    el.classList.toggle("has-req", Boolean(text));
  },
  setBusy(id, on) { const n = NPC_BY_ID[id]; if (n) n.c.busy = Boolean(on); },
  // Câu nói khi lại gần: trang nạp trạng thái thật của dự án (không có dữ liệu thì giữ lời giới thiệu vai).
  setLine(id, text) { const n = NPC_BY_ID[id]; if (n) n.tag.querySelector(".say").textContent = text || n.line; },
};
}
