// Service worker của app Văn phòng AI. Chỉ làm 1 việc: khi máy chủ văn phòng chưa chạy, mở app thì hiện trang hướng dẫn
// (offline.html) thay vì trang lỗi của trình duyệt. KHÔNG lưu đệm trang hay dữ liệu nào khác: văn phòng là dữ liệu trực tiếp,
// lưu đệm sẽ hiện giao diện cũ (bài học BROWSER-CACHE).
"use strict";
const CACHE = "vp-offline-v2";
const OFFLINE = ["offline.html"]; // trang tự chứa (biểu tượng nhúng sẵn), không cần tải gì thêm khi văn phòng tắt

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(OFFLINE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener("fetch", (e) => {
  if (e.request.mode !== "navigate") return; // mọi yêu cầu khác đi thẳng ra mạng như không có service worker
  e.respondWith(fetch(e.request).catch(() => caches.match("offline.html")));
});
