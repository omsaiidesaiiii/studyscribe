/**
 * UI verification shots — dev-only helper.
 *
 * Walks every route of the web app at 360px and 1280px, saves full-page PNGs to
 * web/ui-screenshots/ and writes an overflow report to web/ui-screenshots/report.json.
 *
 * Usage (from server/):  node scripts/ui-shots.mjs
 * Requires: web dev server on 5273, API on 5055.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import puppeteer from "puppeteer";

const WEB = process.env.WEB_URL ?? "http://localhost:5273";
const API = process.env.API_URL ?? "http://localhost:5055";
const OUT = path.resolve(process.cwd(), "..", "web", "ui-screenshots");
const GENERATION_ID = process.env.GENERATION_ID ?? "d7000452-c208-4f94-bd83-962fb0e6fc4e";
const EMAIL = process.env.CHECK_EMAIL ?? "ui.check.20261005@example.com";
const PASSWORD = process.env.CHECK_PASSWORD ?? "notebook-2026";
const WIDTHS = [360, 768, 1280, 1440];

const ACCESS_KEY = "studyscribe.accessToken";
const REFRESH_KEY = "studyscribe.refreshToken";

// Routes where the mobile hamburger is exercised (opened, shot, closed).
const MENU_SLUGS = new Set(["landing", "dashboard"]);

const ROUTES = [
  { slug: "landing", path: "/", public: true },
  { slug: "login", path: "/login", public: true },
  { slug: "register", path: "/register", public: true },
  { slug: "dashboard", path: "/app/dashboard", settle: 900 },
  { slug: "history", path: "/app/history", settle: 900 },
  { slug: "payments", path: "/app/payments", settle: 900 },
  { slug: "generation", path: `/app/generation/${GENERATION_ID}`, settle: 2500 },
  { slug: "generation-missing", path: "/app/generation/not-a-uuid", settle: 1200 },
  { slug: "not-found", path: "/some/bogus/route", settle: 700 },
];

async function login() {
  const response = await fetch(`${API}/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  if (!response.ok) throw new Error(`login failed: ${response.status}`);
  const body = await response.json();
  return { accessToken: body.accessToken, refreshToken: body.refreshToken };
}

function readMetrics() {
  const vw = window.innerWidth;
  const doc = document.documentElement;
  const crossing = [];
  for (const el of document.querySelectorAll("body *")) {
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) continue;
    if (rect.right > vw + 1 || rect.left < -1) {
      crossing.push({
        tag: el.tagName.toLowerCase(),
        cls: String(el.className).slice(0, 60),
        left: Math.round(rect.left),
        right: Math.round(rect.right),
      });
    }
  }
  const clipped = [];
  for (const el of document.querySelectorAll("body *")) {
    if (el.scrollWidth > el.clientWidth + 2 && getComputedStyle(el).overflowX !== "visible") {
      clipped.push({
        tag: el.tagName.toLowerCase(),
        cls: String(el.className).slice(0, 60),
        scrollWidth: el.scrollWidth,
        clientWidth: el.clientWidth,
      });
    }
  }
  const accents = new Set();
  for (const el of document.querySelectorAll("body *")) {
    const bg = getComputedStyle(el).backgroundColor;
    const match = /^rgba?\((\d+), (\d+), (\d+)/.exec(bg);
    if (!match) continue;
    const [r, g, b] = [Number(match[1]), Number(match[2]), Number(match[3])];
    if (r > 245 && g > 245 && b > 245) continue; // paper / white
    if (Math.abs(r - g) < 12 && Math.abs(g - b) < 12 && Math.abs(r - b) < 12) continue; // grey
    accents.add(`${r},${g},${b}`);
  }
  const body = getComputedStyle(document.body);
  return {
    viewport: vw,
    horizontalScroll: doc.scrollWidth > vw + 1,
    scrollWidth: doc.scrollWidth,
    crossing: crossing.slice(0, 12),
    crossingCount: crossing.length,
    clipped: clipped.slice(0, 12),
    clippedCount: clipped.length,
    accentColors: accents.size,
    bodyBackground: body.backgroundColor,
    bodyFont: body.fontFamily,
    pageHeight: doc.scrollHeight,
    h1Font: (() => {
      const h1 = document.querySelector("h1");
      return h1 ? getComputedStyle(h1).fontFamily : null;
    })(),
    hasHScrollbar: window.innerWidth - doc.clientWidth > 0,
  };
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const { accessToken, refreshToken } = await login();
  const browser = await puppeteer.launch({ headless: "new" });
  const report = { generatedAt: new Date().toISOString(), web: WEB, routes: [] };

  for (const route of ROUTES) {
    for (const width of WIDTHS) {
      const page = await browser.newPage();
      await page.setViewport({ width, height: 900, deviceScaleFactor: 1 });
      await page.evaluateOnNewDocument(
        (keys, tokens) => {
          if (tokens) {
            window.localStorage.setItem(keys.access, tokens.accessToken);
            window.localStorage.setItem(keys.refresh, tokens.refreshToken);
          } else {
            window.localStorage.removeItem(keys.access);
            window.localStorage.removeItem(keys.refresh);
          }
        },
        { access: ACCESS_KEY, refresh: REFRESH_KEY },
        route.public ? null : { accessToken, refreshToken },
      );

      const errors = [];
      page.on("console", (message) => {
        if (message.type() === "error") errors.push(message.text().slice(0, 200));
      });
      page.on("pageerror", (error) => errors.push(`pageerror: ${String(error).slice(0, 200)}`));

      const response = await page.goto(`${WEB}${route.path}`, {
        waitUntil: "load",
        timeout: 20000,
      });
      await page.evaluate(() => document.fonts.ready);
      await new Promise((resolve) => setTimeout(resolve, route.settle ?? 700));
      const metrics = await page.evaluate(readMetrics);
      const file = `${route.slug}-${width}.png`;
      const parts = [];
      // Chrome's full-page capture can duplicate sticky headers, so unstick them
      // for the shot only (the live page keeps its sticky header).
      await page.evaluate(() => {
        for (const el of document.querySelectorAll(".topbar, .toolbar")) {
          el.dataset.position = getComputedStyle(el).position;
          el.style.position = "static";
        }
      });
      await page.screenshot({ path: path.join(OUT, file), fullPage: true });
      await page.evaluate(() => {
        for (const el of document.querySelectorAll(".topbar, .toolbar")) {
          el.style.position = el.dataset.position ?? "";
        }
      });

      // Hamburger: open it, prove the panel is really laid out, shoot it, then
      // prove Escape closes it again.
      let menu = null;
      if (MENU_SLUGS.has(route.slug)) {
        try {
          const toggle = await page.$(".nav-toggle");
          const toggleVisible =
            toggle &&
            (await page.$eval(".nav-toggle", (el) => {
              const style = getComputedStyle(el);
              return style.display !== "none" && el.offsetParent !== null;
            }));

          if (!toggle) {
            menu = { present: false };
          } else if (!toggleVisible) {
            // Wide screen: the inline pills are shown, the hamburger is not.
            const pills = await page.$$eval(".nav a", (els) => els.length);
            menu = { present: true, hiddenOnDesktop: true, inlineLinks: pills };
          } else {
            await toggle.click();
            await page.waitForFunction(
              () => {
                const panel = document.querySelector(".nav-menu-panel");
                return panel && !panel.hidden && getComputedStyle(panel).display !== "none";
              },
              { timeout: 4000 },
            );
            menu = {
              present: true,
              expanded: await page.$eval(".nav-toggle", (el) =>
                el.getAttribute("aria-expanded"),
              ),
              items: await page.$$eval(".nav-menu-panel a, .nav-menu-panel button", (els) =>
                els.map((el) => el.textContent.trim()),
              ),
            };
      await page.screenshot({
        path: path.join(OUT, `${route.slug}-${width}-menu-open.png`),
        fullPage: false,
      });

            await page.keyboard.press("Escape");
            await page.waitForFunction(
              () => document.querySelector(".nav-menu-panel")?.hidden === true,
              { timeout: 4000 },
            );
            menu.closedOnEscape = true;
          }
        } catch (error) {
          menu = { ...(menu ?? {}), present: true, error: String(error).slice(0, 160) };
        }
      }
      // Chrome's full-page capture streaks a dark strip across the top of very
      // tall surfaces (>~4000px), so those pages are also captured as
      // viewport-height slices — clean, and readable at real scale.
      if (metrics.pageHeight > 4000) {
        const step = 900;
        const count = Math.min(Math.ceil(metrics.pageHeight / step), 12);

        for (let index = 0; index < count; index += 1) {
          const top = index * step;
          await page.evaluate((y) => window.scrollTo(0, y), top);
          await new Promise((resolve) => setTimeout(resolve, 250));
          const partFile = `${route.slug}-${width}-part${index + 1}.png`;
          await page.screenshot({ path: path.join(OUT, partFile), fullPage: false });
          parts.push(partFile);
        }

        await page.evaluate(() => window.scrollTo(0, 0));
      }

      report.routes.push({
        route: route.path,
        slug: route.slug,
        width,
        status: response ? response.status() : null,
        finalUrl: page.url(),
        file,
        parts,
        errors,
        menu,
        ...metrics,
      });
      console.log(
        `${route.slug} @${width}  status=${response ? response.status() : "?"}  hScroll=${metrics.horizontalScroll}  crossing=${metrics.crossingCount}  accents=${metrics.accentColors}  errors=${errors.length}` +
          (menu
            ? `  menu=${
                menu.hiddenOnDesktop
                  ? `inline(${menu.inlineLinks})`
                  : menu.present
                    ? `open(${menu.items?.length ?? 0})${menu.closedOnEscape ? "+esc" : ""}`
                    : "missing"
              }${menu.error ? ` ERROR:${menu.error}` : ""}`
            : ""),
      );
      await page.close();
    }
  }

  await browser.close();
  await writeFile(path.join(OUT, "report.json"), JSON.stringify(report, null, 2));
  console.log(`\nwrote ${report.routes.length} shots + report.json to ${OUT}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
