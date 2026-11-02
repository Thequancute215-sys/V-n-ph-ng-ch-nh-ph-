"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const { pathToFileURL } = require("url");

const load = () => import(pathToFileURL(path.join(__dirname, "..", "public", "thoitiet.js")).href);
const reply = (body, status = 200) => async (url) => ({ ok: status < 400, status, json: async () => body, url });

test("thời tiết: giờ Việt Nam là UTC+7, không phụ thuộc múi giờ máy", async () => {
  const { vietnamHour, vietnamClock } = await load();
  const d = new Date(Date.UTC(2026, 10, 2, 18, 30, 0));   // 18:30 UTC = 01:30 sáng hôm sau ở Việt Nam
  assert.equal(vietnamHour(d), 1.5);
  assert.equal(vietnamClock(d), "01:30");
  assert.equal(vietnamClock(new Date(Date.UTC(2026, 10, 2, 7, 5))), "14:05");
});

test("thời tiết: mã WMO → mô tả và thông số cảnh", async () => {
  const { toScene, describeWeather } = await load();
  assert.equal(describeWeather(63), "Mưa vừa");
  assert.equal(describeWeather(95), "Giông");
  assert.equal(describeWeather(1234), "Không rõ");
  assert.deepEqual(toScene({ weather_code: 0, cloud_cover: 10, wind_speed_10m: 6 }), { cloud: 0.1, rain: 0, fog: 0, storm: 0, wind: 0.4 });
  const rain = toScene({ weather_code: 65, cloud_cover: 20, wind_speed_10m: 30 });
  assert.equal(rain.rain, 1); assert.equal(rain.cloud, 0.75, "đang mưa thì trời ít nhất 75% mây"); assert.equal(rain.wind, 2);
  const storm = toScene({ weather_code: 99, cloud_cover: 100, wind_speed_10m: 90 });
  assert.equal(storm.storm, 1); assert.equal(storm.wind, 3, "gió bị chặn trên để cây không lay quá mức");
  assert.equal(toScene({ weather_code: 45, cloud_cover: 60 }).fog, 1);
});

test("thời tiết: gọi Open-Meteo đúng toạ độ Hà Nội, giờ Việt Nam, chỉ lấy số liệu hiện tại", async () => {
  const { fetchWeather, HANOI } = await load();
  let asked;
  const w = await fetchWeather(HANOI, async (url, opts) => {
    asked = new URL(url);
    assert.ok(opts.signal, "phải có hẹn giờ huỷ");
    return { ok: true, status: 200, json: async () => ({ current: { temperature_2m: 27.6, weather_code: 61, cloud_cover: 90, wind_speed_10m: 12 } }) };
  });
  assert.equal(asked.origin, "https://api.open-meteo.com");
  assert.equal(asked.searchParams.get("latitude"), "21.0285");
  assert.equal(asked.searchParams.get("longitude"), "105.8542");
  assert.equal(asked.searchParams.get("timezone"), "Asia/Ho_Chi_Minh");
  assert.deepEqual([w.temp, w.text, w.scene.rain], [28, "Mưa nhỏ", 0.45]);
});

test("thời tiết: lỗi mạng / dữ liệu hỏng báo lỗi rõ, không áp thời tiết giả vào cảnh", async () => {
  const { fetchWeather, connectLive } = await load();
  await assert.rejects(fetchWeather(undefined, reply({}, 500)), /lỗi 500/);
  await assert.rejects(fetchWeather(undefined, reply({ current: { weather_code: "x" } })), /không hợp lệ/);

  const calls = { hour: [], weather: [] };
  const office = { setHour: (h) => calls.hour.push(h), setWeather: (w) => calls.weather.push(w) };
  const updates = [];
  const live = connectLive(office, { fetchFn: async () => { throw new Error("mất mạng"); }, onUpdate: (u) => updates.push(u) });
  await new Promise((r) => setTimeout(r, 20));
  live.stop();
  assert.equal(calls.weather.length, 0);
  assert.ok(calls.hour.length >= 1, "giờ Việt Nam vẫn chạy khi mất mạng");
  assert.equal(updates.at(-1).weather.error, "mất mạng");
  assert.equal(updates.at(-1).place, "Hà Nội");
});

test("thời tiết: tự chỉnh giờ/thời tiết thì bản tin thật không ghi đè", async () => {
  const { connectLive } = await load();
  const calls = { hour: 0, weather: 0 };
  const office = { setHour: () => calls.hour++, setWeather: () => calls.weather++ };
  const ok = async () => ({ ok: true, status: 200, json: async () => ({ current: { temperature_2m: 30, weather_code: 0, cloud_cover: 0, wind_speed_10m: 5 } }) });
  const live = connectLive(office, { fetchFn: ok });
  live.manualHour = true; live.manualWeather = true;
  const before = calls.hour;
  await live.refresh();
  live.stop();
  assert.equal(calls.hour, before);
  assert.equal(calls.weather, 0, "đã tự chỉnh thì cả lần tải về sau cũng không áp vào cảnh");
  assert.equal(live.weather.temp, 30);
});
