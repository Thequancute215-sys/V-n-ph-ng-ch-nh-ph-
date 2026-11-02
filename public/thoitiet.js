// Giờ Việt Nam (UTC+7, không đổi giờ mùa hè) và thời tiết thật từ Open-Meteo cho văn phòng 3D.
// Không cần khóa API; trình duyệt chỉ gửi toạ độ thành phố tới api.open-meteo.com, không gửi dữ liệu dự án.

export const HANOI = { name: "Hà Nội", lat: 21.0285, lon: 105.8542 };
const REFRESH_MS = 15 * 60 * 1000, CLOCK_MS = 30 * 1000, TIMEOUT_MS = 10000;

export function vietnamHour(date = new Date()) {
  return ((date.getUTCHours() + 7) % 24) + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600;
}
export function vietnamClock(date = new Date()) {
  const h = (date.getUTCHours() + 7) % 24, m = date.getUTCMinutes();
  return String(h).padStart(2, "0") + ":" + String(m).padStart(2, "0");
}

// Mã thời tiết WMO (Open-Meteo dùng) → mô tả tiếng Việt
const WMO_TEXT = [
  [[0], "Trời quang"], [[1], "Ít mây"], [[2], "Mây rải rác"], [[3], "Nhiều mây"],
  [[45, 48], "Sương mù"], [[51, 53, 55], "Mưa phùn"], [[56, 57], "Mưa phùn lạnh"],
  [[61], "Mưa nhỏ"], [[63], "Mưa vừa"], [[65], "Mưa to"], [[66, 67], "Mưa lạnh"],
  [[71, 73, 75, 77], "Tuyết"], [[80], "Mưa rào nhẹ"], [[81], "Mưa rào"], [[82], "Mưa rào rất to"],
  [[85, 86], "Mưa tuyết"], [[95], "Giông"], [[96, 99], "Giông kèm mưa đá"],
];
const RAIN_BY_CODE = { 51: 0.25, 53: 0.35, 55: 0.45, 56: 0.3, 57: 0.45, 61: 0.45, 63: 0.7, 65: 1, 66: 0.5, 67: 0.8, 71: 0.4, 73: 0.5, 75: 0.6, 77: 0.4, 80: 0.5, 81: 0.75, 82: 1, 85: 0.5, 86: 0.7, 95: 0.9, 96: 1, 99: 1 };
const clamp01 = (x) => Math.min(1, Math.max(0, x));

export function describeWeather(code) {
  const hit = WMO_TEXT.find(([codes]) => codes.includes(code));
  return hit ? hit[1] : "Không rõ";
}

// Số liệu "current" của Open-Meteo → thông số cảnh: mây, mưa, sương, giông (0..1), gió (hệ số lay cây)
export function toScene(cur) {
  const code = cur.weather_code;
  const rain = RAIN_BY_CODE[code] ?? (cur.precipitation > 0 ? clamp01(cur.precipitation / 4) : 0);
  let cloud = Number.isFinite(cur.cloud_cover) ? clamp01(cur.cloud_cover / 100) : ({ 0: 0.1, 1: 0.25, 2: 0.5, 3: 0.9 }[code] ?? 0.5);
  if (rain > 0) cloud = Math.max(cloud, 0.75);
  return {
    cloud,
    rain,
    fog: code === 45 || code === 48 ? 1 : 0,
    storm: code >= 95 ? 1 : 0,
    wind: Math.min(3, Math.max(0.4, (cur.wind_speed_10m ?? 8) / 15)),
  };
}

export async function fetchWeather({ lat, lon } = HANOI, fetchFn = (u, o) => fetch(u, o)) {
  const url = "https://api.open-meteo.com/v1/forecast?latitude=" + lat + "&longitude=" + lon +
    "&current=temperature_2m,weather_code,cloud_cover,wind_speed_10m,precipitation&timezone=Asia%2FHo_Chi_Minh";
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetchFn(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error("Open-Meteo trả lỗi " + res.status);
    const cur = (await res.json())?.current;
    if (!cur || !Number.isFinite(cur.weather_code) || !Number.isFinite(cur.temperature_2m)) throw new Error("Dữ liệu thời tiết không hợp lệ");
    return { code: cur.weather_code, text: describeWeather(cur.weather_code), temp: Math.round(cur.temperature_2m), wind: cur.wind_speed_10m, scene: toScene(cur), at: Date.now() };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Cho văn phòng chạy theo giờ Việt Nam và thời tiết thật. Gọi onUpdate({ place, clock, weather }) mỗi lần đổi;
 * weather có thể là null (đang tải), { error } (chưa lấy được lần nào) hoặc số liệu kèm stale:true (lần cập nhật sau lỗi).
 * manualHour/manualWeather = true thì không ghi đè giờ/thời tiết người dùng tự chọn.
 */
export function connectLive(office, { place = HANOI, onUpdate = () => {}, fetchFn } = {}) {
  let weather = null, stopped = false, t1 = 0, t2 = 0;
  const live = {
    manualHour: false,
    manualWeather: false,
    refresh: () => pull(),
    get weather() { return weather; },
    stop() { stopped = true; clearInterval(t1); clearInterval(t2); },
  };
  const tick = () => {
    if (stopped) return;
    const now = new Date();
    if (!live.manualHour) office.setHour(vietnamHour(now));
    onUpdate({ place: place.name, clock: vietnamClock(now), weather });
  };
  const pull = async () => {
    try {
      weather = await fetchWeather(place, fetchFn);
      if (!live.manualWeather && !stopped) office.setWeather(weather.scene);
    } catch (err) {
      weather = weather && !weather.error ? { ...weather, stale: true } : { error: err.message };
    }
    tick();
  };
  tick();
  pull();
  t1 = setInterval(tick, CLOCK_MS);
  t2 = setInterval(pull, REFRESH_MS);
  return live;
}
