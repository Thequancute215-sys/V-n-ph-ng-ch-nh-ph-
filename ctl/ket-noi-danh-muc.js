// Danh mục kết nối (MCP) của văn phòng: dùng chung cho trang Kết nối (ket-noi.js), chia theo phòng (mcp-phong.js) và chặn gửi (runner.js).
"use strict";
// nhom: tai-lieu | thiet-ke | du-lieu | gui | trien-khai | sang-tao. url: có thì thêm được cho Codex/Antigravity (OAuth).
// claude: tên kết nối trong `claude mcp list` (tài khoản claude.ai). chan: bị chặn khi chạy toàn quyền.
const CATALOG = [
  { id: "notion", name: "Notion", nhom: "tai-lieu", claude: "claude.ai Notion", url: "https://mcp.notion.com/mcp" },
  { id: "figma", name: "Figma", nhom: "thiet-ke", claude: "claude.ai Figma", url: "https://mcp.figma.com/mcp" },
  { id: "canva", name: "Canva", nhom: "thiet-ke", claude: "claude.ai Canva", url: "https://mcp.canva.com/mcp" },
  { id: "webflow", name: "Webflow", nhom: "thiet-ke", claude: "claude.ai Webflow", url: "https://mcp.webflow.com/mcp" },
  { id: "gitbook", name: "GitBook", nhom: "tai-lieu", claude: "claude.ai GitBook MCP", url: "https://mcp.gitbook.com/mcp" },
  { id: "supabase", name: "Supabase", nhom: "du-lieu", claude: "claude.ai Supabase", url: "https://mcp.supabase.com/mcp" },
  { id: "cloudflare", name: "Cloudflare", nhom: "du-lieu", claude: "claude.ai Cloudflare Developer Platform", url: "https://bindings.mcp.cloudflare.com/mcp" },
  { id: "google-drive", name: "Google Drive", nhom: "tai-lieu", claude: "claude.ai Google Drive" },
  { id: "google-docs", name: "Google Docs", nhom: "tai-lieu", claude: "claude.ai Google Docs" },
  { id: "google-sheets", name: "Google Sheets", nhom: "du-lieu", claude: "claude.ai Google Sheets" },
  { id: "google-slides", name: "Google Slides", nhom: "tai-lieu", claude: "claude.ai Google Slides" },
  { id: "blaze-sql", name: "Blaze SQL", nhom: "du-lieu", claude: "claude.ai Blaze SQL" },
  { id: "claude-docs", name: "Claude Docs", nhom: "tai-lieu", claude: "claude.ai Claude Docs" },
  { id: "gmail", name: "Gmail", nhom: "gui", claude: "claude.ai Gmail", chan: ["mcp__claude_ai_Gmail"] },
  { id: "google-calendar", name: "Google Calendar", nhom: "gui", claude: "claude.ai Google Calendar", chan: ["mcp__claude_ai_Google_Calendar"] },
  { id: "zoom", name: "Zoom", nhom: "gui", claude: "claude.ai Zoom for Claude", chan: ["mcp__claude_ai_Zoom_for_Claude"] },
  { id: "composio", name: "Composio", nhom: "gui", claude: "claude.ai Composio", chan: ["mcp__claude_ai_Composio"] },
  { id: "vercel", name: "Vercel", nhom: "trien-khai", claude: "claude.ai Vercel", chan: ["mcp__claude_ai_Vercel"] },
  { id: "appdeploy", name: "AppDeploy", nhom: "trien-khai", claude: "claude.ai AppDeploy", chan: ["mcp__claude_ai_AppDeploy"] },
  // App sáng tạo (CEO 07/11/2026: văn phòng làm app và công cụ là chính, chỉ giữ CapCut): cài app trước, nối MCP sau.
  { id: "capcut", name: "CapCut", nhom: "sang-tao", app: ["D:/Apps/CapCut", "%LOCALAPPDATA%/CapCut"] },
];
// Notion có công cụ tạo/sửa/huỷ sự kiện lịch (gửi lời mời cho người khác): cũng chặn.
const CHAN_THEM = ["mcp__claude_ai_Notion__notion-calendar-create-events", "mcp__claude_ai_Notion__notion-calendar-update-events", "mcp__claude_ai_Notion__notion-calendar-cancel-events"];
const CHAN_CLAUDE = [...CATALOG.flatMap((c) => c.chan || []), ...CHAN_THEM];

module.exports = { CATALOG, CHAN_CLAUDE };
