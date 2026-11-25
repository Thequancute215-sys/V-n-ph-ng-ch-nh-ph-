import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

function disposeModel(model) {
  const released = new Set();
  function release(asset) {
    if (asset && !released.has(asset)) { asset.dispose(); released.add(asset); }
  }
  model.traverse((o) => {
    release(o.geometry);
    for (const mat of o.material ? [o.material].flat() : []) {
      for (const value of Object.values(mat)) if (value?.isTexture) release(value);
      release(mat);
    }
  });
}

export async function xem3D(host, url, signal) {
  if (signal.aborted) throw new DOMException("Đã đóng", "AbortError");
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x14212b);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.domElement.setAttribute("aria-label", "Khung xem trước mô hình 3D");
  host.replaceChildren(renderer.domElement);
  const camera = new THREE.PerspectiveCamera(42, 1, 0.01, 100);
  const controls = new OrbitControls(camera, renderer.domElement);
  const light = new THREE.DirectionalLight(0xffffff, 2.4);
  light.position.set(4, 7, 5);
  scene.add(light, new THREE.HemisphereLight(0xd9ecff, 0x5e5650, 2));

  let model, closed = false;
  const render = () => renderer.render(scene, camera);
  function fit() {
    if (!host.clientWidth || !host.clientHeight || closed) return;
    renderer.setSize(host.clientWidth, host.clientHeight);
    camera.aspect = host.clientWidth / host.clientHeight;
    camera.updateProjectionMatrix();
    render();
  }
  const size = new ResizeObserver(fit);
  function close() {
    if (closed) return;
    closed = true;
    size.disconnect();
    controls.dispose();
    if (model) disposeModel(model);
    renderer.dispose();
    renderer.domElement.remove();
  }
  signal.addEventListener("abort", close, { once: true });

  try {
    const response = await fetch(url, { signal });
    if (!response.ok) throw Error("Không đọc được tệp GLB.");
    const gltf = await new GLTFLoader().parseAsync(await response.arrayBuffer(), "");
    if (closed) { disposeModel(gltf.scene); throw new DOMException("Đã đóng", "AbortError"); }
    model = gltf.scene;
    const bounds = new THREE.Box3().setFromObject(model);
    const radius = bounds.getSize(new THREE.Vector3()).length();
    if (!Number.isFinite(radius) || radius <= 0) throw Error("Mô hình chưa có hình học để xem.");
    const scale = 2.4 / radius;
    model.scale.multiplyScalar(scale);
    model.position.sub(bounds.getCenter(new THREE.Vector3()).multiplyScalar(scale));
    scene.add(model);
    camera.position.set(2.8, 1.6, 3.7);
    controls.minDistance = 1.2;
    controls.maxDistance = 12;
    controls.update();
    fit();
    controls.saveState();
    controls.addEventListener("change", render);
    size.observe(host);
    render();
    return {
      rotate() {
        camera.position.sub(controls.target).applyAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2).add(controls.target);
        controls.update();
        render();
      },
      reset() { controls.reset(); render(); },
      capture() { render(); return renderer.domElement.toDataURL("image/png"); },
    };
  } catch (error) {
    signal.removeEventListener("abort", close);
    close();
    throw error;
  }
}
