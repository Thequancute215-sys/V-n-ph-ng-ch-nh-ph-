#!/usr/bin/env python3
"""Xưởng phim AI — đọc lời dẫn và xuất phụ đề có mốc thời gian (P0, CEO duyệt 20/11/2026).

Hai bộ giọng:
  - Edge-TTS (cần mạng, miễn phí): tiếng Việt và tiếng Anh.
  - Kokoro-82M (chạy trên máy, không cần mạng): tiếng Anh.

Đầu ra: <output>.mp3 (hoặc .wav khi không có FFmpeg), <output>.srt và <output>.json.
<output>.json là danh sách câu {index, startMs, endMs, startSec, endSec, durationMs, text};
Remotion/HyperFrames và hồ sơ phim lấy thời lượng từng cảnh từ file này.

Văn phòng chạy script bằng Python chung của xưởng (biến XUONG_PHIM_PYTHON) để mọi phòng thấy cùng thư viện.
Mã thoát: 0 xong; 1 sai đầu vào; 2 bộ giọng lỗi (không để lại file rỗng); 3 thiếu thư viện hoặc model.

Bản gốc do Antigravity viết trong skill /videopromax; bản này sửa: đọc file có BOM, thử lại Edge-TTS khi mạng chập chờn,
không để lại mp3 0 byte khi lỗi, tìm model và FFmpeg theo cấu hình văn phòng, gọi FFmpeg không qua shell.
"""

import argparse
import asyncio
import json
import os
import re
import shutil
import subprocess
import sys
import time

if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass

THU_MUC_XUONG = os.path.join(os.path.expanduser("~"), ".van-phong-ao", "xuong-phim")
MODEL_ONNX = "kokoro-v1.0.onnx"
MODEL_VOICES = "voices-v1.0.bin"

VOICE_PRESETS = {
    # Tiếng Việt (Edge-TTS)
    "vi-nam": "vi-VN-NamMinhNeural",
    "vi-nu": "vi-VN-HoaiMyNeural",
    # Tiếng Anh Mỹ (Edge-TTS)
    "en-us-authority": "en-US-ChristopherNeural",
    "en-us-confident": "en-US-AndrewNeural",
    "en-us-commercial": "en-US-AriaNeural",
    "en-us-friendly": "en-US-AvaNeural",
    # Tiếng Anh Anh (Edge-TTS)
    "en-uk-male": "en-GB-RyanNeural",
    "en-uk-female": "en-GB-SoniaNeural",
    # Tiếng Anh chạy trên máy (Kokoro-82M)
    "kokoro-heart": "af_heart",
    "kokoro-bella": "af_bella",
    "kokoro-adam": "am_adam",
    "kokoro-michael": "am_michael",
    "kokoro-emma": "bf_emma",
    "kokoro-george": "bm_george",
}
KOKORO_VOICES = {"af_heart", "af_bella", "af_nicole", "af_aoede", "am_adam", "am_michael", "bf_emma", "bf_isabella", "bm_george", "bm_lewis"}


class LoiGiong(Exception):
    """Bộ giọng không trả về âm thanh dùng được."""


def thoat(ma, thong_bao):
    print("[LOI] " + thong_bao, file=sys.stderr)
    sys.exit(ma)


def la_kokoro(voice):
    v = voice.lower()
    return v.startswith("kokoro-") or v in KOKORO_VOICES


def thu_muc_goc():
    """Thư mục gốc của xưởng: ~/.van-phong-ao/xuong-phim.json {"thuMuc": ...} nếu có (vd. ổ D), không thì mặc định."""
    try:
        with open(os.path.join(os.path.dirname(THU_MUC_XUONG), "xuong-phim.json"), encoding="utf-8-sig") as f:
            t = json.load(f).get("thuMuc")
        if isinstance(t, str) and os.path.isabs(t):
            return t
    except Exception:
        pass
    return THU_MUC_XUONG


def thu_muc_model(tham_so):
    return tham_so or os.environ.get("XUONG_PHIM_MODELS") or os.path.join(thu_muc_goc(), "models")


def tim_ffmpeg():
    p = os.environ.get("XUONG_PHIM_FFMPEG")
    if p and os.path.isfile(p):
        return p
    return shutil.which("ffmpeg")


def ms_srt(ms):
    h, ms = divmod(int(ms), 3600000)
    m, ms = divmod(ms, 60000)
    s, ms = divmod(ms, 1000)
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"


def dong(index, start_ms, end_ms, text):
    return {
        "index": index,
        "startMs": start_ms,
        "endMs": end_ms,
        "startSec": round(start_ms / 1000.0, 3),
        "endSec": round(end_ms / 1000.0, 3),
        "durationMs": end_ms - start_ms,
        "text": text,
    }


def chuan_hoa_moc(cac_dong):
    """Rút câu trước nếu chồng mốc, giữ nguyên mốc bắt đầu và số thứ tự."""
    ra = []
    for i, d in enumerate(cac_dong):
        start, end = d["startMs"], d["endMs"]
        if i + 1 < len(cac_dong):
            end = min(end, cac_dong[i + 1]["startMs"])
        ra.append(dong(d["index"], start, max(start, end), d["text"]))
    return ra


def srt_sang_json(srt):
    mau = re.compile(
        r"(\d+)\r?\n(\d{2}):(\d{2}):(\d{2}),(\d{3}) --> (\d{2}):(\d{2}):(\d{2}),(\d{3})\r?\n([\s\S]*?)(?=\r?\n\r?\n|\Z)"
    )
    ra = []
    for m in mau.finditer(srt.strip()):
        g = [int(m.group(i)) for i in range(2, 10)]
        start = (g[0] * 3600 + g[1] * 60 + g[2]) * 1000 + g[3]
        end = (g[4] * 3600 + g[5] * 60 + g[6]) * 1000 + g[7]
        ra.append(dong(int(m.group(1)), start, end, m.group(10).strip()))
    return ra


def ghi_phu_de(output_base, cac_dong):
    cac_dong = chuan_hoa_moc(cac_dong)
    with open(output_base + ".srt", "w", encoding="utf-8") as f:
        f.write("\n".join(f"{d['index']}\n{ms_srt(d['startMs'])} --> {ms_srt(d['endMs'])}\n{d['text']}\n" for d in cac_dong))
    with open(output_base + ".json", "w", encoding="utf-8") as f:
        json.dump(cac_dong, f, ensure_ascii=False, indent=2)


def xoa(*duong_dan):
    for p in duong_dan:
        try:
            os.remove(p)
        except OSError:
            pass


async def doc_edge_mot_lan(text, voice, tam, rate, volume):
    import edge_tts

    sub = edge_tts.SubMaker()
    co_am = False
    with open(tam, "wb") as f:
        async for chunk in edge_tts.Communicate(text, voice, rate=rate, volume=volume).stream():
            if chunk["type"] == "audio":
                f.write(chunk["data"])
                co_am = True
            else:
                sub.feed(chunk)
    if not co_am or os.path.getsize(tam) == 0:
        raise LoiGiong("Edge-TTS không trả về âm thanh")
    return sub.get_srt()


def doc_edge(text, voice, output_base, rate, volume, so_lan=3):
    try:
        import edge_tts  # noqa: F401
    except ImportError:
        thoat(3, "Thiếu thư viện edge-tts. Chạy script bằng Python chung của xưởng phim (biến XUONG_PHIM_PYTHON) hoặc bấm 'Cài xưởng phim' ở trang Kết nối.")
    voice = VOICE_PRESETS.get(voice.lower(), voice)
    mp3 = output_base + ".mp3"
    tam = mp3 + ".dang-ghi"
    loi = None
    for lan in range(1, so_lan + 1):
        try:
            srt = asyncio.run(doc_edge_mot_lan(text, voice, tam, rate, volume))
            os.replace(tam, mp3)
            cac_dong = srt_sang_json(srt)
            ghi_phu_de(output_base, cac_dong)
            print(f"[OK Edge-TTS] {voice}: {mp3} ({len(cac_dong)} câu, {cac_dong[-1]['endMs'] if cac_dong else 0} ms)")
            return
        except Exception as e:  # mạng chập chờn hoặc dịch vụ từ chối: thử lại có giãn cách
            loi = e
            xoa(tam)
            if lan < so_lan:
                time.sleep(2 * lan)
    xoa(mp3)
    thoat(2, f"Edge-TTS lỗi sau {so_lan} lần thử ({type(loi).__name__}: {loi}). Kiểm mạng, tên giọng '{voice}', và tham số --rate/--volume (dạng +0%).")


def doc_kokoro(text, voice, output_base, speed, models):
    try:
        import numpy as np
        import soundfile as sf
        from kokoro_onnx import Kokoro
    except ImportError as e:
        thoat(3, f"Thiếu thư viện cho Kokoro ({e.name}). Bấm 'Cài xưởng phim' ở trang Kết nối.")
    onnx, voices = os.path.join(models, MODEL_ONNX), os.path.join(models, MODEL_VOICES)
    for p in (onnx, voices):
        if not os.path.isfile(p):
            thoat(3, f"Thiếu model Kokoro: {p}. Bấm 'Cài xưởng phim' ở trang Kết nối.")

    voice = VOICE_PRESETS.get(voice.lower(), voice)
    kokoro = Kokoro(onnx, voices)
    lang = "en-gb" if voice.startswith("b") else "en-us"
    cau = [c.strip() for c in re.split(r"(?<=[.!?\n])\s+", text.strip()) if c.strip()]

    mau, cac_dong, t, sr = [], [], 0, 24000
    for i, c in enumerate(cau, 1):
        samples, sr = kokoro.create(c, voice=voice, speed=speed, lang=lang)
        dai = int(len(samples) / sr * 1000)
        cac_dong.append(dong(i, t, t + dai, c))
        mau.append(samples)
        mau.append(np.zeros(int(sr * 0.15), dtype=np.float32))  # nghỉ 0,15 giây giữa hai câu
        t += dai + 150
    if not cac_dong:
        thoat(1, "Kịch bản không có câu nào để đọc.")

    wav = output_base + ".wav"
    sf.write(wav, np.concatenate(mau), sr)
    am_thanh = wav
    ff = tim_ffmpeg()
    if ff:
        mp3 = output_base + ".mp3"
        r = subprocess.run([ff, "-y", "-loglevel", "error", "-i", wav, "-q:a", "2", mp3], capture_output=True)
        if r.returncode == 0 and os.path.isfile(mp3) and os.path.getsize(mp3) > 0:
            xoa(wav)
            am_thanh = mp3
        else:
            xoa(mp3)
    ghi_phu_de(output_base, cac_dong)
    print(f"[OK Kokoro] {voice}: {am_thanh} ({len(cac_dong)} câu, {cac_dong[-1]['endMs']} ms)")


def main():
    ap = argparse.ArgumentParser(description="Đọc lời dẫn (Việt/Anh) và xuất phụ đề có mốc thời gian.")
    ap.add_argument("--text", help="Kịch bản dạng chuỗi")
    ap.add_argument("--file", help="File .txt chứa kịch bản (UTF-8, có hoặc không BOM)")
    ap.add_argument("--output", default="voice", help="Đường dẫn xuất, không kèm đuôi")
    ap.add_argument("--voice", default="vi-nam", help="Preset: " + ", ".join(VOICE_PRESETS))
    ap.add_argument("--rate", default="+0%", help="Tốc độ Edge-TTS, vd +10%%")
    ap.add_argument("--volume", default="+0%", help="Âm lượng Edge-TTS, vd +0%%")
    ap.add_argument("--speed", type=float, default=1.0, help="Tốc độ Kokoro, vd 1.05")
    ap.add_argument("--models", help="Thư mục model Kokoro (mặc định <thư mục gốc xưởng phim>/models)")
    a = ap.parse_args()

    if a.text:
        text = a.text
    elif a.file and os.path.isfile(a.file):
        with open(a.file, "r", encoding="utf-8-sig") as f:
            text = f.read()
    else:
        thoat(1, "Cần --text hoặc --file hợp lệ.")
    text = text.replace("﻿", "").strip()
    if not text:
        thoat(1, "Kịch bản rỗng.")
    if not re.fullmatch(r"[+-]\d{1,3}%", a.rate) or not re.fullmatch(r"[+-]\d{1,3}%", a.volume):
        thoat(1, "--rate và --volume phải có dạng +10% hoặc -5%.")

    os.makedirs(os.path.dirname(os.path.abspath(a.output)), exist_ok=True)
    if la_kokoro(a.voice):
        doc_kokoro(text, a.voice, a.output, a.speed, thu_muc_model(a.models))
    else:
        doc_edge(text, a.voice, a.output, a.rate, a.volume)


if __name__ == "__main__":
    main()
