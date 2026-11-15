#!/usr/bin/env node
// Máy chủ MCP (stdio) "tra-cuu" cho lượt Claude/Codex: hai công cụ tim_kiem và doc_tai_lieu gọi Gemini miễn phí (ctl/tra-cuu.js).
// CLI tự chạy file này khi lượt AI bắt đầu (runner thêm cấu hình MCP khi CEO đã lưu khóa Gemini). Khóa đọc trong máy chủ này,
// AI chỉ thấy câu trả lời. Chạy: node ctl/tra-cuu-mcp.js <thư mục dữ liệu văn phòng>
"use strict";
const os = require("os");
const path = require("path");
const { createTraCuu, khoaGemini } = require("./tra-cuu");

const dir = process.argv[2] || process.env.VP_HOME || path.join(os.homedir(), ".van-phong-ao");
const tc = createTraCuu({ dir, khoa: () => khoaGemini(dir) });
const TOOLS = [
  { name: "tim_kiem", description: "Tìm trên web bằng Google qua Gemini (miễn phí) và trả lời ngắn kèm nguồn. Dùng cho việc đơn giản: tra lỗi, cách dùng thư viện, phiên bản mới nhất, so sánh nhanh. Chỉ gửi câu hỏi ngắn; KHÔNG gửi mã nguồn, nội dung file dự án, khóa, token, dữ liệu cá nhân.",
    inputSchema: { type: "object", properties: { cau_hoi: { type: "string", description: "Câu hỏi ngắn (≤1500 ký tự)" } }, required: ["cau_hoi"] } },
  { name: "doc_tai_lieu", description: "Đọc một trang công khai (tài liệu thư viện, changelog, bài viết) bằng Gemini (miễn phí) và trả lời câu hỏi về nó, đỡ phải tự đọc cả trang. Chỉ link http(s) công khai.",
    inputSchema: { type: "object", properties: { url: { type: "string", description: "Link http(s) công khai" }, cau_hoi: { type: "string", description: "Cần biết gì từ trang này" } }, required: ["url"] } },
];

const send = (m) => process.stdout.write(JSON.stringify(m) + "\n");
async function handle(m) {
  if (m.method === "initialize") return send({ jsonrpc: "2.0", id: m.id, result: { protocolVersion: (m.params && m.params.protocolVersion) || "2025-06-18", capabilities: { tools: {} }, serverInfo: { name: "tra-cuu", version: "1.0.0" } } });
  if (m.method === "ping") return send({ jsonrpc: "2.0", id: m.id, result: {} });
  if (m.method === "tools/list") return send({ jsonrpc: "2.0", id: m.id, result: { tools: TOOLS } });
  if (m.method === "tools/call") {
    const { name, arguments: a = {} } = m.params || {};
    try {
      const r = name === "tim_kiem" ? await tc.timKiem(a.cau_hoi) : name === "doc_tai_lieu" ? await tc.docTaiLieu(a.url, a.cau_hoi || undefined) : null;
      if (!r) throw new Error("Không có công cụ " + name);
      const nguon = r.nguon.length ? "\n\nNguồn:\n" + r.nguon.map((n) => "- " + (n.title ? n.title + ": " : "") + n.uri).join("\n") : "";
      return send({ jsonrpc: "2.0", id: m.id, result: { content: [{ type: "text", text: r.text + nguon + "\n\n(" + r.model + ", miễn phí; là gợi ý, cần đối chiếu nguồn)" }] } });
    } catch (e) {
      return send({ jsonrpc: "2.0", id: m.id, result: { isError: true, content: [{ type: "text", text: "Tra cứu không được: " + e.message } ] } });
    }
  }
  if (m.id !== undefined && m.id !== null) send({ jsonrpc: "2.0", id: m.id, error: { code: -32601, message: "Không hỗ trợ " + m.method } });
}

let buf = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (d) => {
  buf += d;
  if (buf.length > 1024 * 1024) buf = "";
  let i;
  while ((i = buf.indexOf("\n")) >= 0) {
    const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
    if (!line) continue;
    let m; try { m = JSON.parse(line); } catch { continue; }
    handle(m).catch(() => {});
  }
});
process.stdin.on("end", () => process.exit(0));
