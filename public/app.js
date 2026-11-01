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
})();
