/**
 * Payments UI end-to-end (Razorpay checkout in a real browser).
 *
 * Complements `payments-e2e.ts`: that one proves the API against the real
 * gateway but cannot complete a payment; this one goes the last mile through
 * the actual UI — click Buy, let Razorpay's checkout open over the page, pay
 * with the standard test card, and confirm the credits really land.
 *
 * Prerequisites: web dev server on 5273, API on 5055 with RAZORPAY_KEY +
 * RAZORPAY_KEY_SECRET (test keys). The payment is test-mode only.
 *
 * Usage (from server/):  npx tsx scripts/payments-ui-e2e.ts
 */
import "dotenv/config";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import puppeteer, { type Frame, type Page } from "puppeteer";
import { pool } from "../src/lib/db.js";

const WEB = process.env.WEB_URL ?? "http://localhost:5273";
const API = (process.env.API_URL ?? "http://localhost:5055").replace(/\/$/, "");
const OUT = path.resolve(process.cwd(), "..", "web", "ui-screenshots");
const EMAIL = process.env.CHECK_EMAIL ?? "ui.check.20261005@example.com";
const PASSWORD = process.env.CHECK_PASSWORD ?? "notebook-2026";
const ACCESS_KEY = "studyscribe.accessToken";
const REFRESH_KEY = "studyscribe.refreshToken";
const PLAN_CREDITS = 50; // the featured "Popular" pack

declare global {
  interface Window {
    __e2eCardTabs?: Element[];
    __e2ePayButtons?: HTMLElement[];
  }
}

type Check = { name: string; ok: boolean; detail: string };
const checks: Check[] = [];

function record(name: string, ok: boolean, detail: string): void {
  checks.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name} — ${detail}`);
}

async function login(): Promise<{ token: string; refresh: string; userId: string; credits: number }> {
  const response = await fetch(`${API}/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });

  if (!response.ok) throw new Error(`login failed: ${response.status}`);

  const body = (await response.json()) as {
    accessToken: string;
    refreshToken?: string;
    user: { id: string; credits: number };
  };

  return {
    token: body.accessToken,
    refresh: body.refreshToken ?? body.accessToken,
    userId: body.user.id,
    credits: body.user.credits,
  };
}

async function creditsOf(token: string): Promise<number> {
  const response = await fetch(`${API}/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = (await response.json()) as { user?: { credits?: number } };
  return body.user?.credits ?? -1;
}

/** Everything visible in a frame, for diagnostics when a step misbehaves. */
async function describeFrame(frame: Frame): Promise<unknown> {
  return frame
    .evaluate(() => ({
      text: document.body.innerText.replace(/\s+/g, " ").slice(0, 300),
      inputs: [...document.querySelectorAll("input")]
        .filter((el) => {
          const rect = el.getBoundingClientRect();
          const style = getComputedStyle(el);
          return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden";
        })
        .map((el) => ({
          name: el.name || undefined,
          placeholder: el.placeholder || undefined,
          value: el.type === "password" ? "***" : el.value.slice(0, 16) || undefined,
        })),
      buttons: [...document.querySelectorAll("button, [role=button]")]
        .filter((el) => el.getBoundingClientRect().width > 0)
        .map((el) => ({
          text: el.textContent.trim().slice(0, 30),
          disabled: (el as HTMLButtonElement).disabled || undefined,
        }))
        .slice(0, 15),
    }))
    .catch((error) => ({ error: String(error).slice(0, 120) }));
}

async function findCheckoutFrame(page: Page, timeoutMs = 30000): Promise<Frame | null> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    for (const frame of page.frames()) {
      if (!/razorpay/i.test(frame.url())) continue;

      const ready = await frame.$("input, button").catch(() => null);

      if (ready) return frame;
    }
    await new Promise((resolve) => setTimeout(resolve, 400));
  }

  return null;
}

/**
 * True when a real card-number field is on screen. Hidden stack views keep
 * their inputs mounted at zero size, and some builds render a decoy copy of
 * the form — so only a materially sized field counts as "open".
 */
function hasCardNumberField(frame: Frame): Promise<boolean> {
  return frame
    .evaluate(() =>
      [...document.querySelectorAll("input")].some((el) => {
        const rect = el.getBoundingClientRect();

        if (rect.width < 80 || rect.height < 12) return false;
        if (el.type === "radio" || el.type === "checkbox") return false;

        const hay = `${el.id} ${el.name} ${el.placeholder} ${el.getAttribute("aria-label") ?? ""}`.toLowerCase();

        // The contact section also has a number-ish field ("Mobile number").
        return /card/.test(hay) && /num/.test(hay) && !/mobile|contact|phone/.test(hay);
      }),
    )
    .catch(() => false);
}/**
 * Open the "Cards" payment method tab. The checkout ignores synthetic clicks
 * AND resists plain trusted clicks on the tab text, so three strategies are
 * tried in order: dispatch a change on the row's radio input, a real mouse
 * click at the text's page coordinates, then the marked-element click.
 */
async function openCardMethod(page: Page, frame: Frame): Promise<boolean> {
  // The pane re-renders right after the contact step, so the first probe can
  // run against a mid-swap document — retry until the methods row settles.
  let probe: {
    radios: number;
    cardsCenter: { x: number; y: number } | null;
    topAtPoint: string | null;
    rowHtml: string | null;
  } | null = null;

  for (let attempt = 0; attempt < 3 && !probe; attempt++) {
    if (attempt) await new Promise((resolve) => setTimeout(resolve, 800));

    // NOTE: no `const helper = (…) => …` bindings inside evaluate bodies —
    // esbuild wraps them in its module-scope `__name` helper, which does not
    // exist in the browser and makes the whole evaluate throw.
    probe = await frame
      .evaluate(() => {
        const cardsText = [...document.querySelectorAll("button, [role=button], li, div, span, label")]
          .filter(
            (el) =>
              el.getBoundingClientRect().width > 0 &&
              /^(cards?|debit cards?|credit cards?)$/i.test(el.textContent.trim()),
          )
          .pop();
        const rect = cardsText?.getBoundingClientRect();
        const top = rect
          ? document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)
          : null;

        return {
          radios: [...document.querySelectorAll('input[type="radio"]')].filter(
            (el) => el.getBoundingClientRect().width > 0,
          ).length,
          cardsCenter: rect ? { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 } : null,
          topAtPoint: top ? `${top.tagName}.${String(top.className).slice(0, 40)}` : null,
          rowHtml: cardsText?.closest("div")?.outerHTML.slice(0, 260) ?? null,
        };
      })
      .catch((error) => {
        console.log(`  probe attempt ${attempt + 1} threw: ${String(error).slice(0, 200)}`);

        return null;
      });
  }

  if (!probe || (!probe.cardsCenter && !probe.radios)) {
    console.log(`  methods probe failed: ${JSON.stringify(probe)}`);

    return false;
  }

  console.log(`  methods probe: ${JSON.stringify(probe).slice(0, 300)}`);

  // A full-screen .stack-overlay (z-50) covering the methods row means the
  // contact sheet is still the active stack view. Dismiss it the natural way
  // — a real click on the overlay (tap-outside-to-dismiss). Only if it will
  // not go away do we rip it out of the DOM, which can leave the pane in a
  // broken half-transitioned state where typing never registers.
  if (probe.topAtPoint?.includes("stack-overlay") && probe.cardsCenter) {
    const iframes = await page.$$("iframe");

    for (const handle of iframes) {
      const inner = await handle.contentFrame().catch(() => null);

      if (inner !== frame) continue;

      const frameBox = await handle.boundingBox().catch(() => null);

      if (!frameBox) break;

      await page.mouse.click(frameBox.x + probe.cardsCenter.x, frameBox.y + probe.cardsCenter.y);

      break;
    }

    await new Promise((resolve) => setTimeout(resolve, 900));

    const stillCovered = await frame
      .evaluate(() => {
        const top = document.elementFromPoint(window.innerWidth / 2, window.innerHeight / 2);

        return Boolean(top?.closest(".stack-overlay"));
      })
      .catch(() => true);

    if (stillCovered) {
      console.log("  overlay survived the dismiss click — finalizing the stuck transition");
      await frame
        .evaluate(() => {
          // Removing the overlay mid-transition leaves the stack controller
          // waiting for transitionend forever — the next view renders but is
          // inert (exactly the "typing goes nowhere" state). Instead, finish
          // the transition: freeze animations, force the pseudo-element that
          // blocks hit-testing to disappear, and dispatch the completion
          // events the controller listens for.
          const style = document.createElement("style");

          style.textContent =
            ".stack-overlay { animation: none !important; transition: none !important; opacity: 0 !important; pointer-events: none !important; }";
          document.head.appendChild(style);

          for (const el of document.querySelectorAll(".stack-overlay")) {
            el.dispatchEvent(new Event("transitionend", { bubbles: true }));
            el.dispatchEvent(new Event("animationend", { bubbles: true }));
            el.dispatchEvent(new Event("webkitTransitionEnd", { bubbles: true }));
            el.dispatchEvent(new Event("webkitAnimationEnd", { bubbles: true }));
          }
        })
        .catch(() => undefined);
    } else {
      console.log("  overlay dismissed by click");
    }

    await new Promise((resolve) => setTimeout(resolve, 600));
  }

  // Strategy 1 — the rows expose data-testid ("Cards"); mark the closest
  // clickable ancestor and give it a real mouse click.
  const markedTab = await frame
    .evaluate(() => {
      document.querySelectorAll("[data-e2e-target]").forEach((el) => el.removeAttribute("data-e2e-target"));

      const tab =
        document.querySelector('[data-testid="Cards"]') ??
        [...document.querySelectorAll("button, [role=button], li, div, span, label")]
          .filter(
            (el) =>
              el.getBoundingClientRect().width > 0 &&
              /^(cards?|debit cards?|credit cards?)$/i.test(el.textContent.trim()),
          )
          .pop();

      if (!tab) return false;

      let scope: Element | null = tab;

      for (let depth = 0; depth < 4 && scope; depth += 1) {
        scope = scope.parentElement;

        if (scope && /^(button|label|li|a)$/i.test(scope.tagName)) {
          (scope as HTMLElement).dataset.e2eTarget = "1";

          return true;
        }
      }

      (tab as HTMLElement).dataset.e2eTarget = "1";

      return true;
    })
    .catch(() => false);

  if (markedTab) {
    console.log('  strategy tab: real-clicking the Cards tab');
    await clickMarked(frame);

    for (let wait = 0; wait < 6; wait++) {
      if (await hasCardNumberField(frame)) return true;
      await new Promise((resolve) => setTimeout(resolve, 600));
    }
  }

  // Strategy 1 — the method rows are radio inputs; check the one that sits in
  // the same row as the "Cards" text (fallback: the second radio, matching
  // the UPI, Cards, EMI, ... tab order).
  const radioSet = await frame
    .evaluate(() => {
      const cardsText = [...document.querySelectorAll("button, [role=button], li, div, span, label")]
        .filter(
          (el) =>
            el.getBoundingClientRect().width > 0 &&
            /^(cards?|debit cards?|credit cards?)$/i.test(el.textContent.trim()),
        )
        .pop();
      const radios = [...document.querySelectorAll('input[type="radio"]')].filter(
        (el) => el.getBoundingClientRect().width > 0,
      );

      let target: HTMLInputElement | undefined;

      if (cardsText) {
        let scope: Element | null = cardsText;

        for (let depth = 0; depth < 5 && scope && !target; depth += 1) {
          scope = scope.parentElement;
          target = scope?.querySelector('input[type="radio"]') ?? undefined;
        }
      }

      target = target ?? radios[1] ?? radios[0];

      if (!target) return false;

      target.checked = true;
      target.dispatchEvent(new Event("input", { bubbles: true }));
      target.dispatchEvent(new Event("change", { bubbles: true }));

      return true;
    })
    .catch(() => false);

  if (radioSet) {
    console.log('  strategy radio: dispatched change on the Cards radio');

    for (let wait = 0; wait < 6; wait++) {
      if (await hasCardNumberField(frame)) return true;
      await new Promise((resolve) => setTimeout(resolve, 600));
    }
  }

  // Strategy 2 — a genuine mouse click at the text's on-page coordinates.
  if (probe.cardsCenter) {
    const iframes = await page.$$("iframe");

    for (const handle of iframes) {
      const inner = await handle.contentFrame().catch(() => null);

      if (inner !== frame) continue;

      const frameBox = await handle.boundingBox().catch(() => null);

      if (!frameBox) break;

      await page.mouse.move(frameBox.x + probe.cardsCenter.x, frameBox.y + probe.cardsCenter.y, { steps: 8 });
      await page.mouse.click(frameBox.x + probe.cardsCenter.x, frameBox.y + probe.cardsCenter.y);

      for (let wait = 0; wait < 6; wait++) {
        if (await hasCardNumberField(frame)) return true;
        await new Promise((resolve) => setTimeout(resolve, 600));
      }

      break;
    }
  }

  // Strategy 3 — mark each exact "Cards" candidate and really click it.
  const count = await frame
    .evaluate(() => {
      window.__e2eCardTabs = [
        ...document.querySelectorAll("button, [role=button], li, div, span, label"),
      ].filter(
        (el) =>
          el.getBoundingClientRect().width > 0 &&
          /^(cards?|debit cards?|credit cards?)$/i.test(el.textContent.trim()),
      );

      return window.__e2eCardTabs.length;
    })
    .catch(() => 0);

  for (let index = count - 1; index >= 0; index--) {
    const marked = await frame
      .evaluate((i) => {
        document.querySelectorAll("[data-e2e-target]").forEach((el) => el.removeAttribute("data-e2e-target"));
        const target = window.__e2eCardTabs?.[i];

        if (!target) return false;

        (target as HTMLElement).dataset.e2eTarget = "1";

        return true;
      }, index)
      .catch(() => false);

    if (!marked) continue;

    await clickMarked(frame);

    for (let wait = 0; wait < 4; wait++) {
      if (await hasCardNumberField(frame)) return true;
      await new Promise((resolve) => setTimeout(resolve, 600));
    }
  }

  return false;
}

type FieldKind = "number" | "expiry" | "mm" | "yy" | "cvv" | "name";

/** Real mouse click at coordinates inside `frame` (which lives in an iframe). */
async function realClickInFrame(page: Page, frame: Frame, x: number, y: number): Promise<void> {
  const iframes = await page.$$("iframe");

  for (const handle of iframes) {
    const inner = await handle.contentFrame().catch(() => null);

    if (inner !== frame) continue;

    const box = await handle.boundingBox().catch(() => null);

    if (!box) return;

    await page.mouse.click(box.x + x, box.y + y);

    return;
  }
}async function fillCardForm(frame: Frame): Promise<Record<string, boolean>> {
  // Pre-formatted exactly as the checkout renders them — the card-number
  // formatter's separators must be included or maxlength cuts the digits.
  const expect: Record<string, string> = {
    number: "4111 1111 1111 1111",
    expiry: "12 / 27",
    mm: "12",
    yy: "27",
    cvv: "123",
    name: "Test User",
    email: EMAIL,
    // The checkout renders a contact input in MORE than one stack view; the
    // card form validates all copies, so every visible one gets the number.
    contact: "9876543210",
  };

  // The card pane can re-render after the tab click, detaching earlier input
  // handles — typing into them silently goes nowhere. So: re-query fresh
  // handles every attempt and verify the LIVE values before declaring success.
  for (let attempt = 1; attempt <= 3; attempt++) {
    // What sits ON TOP of the number field? An invisible .stack-overlay above
    // it swallows focus and keystrokes, which is exactly the "typing goes
    // nowhere" symptom. Remove only that one overlay, not the whole stack.
    const topAtField = await frame
      .evaluate(() => {
        const input = document.querySelector('input[name="card.number"]');

        if (!(input instanceof HTMLElement)) return null;

        const rect = input.getBoundingClientRect();
        const top = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);

        return top ? `${top.tagName}.${String(top.className).slice(0, 60)}` : null;
      })
      .catch(() => null);

    if (attempt === 1) console.log(`  top element over card.number: ${topAtField}`);

    if (topAtField?.includes("stack-overlay")) {
      console.log("  removing the overlay that covers the card fields");
      await frame
        .evaluate(() => {
          const input = document.querySelector('input[name="card.number"]');
          const rect = input?.getBoundingClientRect();

          if (!rect) return;

          const top = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);

          top?.closest(".stack-overlay")?.remove();
        })
        .catch(() => undefined);
      await new Promise((resolve) => setTimeout(resolve, 400));
    }

    const handles = await frame.$$("input");

    for (const handle of handles) {
      // Classify inside the browser context — module helpers are not in scope there.
      const kind = await frame.evaluate((el: HTMLInputElement): FieldKind | null => {
        const rect = el.getBoundingClientRect();

        // Zero-sized or hairline inputs belong to hidden stack views / decoy
        // copies — typing into them is lost, so they are skipped entirely.
        if (rect.width < 80 || rect.height < 12) return null;
        if (el.type === "radio" || el.type === "checkbox") return null;

        const hay = `${el.id} ${el.name} ${el.placeholder} ${el.getAttribute("aria-label") ?? ""}`.toLowerCase();

        // Contact inputs exist in several stack views and ALL are validated
        // by the card form — fill every visible copy.
        if (/mobile|contact|phone/.test(hay)) return "contact";
        if (/cvv|cvc/.test(hay)) return "cvv";
        if (/exp/.test(hay) || (/mm/.test(hay) && /yy/.test(hay))) return "expiry";
        if (/\bmm\b/.test(hay)) return "mm";
        if (/\byy\b/.test(hay)) return "yy";
        if (/card/.test(hay) && /num/.test(hay)) return "number";
        if (/mail/.test(hay)) return "email"; // Razorpay asks for email on the card pane
        if (/name/.test(hay) && !/user|account/.test(hay)) return "name";
        return null;
      }, handle);

      if (!kind) continue;

      const target = expect[kind];
      const current = await handle
        .evaluate((el) => (el instanceof HTMLInputElement ? el.value : ""))
        .catch(() => "");

      const normalized = (value: string) => (kind === "contact" || kind === "number" ? value.replace(/\D/g, "") : value);

      if (normalized(current) === normalized(target)) continue; // already correct

      // Never keystroke-type here: Razorpay's input formatter re-renders the
      // field mid-sequence (the digits stop at "4111 1111 1111 1"), so the
      // value is inserted atomically via execCommand, which fires the real
      // input events the framework listens for.
      const inserted = await handle
        .evaluate((el, expected) => {
          if (!(el instanceof HTMLInputElement)) return false;

          el.focus();
          el.select();

          return document.execCommand("insertText", false, expected);
        }, target)
        .catch(() => false);

      const after = await handle
        .evaluate((el) => (el instanceof HTMLInputElement ? el.value : ""))
        .catch(() => "");

      // The formatter inserts separators ("12 / 27", "4111 1111 …") — compare
      // digits-only on both sides, or correct values look "wrong" and the
      // retry loop double-appends.
      const digits = (value: string) => value.replace(/\D/g, "");

      const exact = kind === "name" || kind === "email";

      if (exact ? after !== target : digits(after) !== digits(target)) {
        console.log(`  field ${kind}: execCommand path ${inserted ? "failed to commit" : "unsupported"} (live: "${after}")`);
      }
    }

    // RBI tokenization: the "Save this card" consent checkbox can be
    // mandatory — unticked, the Continue button silently refuses to act.
    const saveState = await frame
      .evaluate(() => {
        const box = document.querySelector('input[name="save"]');

        return box instanceof HTMLInputElement && box.getBoundingClientRect().width > 0 ? box.checked : null;
      })
      .catch(() => null);

    if (saveState === false) {
      const saveHandle = await frame.$('input[name="save"]');

      if (saveHandle) {
        await saveHandle.click().catch(() => undefined); // trusted click

        const ticked = await frame
          .evaluate(() => {
            const box = document.querySelector('input[name="save"]');

            return box instanceof HTMLInputElement ? box.checked : false;
          })
          .catch(() => false);

        console.log(`  save-card checkbox ${ticked ? "ticked" : "could not be ticked"}`);
      }
    }

    // Verify the VISIBLE copy of each field — a decoy duplicate can hold the
    // digits while the real form stays empty. NOTE: only ANONYMOUS arrows may
    // appear inside evaluate bodies — esbuild names any helper (const arrow
    // or function declaration) via its module-scope __name wrapper, which
    // does not exist in the browser and makes the whole evaluate throw.
    const values = await frame
      .evaluate(() => {
        const selectors = [
          ['number', 'input[name="card.number"]'],
          ['expiry', 'input[name="card.expiry"]'],
          ['cvv', 'input[name="card.cvv"]'],
          ['name', 'input[name="card.name"]'],
          ['email', 'input[name="email"]'],
          ['contact', 'input[name="contact"]'],
        ] as const;
        const result: Record<string, string> = {};

        for (const [key, selector] of selectors) {
          const inputs = [...document.querySelectorAll(selector)].filter(
            (el): el is HTMLInputElement =>
              el instanceof HTMLInputElement &&
              el.getBoundingClientRect().width >= 80 &&
              el.getBoundingClientRect().height >= 12,
          );

          // Prefer the filled one when both a decoy and the real field exist.
          result[key] = (inputs.find((el) => el.value.length > 0) ?? inputs[0])?.value ?? "";
        }

        return result;
      })
      .catch((error) => {
        console.log(`  values verify threw: ${String(error).slice(0, 120)}`);

        return { number: "", expiry: "", cvv: "" };
      });

    const filled: Record<string, boolean> = {
      number: values.number.replace(/\D/g, "").length >= 15,
      expiry: values.expiry.replace(/\D/g, "").length === 4,
      cvv: values.cvv.length >= 3,
      name: values.name.length > 0,
      email: /.+@.+\..+/.test(values.email),
      contact: values.contact.replace(/\D/g, "").length === 10,
    };

    if (filled["number"] && filled["expiry"] && filled["cvv"] && filled["name"] && filled["email"] && filled["contact"]) {
      if (attempt > 1) console.log(`  card form verified on attempt ${attempt}`);

      return filled;
    }

    console.log(`  card fill attempt ${attempt} incomplete (live: ${JSON.stringify(values)}) — retrying`);
    await new Promise((resolve) => setTimeout(resolve, 1200));
  }

  return {};
}

/**
 * Submit the card form — it is labelled "Continue" in the current checkout
 * build. The shared ancestor of the card fields also contains the contact
 * section's Continue, which appears EARLIER in the DOM — clicking the first
 * match silently does nothing. So: mark every visible candidate below the
 * card fields and really click them one by one until the checkout advances
 * (card form leaves the screen, a bank/OTP frame appears, or a processing
 * state shows).
 */
async function submitCardForm(page: Page, frame: Frame): Promise<boolean> {
  const count = await frame
    .evaluate(() => {
      // Only the VISIBLE card input's scope counts (hidden stack views keep
      // mounted copies whose buttons belong to dead panes).
      const numberInput = [
        ...document.querySelectorAll(
          'input[name="card.number"], input[aria-label="Card Number"]',
        ),
      ].find((el) => el.getBoundingClientRect().width >= 80);

      if (!numberInput) return 0;

      let scope: Element | null = numberInput;
      const candidates: HTMLElement[] = [];

      for (let depth = 0; depth < 8 && scope; depth += 1) {
        scope = scope.parentElement;

        if (!scope) break;

        for (const el of scope.querySelectorAll("button, [role=button]")) {
          const rect = el.getBoundingClientRect();
          const text = el.textContent.trim();

          if (rect.width === 0) continue;
          if (!/continue|pay/i.test(text)) continue;
          if (candidates.includes(el as HTMLElement)) continue;

          candidates.push(el as HTMLElement);
        }

        if (candidates.length) break; // nearest scope with a button wins
      }

      window.__e2ePayButtons = candidates;

      return candidates.length;
    })
    .catch(() => 0);

  for (let index = count - 1; index >= 0; index--) {
    const marked = await frame
      .evaluate((i) => {
        document.querySelectorAll("[data-e2e-target]").forEach((el) => el.removeAttribute("data-e2e-target"));
        const button = window.__e2ePayButtons?.[i];

        if (!button) return false;

        button.dataset.e2eTarget = "1";

        return true;
      }, index)
      .catch(() => false);

    if (!marked) continue;

    // What sits on top of the button? An invisible overlay above it makes a
    // real click land on the overlay instead — same "click does nothing" bug
    // as the method tabs had.
    const buttonInfo = await frame
      .evaluate(() => {
        const button = document.querySelector('[data-e2e-target="1"]');

        if (!(button instanceof HTMLElement)) return null;

        const rect = button.getBoundingClientRect();
        const cx = rect.x + rect.width / 2;
        const cy = rect.y + rect.height / 2;
        const top = document.elementFromPoint(cx, cy);
        const invalid = [...document.querySelectorAll("input:invalid")]
          .filter((el) => el.getBoundingClientRect().width > 0)
          .map((el) => `${(el as HTMLInputElement).name}:${(el as HTMLInputElement).validationMessage.slice(0, 40)}`);

        return {
          cx,
          cy,
          top: top ? `${top.tagName}.${String(top.className).slice(0, 50)}` : null,
          isSelf: top === button || Boolean(top && button.contains(top)),
          disabled: (button as HTMLButtonElement).disabled ?? false,
          ariaDisabled: button.getAttribute("aria-disabled"),
          invalidFields: invalid.slice(0, 6),
        };
      })
      .catch(() => null);

    if (!buttonInfo) continue;

    console.log(
      `  card submit: candidate ${count - index}/${count} at (${Math.round(buttonInfo.cx)},${Math.round(buttonInfo.cy)}) top=${buttonInfo.top} disabled=${buttonInfo.disabled} invalid=${JSON.stringify(buttonInfo.invalidFields)}`,
    );

    if (buttonInfo.top?.includes("stack-overlay")) {
      await frame
        .evaluate(() => {
          const button = document.querySelector('[data-e2e-target="1"]');
          const rect = button?.getBoundingClientRect();

          if (!rect) return;

          document
            .elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)
            ?.closest(".stack-overlay")
            ?.remove();
        })
        .catch(() => undefined);
    }

    // Attempt order: el.click() inside evaluate (fires full activation
    // behavior — form submit — and is the only variant that ever advanced
    // this button), then a real coordinate click, then the handle click.
    let advanced = false;

    await frame
      .evaluate(() => {
        const button = document.querySelector('[data-e2e-target="1"]') as HTMLElement | null;

        button?.click();
      })
      .catch(() => undefined);

    const waitAdvance = async () => {
      for (let wait = 0; wait < 8; wait++) {
        const newBankFrame = page
          .frames()
          .some((f) => /otp|bank|payu|payz|hdfc|icici|axis|sbi/i.test(f.url()) && !/sardine|stripe|hcaptcha/i.test(f.url()));
        const cardGone = !(await hasCardNumberField(frame));
        const processing = await frame
          .evaluate(() => /processing|don'?t (close|refresh)|verifying|contacting/i.test(document.body.textContent.slice(0, 4000)))
          .catch(() => false);

        // The flow notes say the card Continue leads to an intermediate
        // "Pay ₹90" confirmation button — reaching it IS advancement, and
        // extra clicks here can cancel that confirmation.
        const payConfirm = await frame
          .evaluate(() =>
            [...document.querySelectorAll("button, [role=button]")].some(
              (el) =>
                el.getBoundingClientRect().width > 0 &&
                /^pay(?!\s*later)(\s|$|₹| rs)/i.test(el.textContent.trim()),
            ),
          )
          .catch(() => false);

        if (newBankFrame || cardGone || processing || payConfirm) return true;

        await new Promise((resolve) => setTimeout(resolve, 700));
      }

      return false;
    };

    advanced = await waitAdvance();

    if (!advanced) {
      console.log("  card submit: coordinate click did not advance — modal right now:");
      console.log(
        `  ${JSON.stringify(
          await frame
            .evaluate(() => ({
              text: document.body.textContent.replace(/\s+/g, " ").slice(0, 350),
              buttons: [...document.querySelectorAll("button, [role=button]")]
                .filter((el) => el.getBoundingClientRect().width > 0)
                .map((el) => el.textContent.trim().slice(0, 20))
                .slice(0, 8),
              fields: [...document.querySelectorAll("input")]
                .filter((el) => el.getBoundingClientRect().width > 0 && el.type !== "radio")
                .map((el) => `${(el as HTMLInputElement).name}=${(el as HTMLInputElement).value.slice(0, 20)}`),
              errors: [...document.querySelectorAll("[class*=error], [role=alert]")]
                .filter((el) => el.getBoundingClientRect().width > 0)
                .map((el) => el.textContent.trim().slice(0, 80))
                .slice(0, 4),
            }))
            .catch(() => null),
        ).slice(0, 700)}`,
      );

      console.log("  card submit: trying handle click");
      await clickMarked(frame);
      advanced = await waitAdvance();
    }

    if (!advanced) {
      console.log("  card submit: handle click did not advance — trying synthetic dispatch");

      await frame
        .evaluate(() => {
          const button = document.querySelector('[data-e2e-target="1"]') as HTMLElement | null;

          button?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
        })
        .catch(() => undefined);

      advanced = await waitAdvance();
    }

    if (!advanced) {
      // Last user-like path: implicit form submission — Enter in a form input
      // triggers submit through trusted keyboard events, no click handler
      // involved.
      console.log("  card submit: pressing Enter in the card-number field");

      const numberHandle = await frame.$('input[name="card.number"]');

      if (numberHandle) {
        await numberHandle.focus().catch(() => undefined);
        await page.keyboard.press("Enter");
        advanced = await waitAdvance();
      }
    }

    if (advanced) return true;

    // Wait for REAL advancement — bank/OTP frames, the card form actually
    // leaving, or a processing state. Raw frame count is NOT a signal: the
    // fraud-check iframes attach on their own and spoofed this check before.
    for (let wait = 0; wait < 8; wait++) {
      const newBankFrame = page
        .frames()
        .some((f) => /otp|bank|payu|payz|hdfc|icici|axis|sbi/i.test(f.url()) && !/sardine|stripe|hcaptcha/i.test(f.url()));
      const cardGone = !(await hasCardNumberField(frame));
      const processing = await frame
        .evaluate(() => /processing|don'?t (close|refresh)|verifying|contacting/i.test(document.body.textContent.slice(0, 4000)))
        .catch(() => false);

      if (newBankFrame || cardGone || processing) return true;

      await new Promise((resolve) => setTimeout(resolve, 700));
    }
  }

  return false;
}

/**
 * Real mouse click on the element the browser-side probe marked with
 * `data-e2e-target`; falls back to a synthetic click when trusted events
 * cannot reach the frame.
 */
async function clickMarked(frame: Frame): Promise<boolean> {
  const handle = await frame.$('[data-e2e-target="1"]');

  if (!handle) return false;

  try {
    await handle.click();
    return true;
  } catch {
    return frame
      .evaluate(() => {
        const el = document.querySelector('[data-e2e-target="1"]') as HTMLElement | null;
        el?.click();
        return Boolean(el);
      })
      .catch(() => false);
  }
}

/**
 * The checkout opens with a mandatory "Contact details" step: a mobile number
 * behind its own Continue button, before the payment methods respond. The
 * digits must look real — Razorpay's validator rejects obviously fake ones.
 */
async function submitContactDetails(frame: Frame): Promise<boolean> {
  const handles = await frame.$$("input");

  for (const handle of handles) {
    const isContact = await frame.evaluate((el) => {
      const rect = el.getBoundingClientRect();

      if (rect.width === 0 || rect.height === 0) return false;
      if (el.type === "radio" || el.type === "checkbox") return false;

      const hay = `${el.id} ${el.name} ${el.placeholder} ${el.getAttribute("aria-label") ?? ""}`.toLowerCase();

      return /mobile|contact|phone/.test(hay);
    }, handle);

    if (!isContact) continue;

    await handle.click({ clickCount: 3 }); // select any residue, then replace
    await handle.type("9876543210", { delay: 30 });
    await new Promise((resolve) => setTimeout(resolve, 400)); // let the form revalidate

    // Anchor on the modal's "Contact details" heading so the card form's own
    // Continue button can never be the one marked. The click itself must be a
    // real one — the checkout ignores synthetic .click() on this step.
    const marked = await frame.evaluate(() => {
      document
        .querySelectorAll("[data-e2e-target]")
        .forEach((el) => el.removeAttribute("data-e2e-target"));

      const heading = [...document.querySelectorAll("h1, h2, h3, p, span, div")].find(
        (candidate) =>
          candidate.children.length === 0 && /contact details/i.test(candidate.textContent),
      );
      const contact = [...document.querySelectorAll("input")].find((candidate) =>
        /mobile|contact|phone/.test(
          `${candidate.name} ${candidate.placeholder} ${candidate.getAttribute("aria-label") ?? ""}`.toLowerCase(),
        ),
      );

      if (!contact) return false;

      for (const button of document.querySelectorAll("button, [role=button]")) {
        if (!/^continue$/i.test(button.textContent.trim())) continue;
        if (button.getBoundingClientRect().width === 0) continue;

        let scope: Element | null = button;

        for (let depth = 0; depth < 6 && scope; depth += 1) {
          scope = scope.parentElement;

          if (scope?.contains(contact) && (!heading || scope.contains(heading))) {
            (button as HTMLElement).dataset.e2eTarget = "1";
            return true;
          }
        }
      }

      return false;
    });

    if (!marked) return false;

    return clickMarked(frame);
  }

  return false;
}

async function clickPay(frame: Frame): Promise<boolean> {
  const marked = await frame
    .evaluate(() => {
      document.querySelectorAll("[data-e2e-target]").forEach((el) => el.removeAttribute("data-e2e-target"));

      const buttons = [...document.querySelectorAll("button, [role=button]")].filter(
        (el) => el.getBoundingClientRect().width > 0,
      );
      // "Pay Later" is a payment METHOD — never let it match the pay button.
      const pay = buttons.find((el) => /^pay(?!\s*later)(\s|$|₹| rs)/i.test(el.textContent.trim()));

      if (!pay) return false;

      (pay as HTMLElement).dataset.e2eTarget = "1";
      return true;
    })
    .catch(() => false);

  if (!marked) return false;

  return clickMarked(frame);
}

async function main(): Promise<void> {
  await mkdir(OUT, { recursive: true });
  const { token, refresh, userId, credits: creditsBefore } = await login();
  console.log(`signed in · ${creditsBefore} credits before`);

  // Headless Chrome trips Razorpay's hCaptcha fraud check right after "Pay";
  // set HEADFUL=1 (or write NOT_HEADLESS) to run a visible browser and solve
  // the captcha by hand if the automated run keeps failing there.
  const headful = process.env.HEADFUL === "1" || process.env.NOT_HEADLESS === "1";
  const browser = await puppeteer.launch({
    headless: !headful,
    args: [
      "--disable-blink-features=AutomationControlled",
      "--no-sandbox",
      "--disable-dev-shm-usage",
      "--window-size=1320,980",
    ],
  });
  let orderId: string | undefined;

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 });
    await page.evaluateOnNewDocument(
      (keys, tokens) => {
        window.localStorage.setItem(keys.access, tokens.accessToken);
        window.localStorage.setItem(keys.refresh, tokens.refresh);
      },
      { access: ACCESS_KEY, refresh: REFRESH_KEY },
      { accessToken: token, refresh },
    );

    const consoleErrors: string[] = [];
    page.on("pageerror", (error) => consoleErrors.push(`pageerror: ${String(error).slice(0, 160)}`));

    // What does the checkout actually ASK the gateway when Continue is hit?
    // "Nothing happens" is ambiguous — this disambiguates inert view vs
    // gateway rejection.
    const gatewayCalls: string[] = [];

    page.on("response", (response) => {
      const url = response.url();

      let parsed: URL;

      try {
        parsed = new URL(url);
      } catch {
        return;
      }

      const isGateway = parsed.host === "api.razorpay.com" && /(checkout|payments|orders)/.test(parsed.pathname);

      if (!isGateway) return;

      const line = `${response.status()} ${parsed.pathname.slice(0, 70)}`;

      gatewayCalls.push(line);

      // The BIN (/iin) lookup decides how the card can pay — log its body.
      if (/iin|payment\/create|payments\/json/.test(parsed.pathname)) {
        response
          .text()
          .then((body) => console.log(`  gateway: ${line} · body: ${body.slice(0, 300)}`))
          .catch(() => console.log(`  gateway: ${line} · body unreadable`));
      } else {
        console.log(`  gateway: ${line}`);
      }
    });

    // Watch for a captcha challenge appearing anywhere in the checkout stack.
    let captchaSeen = false;

    page.on("frameattached", (f) => {
      if (/hcaptcha|recaptcha/i.test(f.url())) {
        captchaSeen = true;
        console.log(`  captcha frame attached: ${f.url().slice(0, 80)}`);
      }
    });

    await page.goto(`${WEB}/app/payments`, { waitUntil: "load", timeout: 30000 });
    await page.waitForSelector(".plan.featured button", { timeout: 20000 });

    const buyLabel = await page.$eval(".plan.featured button", (el) => el.textContent.trim());
    record("the featured Popular pack offers to sell credits", /buy/i.test(buyLabel), `button "${buyLabel}"`);

    await page.click(".plan.featured button");

    const frame = await findCheckoutFrame(page);
    record("Razorpay checkout opens over the page", frame !== null, frame ? frame.url().slice(0, 80) : "no razorpay frame appeared");

    if (!frame) {
      const dump = await describeFrame(page.mainFrame());
      console.log("  main frame:", JSON.stringify(dump).slice(0, 400));
      await page.screenshot({ path: path.join(OUT, "payments-checkout-fail.png") });
      return finish();
    }

    await page.screenshot({ path: path.join(OUT, "payments-checkout-open.png") });

    // The checkout opens with a mandatory contact step (mobile number) before
    // the payment methods respond.
    const contactPresent = await frame
      .evaluate(() =>
        [...document.querySelectorAll("input")].some((el) => {
          const rect = el.getBoundingClientRect();

          return (
            rect.width > 0 &&
            /mobile|contact|phone/.test(`${el.name} ${el.placeholder}`.toLowerCase())
          );
        }),
      )
      .catch(() => false);

    if (contactPresent) {
      const contactDone = await submitContactDetails(frame);
      record(
        "the checkout's contact step is completed",
        contactDone,
        contactDone ? "mobile number entered, Continue clicked" : "could not complete the contact step",
      );    } else {
      record("the checkout's contact step is completed", true, "no contact step was shown");
    }

    // Once the contact step is accepted the checkout advances inside the same
    // modal — the mobile input can stay mounted in a collapsed section, so the
    // decisive signal is the card form itself, reached through the Cards tab.
    let cardReady = await hasCardNumberField(frame);

    if (!cardReady) {
      cardReady = await openCardMethod(page, frame);
    }

    if (!cardReady) {
      await openCardMethod(page, frame); // one retry — the first click can race the re-render
      cardReady = await hasCardNumberField(frame);
    }

    record(
      "the Cards method opens the real card form",
      cardReady,
      cardReady ? "card number field is visible" : "payment methods never opened a card form",
    );

    if (!cardReady) {
      const stuck = await frame
        .evaluate(() => ({
          buttons: [...document.querySelectorAll("button, [role=button]")]
            .filter((el) => el.getBoundingClientRect().width > 0)
            .map((el) => el.textContent.trim().slice(0, 24)),
          inputs: [...document.querySelectorAll("input")]
            .filter((el) => el.getBoundingClientRect().width > 0)
            .map((el) => ({ name: el.name, value: String(el.value).slice(0, 12) })),
        }))
        .catch(() => null);
      console.log("  stuck dump:", JSON.stringify(stuck));
      await page.screenshot({ path: path.join(OUT, "payments-checkout-stuck.png") });
      return finish();
    }

    let filled = await fillCardForm(frame);

    if (!filled["number"]) {
      await openCardMethod(page, frame);
      filled = await fillCardForm(frame);
    }

    record(
      "the test card form is filled",
      Boolean(filled["number"] && filled["expiry"] && filled["cvv"]),
      `filled: ${Object.keys(filled).filter((key) => filled[key]).join(", ") || "nothing"}`,
    );

    if (!filled["number"]) {
      console.log("  checkout dump:", JSON.stringify(await describeFrame(frame)).slice(0, 500));

      // Where are the live inputs really? The card form can live in a nested
      // iframe of the checkout frame, invisible to the checkout frame itself.
      for (const f of page.frames()) {
        const inventory = await f
          .evaluate(() =>
            [...document.querySelectorAll("input, button")]
              .filter((el) => el.getBoundingClientRect().width > 0)
              .map(
                (el) =>
                  `${el.tagName}:${(el as HTMLInputElement).name || el.textContent.trim().slice(0, 16)}`,
              )
              .slice(0, 14),
          )
          .catch(() => null);

        if (inventory?.length) console.log(`  inputs in ${f.url().slice(0, 60)}: ${JSON.stringify(inventory)}`);

      // Are the card inputs the real fields or decoys? PCI checkouts often
      // embed the editable fields in nested iframes; the top-level ones may
      // be readonly shadows that swallow scripted typing.
      const cardTruth = await frame
        .evaluate(() => {
          const numberInput = document.querySelector('input[name="card.number"]');

          return {
            outerHtml: numberInput?.outerHTML.slice(0, 240) ?? null,
            readOnly: numberInput instanceof HTMLInputElement ? numberInput.readOnly : null,
            disabled: numberInput instanceof HTMLInputElement ? numberInput.disabled : null,
            nestedIframes: [...document.querySelectorAll("iframe")]
              .map((el) => `${el.name || el.title || "anon"}=${el.src.slice(0, 60)}`)
              .slice(0, 8),
          };
        })
        .catch(() => null);

      console.log(`  card input truth: ${JSON.stringify(cardTruth)}`);
      }

      await page.screenshot({ path: path.join(OUT, "payments-checkout-fail.png") });
      return finish();
    }

    const submitted = await submitCardForm(page, frame);
    record(
      "the card form is submitted",
      submitted,
      submitted
        ? "checkout advanced past the card form"
        : `no advancement · gateway calls: ${gatewayCalls.length ? gatewayCalls.slice(-3).join(" | ") : "NONE — view is inert"}`,
    );

    // Some builds show a final "Pay ₹90" confirmation before processing.
    await new Promise((resolve) => setTimeout(resolve, 2500));
    const payClicked = await clickPay(frame);
    if (payClicked) console.log("  confirmation Pay clicked");

    /**
     * Fill and submit the bank OTP screen. 4111… lands on Razorpay's mock
     * bank page ("OTP" inputs live in a DIFFERENT iframe than the checkout),
     * so every open frame is polled for ~20s. Synthetic typing is fine for
     * inputs, but the submit button again needs a real, marked click.
     */
    async function handleOtp(): Promise<boolean> {
      for (let poll = 0; poll < 20; poll++) {
        for (const current of page.frames()) {
          const otpInput = await current
            .evaluateHandle(() => {
              const inputs = [...document.querySelectorAll("input")].filter(
                (el) =>
                  el.getBoundingClientRect().width > 0 &&
                  /otp/.test(
                    `${el.id} ${el.name} ${el.placeholder} ${el.getAttribute("aria-label") ?? ""}`.toLowerCase(),
                  ),
              );

              return inputs[0] ?? null;
            })
            .catch(() => null);

          const el = otpInput && (await otpInput.evaluate((el) => (el instanceof HTMLElement ? el : null)).catch(() => null));

          if (!el) continue;

          const inputHandle = otpInput.asElement();

          if (!inputHandle) continue;

          await inputHandle.click({ clickCount: 3 }).catch(() => undefined);
          await inputHandle.type("123456", { delay: 20 }).catch(() => undefined);

          const submitted = await current
            .evaluate(() => {
              document.querySelectorAll("[data-e2e-target]").forEach((n) => n.removeAttribute("data-e2e-target"));

              const button = [...document.querySelectorAll("button, [role=button]")].find(
                (el) =>
                  el.getBoundingClientRect().width > 0 &&
                  /(^pay\b|pay now|submit|verify)/i.test(el.textContent.trim()),
                );

              if (!button) return false;

              (button as HTMLElement).dataset.e2eTarget = "1";

              return true;
            })
            .catch(() => false);

          if (submitted) await clickMarked(current);

          console.log(`  OTP screen — filled and submitted in ${current.url().slice(0, 60)}`);

          return true;
        }

        await new Promise((resolve) => setTimeout(resolve, 1000));
      }

      return false;
    }

    const otp = await handleOtp();

    if (!otp) {
      console.log("  no OTP screen within 20s — either the card pays directly or something stalled");

      const framesNow = page.frames().map((f) => f.url().slice(0, 70));

      console.log(`  frames now: ${JSON.stringify(framesNow)}`);
    }

    // Success: the checkout closes, the app verifies with Razorpay, credits land.
    let paid = false;

    try {
      await page.waitForFunction(
        async (api, bearer, before, pack) => {
          const response = await fetch(`${api}/auth/me`, {
            headers: { Authorization: `Bearer ${bearer}` },
          });
          const body = (await response.json()) as { user?: { credits?: number } };
          return body.user?.credits === before + pack;
        },
        { timeout: 45000, polling: 1200 },
        API,
        token,
        creditsBefore,
        PLAN_CREDITS,
      );
      paid = true;
    } catch {
      paid = false;

      const framesAtFailure = page.frames().map((f) => f.url().slice(0, 80));

      console.log(`  frames at failure: ${JSON.stringify(framesAtFailure)}`);
      console.log("  modal at failure:", JSON.stringify(await describeFrame(frame)).slice(0, 400));
    }

    record(
      "paying in the real checkout adds the credits",
      paid,
      paid
        ? `balance ${creditsBefore} → ${await creditsOf(token)}`
        : `balance still ${await creditsOf(token)} · captcha: ${captchaSeen ? "CHALLENGED" : "none"} · console: ${consoleErrors.slice(0, 2).join(" | ") || "none"}`,
    );

    await page.screenshot({ path: path.join(OUT, "payments-checkout-paid.png") });

    const latest = await pool.query<{ id: number; razorpay_order_id: string; status: string }>(
      "SELECT id, razorpay_order_id, status FROM payments WHERE user_id = $1 ORDER BY id DESC LIMIT 1",
      [userId],
    );
    const row = latest.rows[0];
    orderId = row?.razorpay_order_id;

    record(
      "the purchase is recorded as completed",
      row?.status === "completed",
      row ? `row #${row.id} · order ${row.razorpay_order_id} · ${row.status}` : "no payment row",
    );

    const purchases = await page.$$eval(".purchase-list li", (els) =>
      els.map((el) => el.textContent.replace(/\s+/g, " ").trim().slice(0, 80)),
    );
    record(
      "Past purchases lists the new purchase",
      purchases.some((text) => /50 credits/.test(text) && /₹\s?90/.test(text)),
      purchases[0] ?? "list empty",
    );
  } finally {
    // Restore the account: the run is a test, not a purchase.
    if (orderId) {
      await pool.query("DELETE FROM payments WHERE razorpay_order_id = $1", [orderId]);
    }
    await pool.query("UPDATE users SET credits = $1 WHERE id = $2", [creditsBefore, userId]);
    const restored = await pool.query<{ credits: number }>(
      "SELECT credits FROM users WHERE id = $1",
      [userId],
    );
    console.log(`\ncleanup: test purchase removed, balance restored to ${restored.rows[0]?.credits}`);
    await pool.end();
    await browser.close();
  }

  return finish();
}

function finish(): void {
  const failed = checks.filter((check) => !check.ok);
  console.log(`\n${checks.length - failed.length}/${checks.length} checks passed (UI checkout)`);
  if (failed.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
