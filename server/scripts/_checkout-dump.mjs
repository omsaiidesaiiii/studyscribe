// Temp diagnostic: dump every input in the Razorpay checkout frame.
import "dotenv/config";
import puppeteer from "puppeteer";

const WEB = "http://localhost:5273";
const API = "http://localhost:5055";
const EMAIL = "ui.check.20261005@example.com";
const PASSWORD = "notebook-2026";

const loginResponse = await fetch(`${API}/auth/login`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
});
const loginBody = await loginResponse.json();

const browser = await puppeteer.launch({ headless: "new" });
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  await page.evaluateOnNewDocument(
    (tokens) => {
      window.localStorage.setItem("studyscribe.accessToken", tokens.access);
      window.localStorage.setItem("studyscribe.refreshToken", tokens.refresh);
    },
    { access: loginBody.accessToken, refresh: loginBody.refreshToken ?? loginBody.accessToken },
  );

  await page.goto(`${WEB}/app/payments`, { waitUntil: "load", timeout: 30000 });
  await page.waitForSelector(".plan.featured button", { timeout: 20000 });
  await page.click(".plan.featured button");

  // Wait for a razorpay frame with any input/button.
  let frame = null;
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline && !frame) {
    for (const candidate of page.frames()) {
      if (!/razorpay/i.test(candidate.url())) continue;
      if (await candidate.$("input, button").catch(() => null)) {
        frame = candidate;
        break;
      }
    }
    if (!frame) await new Promise((r) => setTimeout(r, 400));
  }

  if (!frame) {
    console.log("no checkout frame; frames:", page.frames().map((f) => f.url()).slice(0, 10));
    process.exit(1);
  }

  console.log("frame url:", frame.url().slice(0, 120));
  await new Promise((r) => setTimeout(r, 2500));

  const dump = async (label) => {
    const data = await frame.evaluate(() => {
      const describe = (el) => {
        const rect = el.getBoundingClientRect();
        return {
          tag: el.tagName.toLowerCase(),
          id: el.id || undefined,
          name: el.name || undefined,
          type: el.type || undefined,
          placeholder: el.placeholder || undefined,
          autocomplete: el.getAttribute("autocomplete") || undefined,
          aria: el.getAttribute("aria-label") || undefined,
          cls: String(el.className).slice(0, 60) || undefined,
          rect: { w: Math.round(rect.width), h: Math.round(rect.height), x: Math.round(rect.x), y: Math.round(rect.y) },
        };
      };

      return {
        text: document.body.innerText.replace(/\s+/g, " ").slice(0, 600),
        inputs: [...document.querySelectorAll("input, select, textarea")]
          .filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && el.type !== "radio"; })
          .map(describe),
        buttons: [...document.querySelectorAll("button, [role=button]")]
          .filter((el) => el.getBoundingClientRect().width > 0 && el.textContent.trim())
          .map((el) => el.textContent.trim().slice(0, 40))
          .slice(0, 20),
        iframes: [...document.querySelectorAll("iframe")].map((el) => el.src?.slice(0, 100)),
      };
    });

    console.log(`--- ${label} ---`);
    console.log(JSON.stringify(data, null, 2));
  };

  await dump("initial");

  const clickedTab = await frame.evaluate(() => {
    const candidates = [...document.querySelectorAll("button, [role=button], label, div, span, li")].filter((el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    });
    const tab = candidates
      .filter((el) => /^(cards?|debit card|credit card)$/i.test(el.textContent.trim()))
      .sort((a, b) => a.textContent.length - b.textContent.length)
      .pop();
    if (tab) {
      tab.click();
      return tab.textContent.trim();
    }
    return null;
  });
  console.log("clicked tab:", clickedTab);

  await new Promise((r) => setTimeout(r, 3000));
  await dump("after Cards click");
} finally {
  await browser.close();
}
