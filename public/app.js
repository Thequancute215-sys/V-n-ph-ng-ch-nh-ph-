// Phần "app" dùng chung cho mọi trang: đăng ký service worker (trang hướng dẫn khi văn phòng chưa chạy)
// và nút "Cài app" cho trình duyệt Edge/Chrome. Nút nào có data-cai-app sẽ chỉ hiện khi trình duyệt cho phép cài.
"use strict";
(function () {
  if ("serviceWorker" in navigator && (location.protocol === "https:" || /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname))) {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }
  let prompt = null;
  const buttons = () => document.querySelectorAll("[data-cai-app]");
  const show = (on) => buttons().forEach((b) => { b.hidden = !on; });
  window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); prompt = e; show(true); });
  window.addEventListener("appinstalled", () => { prompt = null; show(false); });
  document.addEventListener("click", async (e) => {
    const b = e.target.closest && e.target.closest("[data-cai-app]");
    if (!b || !prompt) return;
    prompt.prompt();
    await prompt.userChoice.catch(() => {});
    prompt = null; show(false);
  });

  // Khi trang cũ được nhúng trong iframe của Thế Quân OS (os.html): ẩn thanh điều hướng độc lập và chặn liên kết thoát/lồng os.html.
  let inOs = false;
  try { inOs = window.self !== window.top && /\/os\.html$/i.test(window.top.location.pathname); } catch {}
  if (inOs) {
    const OS_ROUTE = {
      "": "#/", "index.html": "#/", "os.html": "#/",
      "prototype.html": "#/cu/bang-dieu-phoi", "dieukhien.html": "#/cu/dieu-khien-may",
      "skill.html": "#/code/skill", "hopthu.html": "#/code/hop-thu",
      "characters.html": "#/phim/nhan-vat", "xuong-phim.html": "#/phim",
      "hieusuat.html": "#/doi/hieu-suat", "noiquy.html": "#/doi/noi-quy",
      "ket-noi.html": "#/he/ket-noi", "dien-thoai.html": "#/he/dien-thoai",
      "cap-nhat.html": "#/he/cap-nhat", "tinnhan.html": "#/tin-nhan",
    };
    const st = document.createElement("style");
    st.textContent = 'a.back[href="index.html"],a.back[href="/"],a.back[href="./"],header.app-header a.button[href="/"],body>p:first-child:has(>a[href="/"]:only-child),body>p:first-child>a[href="/"],nav.views,div.views,button[onclick*="index.html"]{display:none!important}';
    (document.head || document.documentElement).appendChild(st);
    document.addEventListener("click", (e) => {
      const a = e.target.closest && e.target.closest("a[href]");
      if (!a || (a.target && a.target !== "_self" && a.target !== "_top")) return;
      const raw = a.getAttribute("href");
      if (!raw || raw.startsWith("#")) return;
      let u; try { u = new URL(raw, location.href); } catch { return; }
      if (u.origin !== location.origin) return;
      const base = u.pathname.replace(/^.*\//, "");
      if (Object.prototype.hasOwnProperty.call(OS_ROUTE, base)) {
        e.preventDefault();
        window.top.location.hash = OS_ROUTE[base];
      }
    });
  }
})();
