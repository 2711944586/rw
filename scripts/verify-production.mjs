import { chromium } from "playwright";

const url = process.argv[2] || process.env.PRODUCTION_URL || process.env.DEPLOYMENT_URL;

if (!url) {
  console.error("Usage: node scripts/verify-production.mjs https://your-deployment.vercel.app");
  process.exit(1);
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const messages = [];

page.on("console", (message) => {
  if (["error", "warning"].includes(message.type())) {
    messages.push({ type: message.type(), text: message.text() });
  }
});

page.on("pageerror", (error) => {
  messages.push({ type: "pageerror", text: error.message });
});

try {
  const response = await page.goto(url, { waitUntil: "networkidle", timeout: 60000 });
  const status = response?.status() || 0;
  if (status < 200 || status >= 400) {
    throw new Error(`Unexpected HTTP status ${status}`);
  }

  const result = await page.evaluate(() => {
    const title = document.title;
    const activeView = document.querySelector(".view.active")?.id || "";
    const heading = document.querySelector("main h2")?.textContent?.trim() || "";
    const authButton = Boolean(document.querySelector("#authOpenBtn"));
    const syncButton = Boolean(document.querySelector("#syncNowBtn"));
    const overflow = document.documentElement.scrollWidth > window.innerWidth;
    const topbarHeight = Math.round(document.querySelector(".topbar")?.getBoundingClientRect().height || 0);
    const clippedCount = [...document.querySelectorAll("main *")].filter((element) => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return rect.width &&
        rect.height &&
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        element.scrollWidth > element.clientWidth + 2 &&
        !["INPUT", "TEXTAREA", "SELECT"].includes(element.tagName);
    }).length;
    return { title, activeView, heading, authButton, syncButton, overflow, topbarHeight, clippedCount };
  });

  if (!result.title.includes("软微 420")) {
    throw new Error(`Unexpected page title: ${result.title}`);
  }
  if (result.activeView !== "dashboard") {
    throw new Error(`Dashboard is not active: ${result.activeView}`);
  }
  if (!result.authButton || !result.syncButton) {
    throw new Error("Top action buttons are missing.");
  }
  if (result.overflow) {
    throw new Error("Mobile viewport has horizontal overflow.");
  }
  if (result.clippedCount > 0) {
    throw new Error(`Mobile viewport has ${result.clippedCount} clipped text elements.`);
  }
  if (messages.length > 0) {
    throw new Error(`Console warnings/errors found: ${JSON.stringify(messages)}`);
  }

  console.log(JSON.stringify({ ok: true, url, status, result }, null, 2));
} finally {
  await browser.close();
}
