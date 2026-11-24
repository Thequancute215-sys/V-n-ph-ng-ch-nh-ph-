"use strict";
// Kiểm hành vi giao diện (không chỉ kiểm chuỗi): chạy trực tiếp module thật trong public/os/ và public/progress-view.js
// với DOM giả nhẹ + Promise trễ giả (không mạng, không phụ thuộc ngoài, không chạm hồ sơ người dùng).
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { pathToFileURL } = require("node:url");

const PUB = path.join(__dirname, "..", "public");

// ---------- DOM giả nhẹ (đủ để chạy thật tin-nhan.js, giao-viec.js, ngan.js) ----------
const VOID_TAGS = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"]);
const decodeEntities = (s) => String(s).replace(/&(amp|lt|gt|quot|#39);/g, (_, k) => ({ amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'" })[k]);
const camel = (k) => k.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
const kebab = (k) => k.replace(/[A-Z]/g, (c) => "-" + c.toLowerCase());

function createMiniDom({ hash = "#/" } = {}) {
  const docListeners = new Map();
  const timers = new Map();
  let nextTid = 1;

  class FakeElement {
    constructor(tag) {
      this.tagName = String(tag || "div").toUpperCase();
      this.parentNode = null;
      this.childNodes = [];
      this.attrs = new Map();
      this.listeners = new Map();
      this.hidden = false;
      this.disabled = false;
      this.open = false;
      this._value = "";
      this.title = "";
      this._classSet = new Set();
      this.style = {};
      this.scrollTop = 0;
      this.clientHeight = 100;
      this.scrollHeight = 100;
      this.focused = false;
      const self = this;
      this.classList = {
        add: (...cs) => cs.forEach((c) => { if (c) self._classSet.add(c); }),
        remove: (...cs) => cs.forEach((c) => self._classSet.delete(c)),
        toggle: (c, force) => {
          const on = force === undefined ? !self._classSet.has(c) : !!force;
          if (on) self._classSet.add(c); else self._classSet.delete(c);
          return on;
        },
        contains: (c) => self._classSet.has(c),
      };
      this.dataset = new Proxy({}, {
        get(_, prop) {
          if (typeof prop !== "string") return undefined;
          const a = "data-" + kebab(prop);
          return self.attrs.has(a) ? self.attrs.get(a) : undefined;
        },
        set(_, prop, val) {
          if (typeof prop === "string") self.setAttribute("data-" + kebab(prop), String(val));
          return true;
        },
        has(_, prop) {
          return typeof prop === "string" && self.attrs.has("data-" + kebab(prop));
        },
      });
    }
    get id() { return this.attrs.get("id") || ""; }
    set id(v) { this.setAttribute("id", v); }
    get className() { return [...this._classSet].join(" "); }
    set className(v) { this._classSet = new Set(String(v || "").split(/\s+/).filter(Boolean)); this.attrs.set("class", this.className); }
    get isConnected() { let cur = this; while (cur) { if (cur === document.body) return true; cur = cur.parentNode; } return false; }
    get value() { return this._value; }
    set value(v) { this._value = String(v ?? ""); }
    get children() { return this.childNodes.filter((n) => n instanceof FakeElement); }
    get lastElementChild() { const cs = this.children; return cs.length ? cs[cs.length - 1] : null; }
    get textContent() {
      return this.childNodes.map((n) => (typeof n === "string" ? n : n.textContent)).join("");
    }
    set textContent(v) {
      this.childNodes = v === "" || v == null ? [] : [String(v)];
    }
    get innerHTML() {
      return this.childNodes.map((n) => (typeof n === "string" ? n : n.outerHTML)).join("");
    }
    get outerHTML() {
      const tag = this.tagName.toLowerCase();
      const attrs = [...this.attrs.entries()].map(([k, v]) => (v === "" ? k : `${k}="${v}"`)).join(" ");
      const open = attrs ? `<${tag} ${attrs}>` : `<${tag}>`;
      if (VOID_TAGS.has(tag)) return open;
      return `${open}${this.innerHTML}</${tag}>`;
    }
    set innerHTML(html) {
      this.childNodes = [];
      parseHtmlInto(this, String(html || ""));
      if (this.tagName === "SELECT") {
        const opts = this.querySelectorAll("option");
        const sel = opts.find((o) => o.hasAttribute("selected")) || opts[0];
        this._value = sel ? (sel.getAttribute("value") ?? sel.textContent) : "";
      }
    }
    setAttribute(name, val) {
      const k = String(name).toLowerCase();
      const v = val === undefined ? "" : String(val);
      this.attrs.set(k, v);
      if (k === "class") this._classSet = new Set(v.split(/\s+/).filter(Boolean));
      else if (k === "hidden") this.hidden = true;
      else if (k === "disabled") this.disabled = true;
      else if (k === "open") this.open = true;
      else if (k === "value") this._value = v;
      else if (k === "title") this.title = v;
    }
    getAttribute(name) {
      const k = String(name).toLowerCase();
      return this.attrs.has(k) ? this.attrs.get(k) : null;
    }
    hasAttribute(name) { return this.attrs.has(String(name).toLowerCase()); }
    removeAttribute(name) {
      const k = String(name).toLowerCase();
      this.attrs.delete(k);
      if (k === "hidden") this.hidden = false;
      else if (k === "disabled") this.disabled = false;
      else if (k === "open") this.open = false;
    }
    append(...nodes) {
      for (const n of nodes) {
        if (n instanceof FakeElement) { n.parentNode = this; this.childNodes.push(n); }
        else if (n != null) this.childNodes.push(String(n));
      }
    }
    appendChild(n) { this.append(n); return n; }
    contains(node) { let cur = node; while (cur) { if (cur === this) return true; cur = cur.parentNode; } return false; }
    focus() { this.focused = true; document.activeElement = this; }
    scrollIntoView() {}
    showModal() { this.open = true; }
    close() {
      if (!this.open) return;
      this.open = false;
      this.dispatchEvent({ type: "close", target: this, bubbles: false });
    }
    addEventListener(type, fn) {
      if (!this.listeners.has(type)) this.listeners.set(type, new Set());
      this.listeners.get(type).add(fn);
    }
    removeEventListener(type, fn) { this.listeners.get(type)?.delete(fn); }
    dispatchEvent(evt) {
      const e = { preventDefault() { e.defaultPrevented = true; }, defaultPrevented: false, bubbles: true, target: this, ...evt };
      let cur = this;
      while (cur) {
        const ls = cur.listeners.get(e.type);
        if (ls) for (const fn of [...ls]) fn.call(cur, e);
        if (!e.bubbles) break;
        cur = cur.parentNode;
      }
      return !e.defaultPrevented;
    }
    click() { this.dispatchEvent({ type: "click", target: this, bubbles: true }); }
    matches(sel) { return matchesSelector(this, sel); }
    closest(sel) {
      let cur = this;
      while (cur) { if (cur.matches(sel)) return cur; cur = cur.parentNode; }
      return null;
    }
    querySelectorAll(sel) {
      const out = [];
      const walk = (node) => {
        for (const c of node.children) {
          if (matchesSelector(c, sel)) out.push(c);
          walk(c);
        }
      };
      walk(this);
      return out;
    }
    querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
  }

  function matchesSimple(el, part) {
    let rest = part.trim();
    if (!rest) return false;
    const tagM = /^[a-zA-Z][\w-]*/.exec(rest);
    if (tagM) {
      if (el.tagName !== tagM[0].toUpperCase()) return false;
      rest = rest.slice(tagM[0].length);
    }
    while (rest.length) {
      if (rest[0] === "#") {
        const m = /^#([\w-]+)/.exec(rest);
        if (!m || el.id !== m[1]) return false;
        rest = rest.slice(m[0].length);
      } else if (rest[0] === ".") {
        const m = /^\.([\w-]+)/.exec(rest);
        if (!m || !el._classSet.has(m[1])) return false;
        rest = rest.slice(m[0].length);
      } else if (rest[0] === "[") {
        const m = /^\[([\w-]+)(?:=(?:"([^"]*)"|'([^']*)'|([^\]]*)))?\]/.exec(rest);
        if (!m) return false;
        const attr = m[1].toLowerCase();
        const want = m[2] ?? m[3] ?? m[4];
        if (!el.attrs.has(attr)) return false;
        if (want !== undefined && el.attrs.get(attr) !== want) return false;
        rest = rest.slice(m[0].length);
      } else {
        return false;
      }
    }
    return true;
  }

  function matchesSelector(el, selector) {
    return String(selector).split(",").some((branch) => {
      const parts = branch.trim().split(/\s+/).filter(Boolean);
      if (!parts.length || !matchesSimple(el, parts[parts.length - 1])) return false;
      let cur = el.parentNode;
      for (let i = parts.length - 2; i >= 0; i--) {
        while (cur && !matchesSimple(cur, parts[i])) cur = cur.parentNode;
        if (!cur) return false;
        cur = cur.parentNode;
      }
      return true;
    });
  }

  function parseHtmlInto(root, html) {
    const stack = [root];
    const re = /<!--[\s\S]*?-->|<\/([a-zA-Z][\w-]*)\s*>|<([a-zA-Z][\w-]*)((?:\s+[^<>]*?)?)\s*(\/?)>|([^<]+)/g;
    let m;
    while ((m = re.exec(html))) {
      const top = stack[stack.length - 1];
      if (m[5] !== undefined) {
        top.childNodes.push(decodeEntities(m[5]));
      } else if (m[1]) {
        const closeTag = m[1].toUpperCase();
        for (let i = stack.length - 1; i > 0; i--) {
          if (stack[i].tagName === closeTag) { stack.length = i; break; }
        }
      } else if (m[2]) {
        const tag = m[2].toLowerCase();
        const el = new FakeElement(tag);
        const attrStr = m[3] || "";
        const attrRe = /([\w:-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
        let am;
        while ((am = attrRe.exec(attrStr))) {
          const val = am[2] !== undefined ? decodeEntities(am[2]) : am[3] !== undefined ? decodeEntities(am[3]) : am[4] !== undefined ? decodeEntities(am[4]) : "";
          el.setAttribute(am[1], val);
        }
        top.append(el);
        if (!VOID_TAGS.has(tag) && !m[4]) stack.push(el);
      }
    }
  }

  const document = {
    hidden: false,
    body: null,
    activeElement: null,
    createElement: (tag) => new FakeElement(tag),
    getElementById: (id) => document.body.querySelector("#" + id),
    querySelectorAll: (sel) => document.body.querySelectorAll(sel),
    addEventListener: (type, fn) => {
      if (!docListeners.has(type)) docListeners.set(type, new Set());
      docListeners.get(type).add(fn);
    },
    removeEventListener: (type, fn) => { docListeners.get(type)?.delete(fn); },
  };
  document.body = new FakeElement("body");
  document.activeElement = document.body;

  const env = {
    document,
    location: { hash },
    history: { replaceState: (_s, _t, url) => { env.location.hash = String(url).replace(/^[^#]*/, ""); } },
    CSS: { escape: (s) => String(s) },
    timers,
    setTimeout: (fn, ms) => {
      const id = nextTid++;
      timers.set(id, { fn, ms });
      return id;
    },
    clearTimeout: (id) => { timers.delete(id); },
  };
  return env;
}

function deferred() {
  let resolve, reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

const flush = () => new Promise((r) => setImmediate(r));

function installGlobals(env, fakeFetch) {
  const prev = {
    document: globalThis.document,
    location: globalThis.location,
    history: globalThis.history,
    fetch: globalThis.fetch,
    setTimeout: globalThis.setTimeout,
    clearTimeout: globalThis.clearTimeout,
    CSS: globalThis.CSS,
  };
  globalThis.document = env.document;
  globalThis.location = env.location;
  globalThis.history = env.history;
  globalThis.fetch = fakeFetch;
  globalThis.setTimeout = env.setTimeout;
  globalThis.clearTimeout = env.clearTimeout;
  globalThis.CSS = env.CSS;
  return () => {
    for (const [k, v] of Object.entries(prev)) {
      if (v === undefined) delete globalThis[k];
      else globalThis[k] = v;
    }
  };
}

function makeKho(duAn, dsDuAn = []) {
  const listeners = new Set();
  return {
    duAn,
    dsDuAn,
    state: { ownerName: "CEO", agents: [{ key: "pain", name: "Pain", platform: "claude" }, { key: "hinata", name: "Hinata", platform: "antigravity" }], events: [] },
    on(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    bao() { for (const fn of [...listeners]) fn(this); },
    async taiLaiDuAn() {},
  };
}

// ---------- 1. Kiểm hành vi race condition veTraLoi trong public/os/khu/tin-nhan.js ----------
test("tin-nhan.js: race A->B (B trả trước, A trả sau cả thành công lẫn lỗi) — UI luôn giữ B và không hẹn poll thừa", async (t) => {
  const env = createMiniDom({ hash: "#/tin-nhan" });
  const fakeFetch = async () => ({ ok: true, status: 200, json: async () => ({ ok: true, tin: [], conNua: false }) });
  const restore = installGlobals(env, fakeFetch);
  t.after(restore);

  const { mo } = await import(pathToFileURL(path.join(PUB, "os", "khu", "tin-nhan.js")).href);

  // Kịch bản 1: A -> B, B trả trước, A trả sau thành công kèm busy: true
  {
    const vung = env.document.createElement("div");
    env.document.body.append(vung);
    const kho = makeKho("D:\\proj-A", [{ path: "D:\\proj-A", name: "proj-A" }, { path: "D:\\proj-B", name: "proj-B" }]);
    const reqs = [];
    const ctl = (p) => {
      const d = deferred();
      reqs.push({ p, d });
      return d.promise;
    };

    const dong = await mo(vung, { kho, ctl });
    assert.equal(reqs.length, 1);
    assert.match(reqs[0].p, /workspace=D%3A%5Cproj-A&who=pain/);

    // Đổi dự án sang B khi request A chưa về
    kho.duAn = "D:\\proj-B";
    kho.bao();
    assert.equal(reqs.length, 2);
    assert.match(reqs[1].p, /workspace=D%3A%5Cproj-B&who=pain/);
    assert.equal(vung.querySelector("#traLoi").innerHTML, "", "phải xóa dữ liệu cũ ngay khi đổi dự án");

    // B trả về trước
    reqs[1].d.resolve({ chat: { name: "Pain", messages: [{ from: "ai", text: "Ket qua cua du an B" }], busy: false } });
    await flush();
    assert.match(vung.querySelector("#traLoi").textContent, /Ket qua cua du an B/);
    assert.equal(env.timers.size, 0, "B không busy thì chưa hẹn poll");

    // A trả về trễ (thành công + busy: true) -> phải bị bỏ qua hoàn toàn
    reqs[0].d.resolve({ chat: { name: "Pain", messages: [{ from: "ai", text: "Du lieu cu cua du an A" }], busy: true } });
    await flush();
    assert.match(vung.querySelector("#traLoi").textContent, /Ket qua cua du an B/, "UI vẫn phải là B");
    assert.doesNotMatch(vung.querySelector("#traLoi").textContent, /Du lieu cu cua du an A/);
    assert.equal(env.timers.size, 0, "request A trễ không được hẹn poll mới");

    dong();
  }

  // Kịch bản 2: A -> B, B trả trước, A lỗi trễ -> không được ghi đè UI B bằng lỗi của A
  {
    const vung = env.document.createElement("div");
    env.document.body.append(vung);
    const kho = makeKho("D:\\proj-A");
    const reqs = [];
    const ctl = (p) => { const d = deferred(); reqs.push({ p, d }); return d.promise; };

    const dong = await mo(vung, { kho, ctl });
    kho.duAn = "D:\\proj-B";
    kho.bao();
    reqs[1].d.resolve({ chat: { name: "Pain", messages: [{ from: "ai", text: "Ban moi cua B" }], busy: false } });
    await flush();

    reqs[0].d.reject(new Error("Loi tre tu A"));
    await flush();
    assert.match(vung.querySelector("#traLoi").textContent, /Ban moi cua B/);
    assert.doesNotMatch(vung.querySelector("#traLoi").textContent, /Loi tre tu A/);
    assert.equal(vung.querySelector("#traLoi .loi"), null);

    dong();
  }

  // Kịch bản 3: A -> B -> A (quay lại A trước khi yêu cầu A cũ trả về) -> generation chặn A cũ ghi đè A mới
  {
    const vung = env.document.createElement("div");
    env.document.body.append(vung);
    const kho = makeKho("D:\\proj-A");
    const reqs = [];
    const ctl = (p) => { const d = deferred(); reqs.push({ p, d }); return d.promise; };

    const dong = await mo(vung, { kho, ctl });
    kho.duAn = "D:\\proj-B"; kho.bao();
    kho.duAn = "D:\\proj-A"; kho.bao();
    assert.equal(reqs.length, 3);

    reqs[2].d.resolve({ chat: { name: "Pain", messages: [{ from: "ai", text: "A moi nhat" }], busy: true } });
    await flush();
    assert.match(vung.querySelector("#traLoi").textContent, /A moi nhat/);
    assert.equal(env.timers.size, 1);

    // A cũ (gen 1) trả trễ -> vẫn bị chặn dù kho.duAn hiện lại là A
    reqs[0].d.resolve({ chat: { name: "Pain", messages: [{ from: "ai", text: "A cu bi lac" }], busy: false } });
    await flush();
    assert.match(vung.querySelector("#traLoi").textContent, /A moi nhat/);
    assert.doesNotMatch(vung.querySelector("#traLoi").textContent, /A cu bi lac/);

    // Đóng khu khi đang có kết quả + timer poll -> phải xóa sạch #traLoi và hủy timer
    dong();
    assert.equal(vung.querySelector("#traLoi").innerHTML, "");
    assert.equal(env.timers.size, 0);
  }
});

test("tin-nhan.js: đổi phòng, đổi chế độ hoi->giao và đóng khu xóa dữ liệu cũ, chặn phản hồi/lỗi trễ và hủy poll", async (t) => {
  const env = createMiniDom({ hash: "#/tin-nhan" });
  const fakeFetch = async () => ({ ok: true, status: 200, json: async () => ({ ok: true, tin: [], conNua: false }) });
  const restore = installGlobals(env, fakeFetch);
  t.after(restore);

  const { mo } = await import(pathToFileURL(path.join(PUB, "os", "khu", "tin-nhan.js")).href);
  const vung = env.document.createElement("div");
  env.document.body.append(vung);
  const kho = makeKho("D:\\proj-A");
  const reqs = [];
  const ctl = (p) => { const d = deferred(); reqs.push({ p, d }); return d.promise; };

  const dong = await mo(vung, { kho, ctl });
  // Pain trả về có busy: true -> tạo timer poll
  reqs[0].d.resolve({ chat: { name: "Pain", messages: [{ from: "ai", text: "Pain dang doc" }], busy: true } });
  await flush();
  assert.match(vung.querySelector("#traLoi").textContent, /Pain dang doc/);
  assert.equal(env.timers.size, 1, "busy phải đặt 1 timer poll");

  // Đổi phòng Pain -> Hinata: xóa ngay nội dung cũ và hủy timer poll cũ
  const sel = vung.querySelector("#nguoiHoi");
  sel.value = "hinata";
  sel.dispatchEvent({ type: "change", target: sel });
  assert.equal(vung.querySelector("#traLoi").innerHTML, "", "đổi phòng phải xóa ngay nội dung phòng cũ");
  assert.equal(env.timers.size, 0, "timer poll của phòng cũ phải bị hủy");
  assert.match(reqs[1].p, /who=hinata/);

  // Đổi tiếp sang chế độ Giao việc trong lúc Hinata chưa trả lời
  const btnGiao = vung.querySelector('[data-che-do="giao"]');
  btnGiao.click();
  assert.equal(vung.querySelector("#traLoi").innerHTML, "");

  // Hinata trả lời trễ (kèm busy: true) -> bị bỏ qua vì đã sang chế độ giao việc
  reqs[1].d.resolve({ chat: { name: "Hinata", messages: [{ from: "ai", text: "Hinata tre" }], busy: true } });
  await flush();
  assert.equal(vung.querySelector("#traLoi").innerHTML, "", "đang ở chế độ giao việc không được vẽ câu trả lời trễ");
  assert.equal(env.timers.size, 0);

  // Quay lại chế độ Hỏi -> gọi mới, rồi đóng khu (unmount) trước khi về
  const btnHoi = vung.querySelector('[data-che-do="hoi"]');
  btnHoi.click();
  assert.equal(reqs.length, 3);
  dong();
  reqs[2].d.resolve({ chat: { name: "Hinata", messages: [{ from: "ai", text: "Sau khi dong" }], busy: true } });
  await flush();
  assert.equal(vung.querySelector("#traLoi").innerHTML, "", "đã đóng khu thì phản hồi trễ không được vẽ");
  assert.equal(env.timers.size, 0, "đã đóng khu thì không được hẹn poll");
});

// ---------- 2. Kiểm hành vi awaiting_scan, Chạy tiếp chủ động và scan.truncated trên giao-viec.js ----------
test("giao-viec.js: awaiting_scan nhưng lần quét mới approved (sạch / đã duyệt) -> hiện nút Chạy tiếp chủ động, bấm gửi đúng workspace & fingerprint", async (t) => {
  const env = createMiniDom({ hash: "#/code/giao-viec" });
  const restore = installGlobals(env, async () => ({ ok: true, status: 200, json: async () => ({}) }));
  t.after(restore);

  const { mo } = await import(pathToFileURL(path.join(PUB, "os", "khu", "giao-viec.js")).href);

  // 2a. Lần quét mới sạch (approved: true, fingerprint: null)
  {
    const vung = env.document.createElement("div");
    env.document.body.append(vung);
    const ws = "D:\\Projects\\app-clean";
    const kho = makeKho(ws, [{ path: ws, name: "app-clean" }]);
    const calls = [], toasts = [];
    const ctl = async (p, body) => {
      calls.push({ p, body });
      if (p.startsWith("/ai/status")) return { turn: { phase: "Phase 2", nextOwner: "CODEX_ASTRA_DEV" }, runnable: true };
      if (p.startsWith("/scan?")) return { scan: { approved: true, truncated: false, fingerprint: null, total: 0, findings: [] } };
      if (p === "/autopilot") return { runs: [{ id: "run-1", workspace: ws, status: "awaiting_scan", task: "Sua loi X", maxSteps: 8, steps: [], updatedAt: Date.now() }] };
      if (p === "/scan/approve") return { scan: { approved: true, truncated: false, fingerprint: null, total: 0, findings: [] }, resumed: ["run-1"] };
      return {};
    };

    const dong = await mo(vung, { kho, ctl, bao: (msg, err) => toasts.push({ msg, err }), ngan: { mo() {} } });
    await flush();

    assert.ok(calls.some((c) => c.p === `/scan?workspace=${encodeURIComponent(ws)}&fresh=1`), "phải gọi GET /scan?workspace=...&fresh=1");
    assert.ok(!calls.some((c) => c.p === "/scan/approve"), "không được tự động chạy tiếp khi mới mở trang");

    const btn = vung.querySelector("[data-chay-tiep-scan]");
    assert.ok(btn, "phải hiện nút Chạy tiếp chủ động khi awaiting_scan và scan.approved");
    assert.equal(btn.textContent.trim(), "Chạy tiếp");
    assert.equal(vung.querySelector("[data-duyet-scan]"), null, "không hiện nút duyệt tìm thấy khi đã sạch");
    assert.equal(vung.querySelector("#nutGiao").disabled, true, "vẫn khóa giao luồng mới khi luồng cũ đang chờ");

    // Bấm nút Chạy tiếp
    btn.click();
    await flush();
    const approveCall = calls.find((c) => c.p === "/scan/approve");
    assert.ok(approveCall, "bấm Chạy tiếp phải gọi POST /scan/approve");
    assert.deepEqual(approveCall.body, { workspace: ws, fingerprint: "" });
    assert.ok(toasts.some((x) => !x.err && /Đã chạy tiếp 1 luồng/.test(x.msg)));
    dong();
  }

  // 2b. Lần quét mới đã duyệt trước đó (approved: true, fingerprint khác null) -> gửi đúng fingerprint đó
  {
    const vung = env.document.createElement("div");
    env.document.body.append(vung);
    const ws = "D:\\Projects\\app-approved";
    const kho = makeKho(ws, [{ path: ws, name: "app-approved" }]);
    const calls = [];
    const ctl = async (p, body) => {
      calls.push({ p, body });
      if (p.startsWith("/ai/status")) return { turn: { phase: "Phase 3", nextOwner: "CODEX_ASTRA_DEV" }, runnable: true };
      if (p.startsWith("/scan?")) return { scan: { approved: true, truncated: false, fingerprint: "fp1234567890abcd", total: 1, findings: [{ file: "README.md", line: 3, name: "Mục đã duyệt", text: "ok" }] } };
      if (p === "/autopilot") return { runs: [{ id: "run-2", workspace: ws, status: "awaiting_scan", task: "Tiep tuc Y", maxSteps: 8, steps: [], updatedAt: Date.now() }] };
      if (p === "/scan/approve") return { scan: { approved: true, truncated: false, fingerprint: "fp1234567890abcd", total: 1, findings: [] }, resumed: ["run-2"] };
      return {};
    };

    const dong = await mo(vung, { kho, ctl, bao() {}, ngan: { mo() {} } });
    await flush();
    const btn = vung.querySelector("[data-chay-tiep-scan]");
    assert.ok(btn, "phải hiện nút Chạy tiếp khi fingerprint đã duyệt");
    btn.click();
    await flush();
    const approveCall = calls.find((c) => c.p === "/scan/approve");
    assert.deepEqual(approveCall.body, { workspace: ws, fingerprint: "fp1234567890abcd" });
    dong();
  }
});

test("giao-viec.js: scan.truncated không hiện nút duyệt Toàn quyền hay Chạy tiếp; findings chưa duyệt khi awaiting_scan vẫn duyệt được; hỗ trợ ?workspace=", async (t) => {
  const wsA = "D:\\Projects\\app-a";
  const wsB = "D:\\Projects\\app-b";
  const env = createMiniDom({ hash: "#/code/giao-viec?workspace=" + encodeURIComponent(wsB) });
  const restore = installGlobals(env, async () => ({ ok: true, status: 200, json: async () => ({}) }));
  t.after(restore);

  const { mo } = await import(pathToFileURL(path.join(PUB, "os", "khu", "giao-viec.js")).href);

  // 2c. truncated === true + deep-link ?workspace=wsB
  {
    const vung = env.document.createElement("div");
    env.document.body.append(vung);
    const kho = makeKho(wsA, [{ path: wsA, name: "app-a" }, { path: wsB, name: "app-b" }]);
    const calls = [];
    const ctl = async (p, body) => {
      calls.push({ p, body });
      if (p.startsWith("/ai/status")) return { turn: { phase: "Phase 2", nextOwner: "CODEX_ASTRA_DEV" }, runnable: true };
      if (p.startsWith("/scan?")) return { scan: { approved: false, truncated: true, fingerprint: "fp-trunc", total: 1, findings: [{ file: "BIG.md", line: 0, name: "File quá lớn", text: "2048 KB" }] } };
      if (p === "/autopilot") return { runs: [{ id: "run-t", workspace: wsB, status: "awaiting_scan", task: "Viec B", maxSteps: 8, steps: [], updatedAt: Date.now() }] };
      return {};
    };

    const dong = await mo(vung, { kho, ctl, bao() {}, ngan: { mo() {} } });
    await flush();

    assert.ok(calls.some((c) => c.p === `/scan?workspace=${encodeURIComponent(wsB)}&fresh=1`), "link ?workspace= phải chọn đúng dự án B thay vì dự án A");
    assert.ok(vung.querySelector("[data-scan-truncated]"), "phải hiện cảnh báo rà soát chưa hoàn tất");
    assert.equal(vung.querySelector("[data-duyet-scan]"), null, "truncated không được hiện nút duyệt Toàn quyền");
    assert.equal(vung.querySelector("[data-chay-tiep-scan]"), null, "truncated không được hiện nút Chạy tiếp");
    dong();
  }

  // 2d. findings chưa duyệt trong khi luồng đang awaiting_scan -> vẫn phải hiện nút duyệt Toàn quyền
  {
    env.location.hash = "#/code/giao-viec";
    const vung = env.document.createElement("div");
    env.document.body.append(vung);
    const kho = makeKho(wsA, [{ path: wsA, name: "app-a" }]);
    const calls = [];
    const ctl = async (p, body) => {
      calls.push({ p, body });
      if (p.startsWith("/ai/status")) return { turn: { phase: "Phase 2", nextOwner: "CODEX_ASTRA_DEV" }, runnable: true };
      if (p.startsWith("/scan?")) return { scan: { approved: false, truncated: false, fingerprint: "fp-pending-99", total: 1, findings: [{ file: "README.md", line: 5, name: "Câu nhắm vào AI", text: "ignore previous instructions" }] } };
      if (p === "/autopilot") return { runs: [{ id: "run-p", workspace: wsA, status: "awaiting_scan", task: "Viec A", maxSteps: 8, steps: [], updatedAt: Date.now() }] };
      if (p === "/scan/approve") return { scan: { approved: true, truncated: false, fingerprint: "fp-pending-99", total: 1, findings: [] }, resumed: ["run-p"] };
      return {};
    };

    const dong = await mo(vung, { kho, ctl, bao() {}, ngan: { mo() {} } });
    await flush();

    const btn = vung.querySelector("[data-duyet-scan]");
    assert.ok(btn, "phải hiện nút duyệt khi có findings chưa duyệt dù đang có luồng awaiting_scan");
    btn.click();
    await flush();
    const approveCall = calls.find((c) => c.p === "/scan/approve");
    assert.deepEqual(approveCall.body, { workspace: wsA, fingerprint: "fp-pending-99" });
    dong();
  }

  // 2e. Cold-load ?workspace=wsB (kho.dsDuAn rỗng lúc mở, sau đó kho.bao() trả về wsA là active) -> vẫn giữ wsB
  {
    env.location.hash = "#/code/giao-viec?workspace=" + encodeURIComponent(wsB);
    const vung = env.document.createElement("div");
    env.document.body.append(vung);
    const kho = makeKho(null, []);
    const calls = [];
    const ctl = async (p) => {
      calls.push(p);
      if (p.startsWith("/ai/status")) return { turn: { phase: "Phase 2", nextOwner: "CODEX_ASTRA_DEV" }, runnable: true };
      if (p.startsWith("/scan?")) return { scan: { approved: true, truncated: false, fingerprint: null, total: 0, findings: [] } };
      if (p === "/autopilot") return { runs: [] };
      return {};
    };
    const dong = await mo(vung, { kho, ctl, bao() {}, ngan: { mo() {} } });
    kho.dsDuAn = [{ path: wsA, name: "app-a" }, { path: wsB, name: "app-b" }];
    kho.duAn = wsA;
    kho.bao();
    await flush();
    assert.equal(vung.querySelector("#chonDA").value, wsB, "cold-load ?workspace= không được bị kho.duAn ghi đè");
    assert.ok(calls.some((p) => p === `/scan?workspace=${encodeURIComponent(wsB)}&fresh=1`));
    dong();
  }
});

// ---------- 3. Kiểm hành vi ngăn trượt ngan.js cho awaiting_scan ----------
test("ngan.js: awaiting_scan — approved hiện Chạy tiếp gửi /scan/approve, truncated không duyệt, mất snapshot hiện link Giao việc đúng dự án", async (t) => {
  const env = createMiniDom({ hash: "#/code/dieu-khien" });
  const fakeFetch = async () => ({ ok: true, status: 200, headers: { get: () => "0" }, text: async () => "" });
  const restore = installGlobals(env, fakeFetch);
  t.after(restore);

  const { taoNgan } = await import(pathToFileURL(path.join(PUB, "os", "ngan.js")).href);
  const ws = "D:\\Projects\\app-ngan";
  let scanResp = { ok: true, scan: { approved: true, truncated: false, fingerprint: null, total: 0, findings: [] } };
  const calls = [];
  const ctl = async (p, body) => {
    calls.push({ p, body });
    if (p === "/autopilot/run-s") return { run: { id: "run-s", workspace: ws, status: "awaiting_scan", task: "Fix scan", maxSteps: 6, steps: [], updatedAt: Date.now() } };
    if (p.startsWith("/scan?")) {
      if (scanResp instanceof Error) throw scanResp;
      return scanResp;
    }
    if (p === "/scan/approve") return { scan: { approved: true, truncated: false, fingerprint: null, total: 0, findings: [] }, resumed: ["run-s"] };
    return {};
  };

  const ngan = taoNgan({ ctl, bao() {} });
  const dlg = env.document.body.querySelector("dialog.ngan");

  // 3a. scan.approved -> có nút Chạy tiếp chủ động, bấm gửi đúng workspace & fingerprint
  ngan.mo("luong:run-s");
  await flush();
  await flush();
  assert.ok(calls.some((c) => c.p === `/scan?workspace=${encodeURIComponent(ws)}&fresh=1`));
  const btn = dlg.querySelector("[data-chay-tiep-scan]");
  assert.ok(btn, "ngăn phải hiện nút Chạy tiếp khi scan.approved");
  btn.click();
  await flush();
  assert.deepEqual(calls.find((c) => c.p === "/scan/approve").body, { workspace: ws, fingerprint: "" });
  ngan.dong();

  // 3b. scan.truncated -> không có nút Chạy tiếp hay duyệt Toàn quyền, có link về Giao việc đúng dự án
  scanResp = { ok: true, scan: { approved: false, truncated: true, fingerprint: "fp-tr", total: 1, findings: [] } };
  ngan.mo("luong:run-s");
  await flush();
  await flush();
  assert.equal(dlg.querySelector("[data-chay-tiep-scan]"), null, "truncated trong ngăn không được hiện nút Chạy tiếp");
  const linkT = dlg.querySelector('a[data-k="ve-giao-viec"]');
  assert.ok(linkT && linkT.getAttribute("href") === "#/code/giao-viec?workspace=" + encodeURIComponent(ws));
  ngan.dong();

  // 3c. Không có snapshot /scan hiện tại -> hiện link về Giao việc đúng dự án, không hiện nút Chạy tiếp
  scanResp = new Error("CTL tạm lỗi");
  ngan.mo("luong:run-s");
  await flush();
  await flush();
  assert.equal(dlg.querySelector("[data-chay-tiep-scan]"), null, "không có snapshot tươi thì không hiện nút Chạy tiếp");
  const linkF = dlg.querySelector('a[data-k="ve-giao-viec"]');
  assert.ok(linkF && linkF.getAttribute("href") === "#/code/giao-viec?workspace=" + encodeURIComponent(ws));
  ngan.dong();
});

// ---------- 4. Kiểm hành vi progress-view.js (dùng chung cho prototype.js & office-desk.js) ----------
test("progress-view.js scanHtml: awaiting_scan + approved hiện Chạy tiếp chỉ trên desktop; truncated không có nút duyệt", () => {
  const ctx = {};
  vm.runInNewContext(fs.readFileSync(path.join(PUB, "progress-view.js"), "utf8"), ctx);
  const { scanHtml } = ctx.RepoProgress;

  // Desktop + awaiting_scan + scan sạch -> nút Chạy tiếp với fingerprint rỗng
  const desktopClean = scanHtml({ approved: true, truncated: false, fingerprint: null, total: 0, findings: [] }, "D:\\repo", "data-scan-approve", { canApprove: true, hasAwaitingScan: true });
  assert.match(desktopClean, /data-scan-mode="resume"/);
  assert.match(desktopClean, /data-scan-approve=""/);
  assert.match(desktopClean, /data-scan-workspace="D:\\repo"/);
  assert.match(desktopClean, />Chạy tiếp<\/button>/);

  // Desktop + awaiting_scan + scan đã duyệt có fingerprint -> giữ đúng fingerprint
  const desktopFp = scanHtml({ approved: true, truncated: false, fingerprint: "abc999", total: 1, findings: [] }, "D:\\repo", "data-scan", { canApprove: true, hasAwaitingScan: true });
  assert.match(desktopFp, /data-scan="abc999"/);
  assert.match(desktopFp, />Chạy tiếp<\/button>/);

  // Điện thoại từ xa (canApprove: false) -> không được hiện nút Chạy tiếp
  const remoteClean = scanHtml({ approved: true, truncated: false, fingerprint: null, total: 0, findings: [] }, "D:\\repo", "data-scan", { canApprove: false, hasAwaitingScan: true });
  assert.doesNotMatch(remoteClean, /<button/);
  assert.match(remoteClean, /chỉ thực hiện trên máy tính/);

  // truncated -> không bao giờ hiện nút duyệt Toàn quyền hay Chạy tiếp
  const trunc = scanHtml({ approved: false, truncated: true, fingerprint: "fp-x", total: 2, findings: [] }, "D:\\repo", "data-scan-approve", { canApprove: true, hasAwaitingScan: true });
  assert.doesNotMatch(trunc, /<button/);
  assert.match(trunc, /data-scan-truncated/);

  // Không có luồng awaiting_scan và đã duyệt -> trả rỗng
  assert.equal(scanHtml({ approved: true, truncated: false, fingerprint: null, total: 0, findings: [] }, "D:\\repo", "data-scan-approve", { canApprove: true, hasAwaitingScan: false }), "");

  // Kiểm nối dây ở prototype.js và office-desk.js dùng &fresh=1 và hasAwaitingScan
  const proto = fs.readFileSync(path.join(PUB, "prototype.js"), "utf8");
  assert.match(proto, /\/ctl\/scan\?workspace=" \+ encodeURIComponent\(active\) \+ "&fresh=1"/);
  assert.match(proto, /hasAwaitingScan/);
  const desk = fs.readFileSync(path.join(PUB, "office-desk.js"), "utf8");
  assert.match(desk, /\/scan\?workspace=" \+ encodeURIComponent\(active\) \+ "&fresh=1"/);
  assert.match(desk, /canApprove: !isRemote, hasAwaitingScan/);
  assert.match(desk, /if \(sb && !sb\.disabled && !isRemote\)/);
});
