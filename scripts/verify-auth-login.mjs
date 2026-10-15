import { readFileSync } from "node:fs";
import { chromium } from "playwright";

function loadEnvFile(filePath) {
  try {
    const text = readFileSync(filePath, "utf8");
    for (const line of text.split(/\r?\n/)) {
      const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (!match) continue;
      const key = match[1];
      let value = match[2].trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (process.env[key] == null || process.env[key] === "") process.env[key] = value;
    }
  } catch {
    // optional file
  }
}

loadEnvFile(".env");
loadEnvFile(".env.deploy");

const supabaseUrl = (process.env.VITE_SUPABASE_URL || "").replace(/\/$/, "");
const supabaseKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || "";
const projectRef = process.env.SUPABASE_PROJECT_REF || "";
const accessToken = process.env.SUPABASE_ACCESS_TOKEN || "";
const appUrl = process.argv[2] || "http://127.0.0.1:5173/";
const stamp = Date.now();
const email = `rw.login.${stamp}@example.com`;
const password = `RwLogin!${stamp}aA`;

if (!supabaseUrl || !supabaseKey) {
  console.error("missing supabase url or publishable key");
  process.exit(1);
}

async function readJson(response) {
  const text = await response.text();
  try {
    return { status: response.status, ok: response.ok, json: text ? JSON.parse(text) : {} };
  } catch {
    return { status: response.status, ok: response.ok, json: { raw: text.slice(0, 240) } };
  }
}

async function getServiceRoleKey() {
  if (!accessToken || !projectRef) return "";
  const response = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/api-keys`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    }
  });
  const payload = await response.json().catch(() => []);
  const keys = Array.isArray(payload) ? payload : [];
  const service = keys.find((item) => String(item.name || item.id || "").toLowerCase().includes("service"));
  return service?.api_key || service?.key || "";
}

const serviceKey = await getServiceRoleKey();
let created;
if (serviceKey) {
  created = await readJson(await fetch(`${supabaseUrl}/auth/v1/admin/users`, {
    method: "POST",
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      email,
      password,
      email_confirm: true
    })
  }));
} else {
  created = await readJson(await fetch(`${supabaseUrl}/auth/v1/signup`, {
    method: "POST",
    headers: {
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ email, password })
  }));
}

const signin = await readJson(await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
  method: "POST",
  headers: {
    apikey: supabaseKey,
    Authorization: `Bearer ${supabaseKey}`,
    "Content-Type": "application/json"
  },
  body: JSON.stringify({ email, password })
}));

console.log(JSON.stringify({
  createdStatus: created.status,
  createdOk: created.ok,
  createdId: Boolean(created.json?.id || created.json?.user?.id),
  apiLoginStatus: signin.status,
  apiLoginOk: signin.ok,
  apiHasToken: Boolean(signin.json?.access_token),
  apiError: signin.json?.error_description || signin.json?.msg || signin.json?.error || null,
  usedAdmin: Boolean(serviceKey)
}));

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await page.goto(appUrl, { waitUntil: "networkidle", timeout: 60000 });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: "networkidle" });
await page.locator("#authOpenBtn").click();
await page.waitForSelector("#authDialog[open]");
await page.locator("#authEmail").fill(email);
await page.locator("#authPassword").fill(password);
await page.locator("#signInBtn").click();
await page.waitForFunction(() => {
  const account = document.getElementById("authAccountText")?.textContent || "";
  const result = document.getElementById("authResult")?.innerText || "";
  const signedIn = document.getElementById("authSignedInActions")?.hidden === false;
  return signedIn || /失败|不正确|无效|未配置/.test(result) || account.includes("@");
}, { timeout: 20000 }).catch(() => {});
const ui = await page.evaluate(() => ({
  result: (document.getElementById("authResult")?.innerText || "").replace(/\s+/g, " ").trim(),
  account: document.getElementById("authAccountText")?.textContent || "",
  signedInVisible: document.getElementById("authSignedInActions")?.hidden === false,
  signedOutVisible: document.getElementById("authSignedOutActions")?.hidden === false
}));
console.log(JSON.stringify({ ui }));
await page.screenshot({ path: "output/predeploy-review/login-result.png", type: "png" });
await browser.close();

if (!signin.ok || !ui.signedInVisible) process.exit(1);
