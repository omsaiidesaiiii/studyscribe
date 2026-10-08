import { describe, expect, it } from "vitest";
import { extractVideoId } from "../services/transcript.service.js";
import { AppError } from "../errors/AppError.js";
import { notesSchema } from "../schemas/notes.schema.js";
import { generateSchema } from "../schemas/generate.schema.js";
import {
  extractJsonPayload,
  isQuotaExhaustedError,
  isRetryableError,
  splitTranscript,
} from "../services/gemini.service.js";
import { DEFAULT_API_PORT, resolvePort } from "../lib/port.js";
import jwt from "jsonwebtoken";
import { hashToken, signRefreshToken } from "../lib/refresh-token.js";

describe("extractVideoId", () => {
  it.each([
    ["https://www.youtube.com/watch?v=aircAruvnKk", "aircAruvnKk"],
    ["https://youtu.be/aircAruvnKk?t=30", "aircAruvnKk"],
    ["https://www.youtube.com/watch?v=aircAruvnKk&list=PL1", "aircAruvnKk"],
  ])("parses %s", (url, expected) => {
    expect(extractVideoId(url)).toBe(expected);
  });

  it("rejects a non-YouTube URL with a 400", () => {
    expect(() => extractVideoId("https://example.com/video")).toThrow(AppError);
  });
});

describe("generateSchema", () => {
  it("applies defaults", () => {
    const parsed = generateSchema.parse({
      url: "https://www.youtube.com/watch?v=aircAruvnKk",
    });

    expect(parsed.language).toBe("hinglish");
    expect(parsed.model).toBeUndefined();
  });

  it("rejects unknown models rather than silently substituting", () => {
    const result = generateSchema.safeParse({
      url: "https://www.youtube.com/watch?v=aircAruvnKk",
      model: "gpt-4",
    });

    expect(result.success).toBe(false);
  });
});

describe("notesSchema", () => {
  it("accepts a minimal notebook", () => {
    const result = notesSchema.safeParse({
      title: "T",
      subject: "S",
      pages: [{ topic: "P", blocks: [{ type: "paragraph", html: "hi" }] }],
    });

    expect(result.success).toBe(true);
  });

  it("rejects a page without blocks", () => {
    const result = notesSchema.safeParse({
      title: "T",
      subject: "S",
      pages: [{ topic: "P" }],
    });

    expect(result.success).toBe(false);
  });

  it("rejects unknown block types", () => {
    const result = notesSchema.safeParse({
      title: "T",
      subject: "S",
      pages: [{ topic: "P", blocks: [{ type: "video", src: "x" }] }],
    });

    expect(result.success).toBe(false);
  });

  it("requires at least one page", () => {
    const result = notesSchema.safeParse({ title: "T", subject: "S", pages: [] });

    expect(result.success).toBe(false);
  });
});

describe("splitTranscript", () => {
  it("keeps short transcripts in a single batch", () => {
    expect(splitTranscript("short transcript")).toHaveLength(1);
  });

  it("samples windows across the whole video for very long transcripts", () => {
    const long = `START ${"a".repeat(200_000)} MIDDLE ${"b".repeat(200_000)} END`;

    const batches = splitTranscript(long);

    // Never more than the configured cap, and every window fits the limit.
    expect(batches).toHaveLength(3);

    for (const batch of batches) {
      expect(batch.length).toBeLessThanOrEqual(120_000);
    }

    // Coverage spans the lecture: the opening and the closing minutes are both
    // represented, instead of the tail of the video being silently dropped.
    expect(batches[0]).toContain("START");
    expect(batches[batches.length - 1]).toContain("END");
  });
});

describe("isRetryableError", () => {
  it("retries rate limits and transient failures", () => {
    expect(isRetryableError(new Error("429 RESOURCE_EXHAUSTED"))).toBe(true);
    expect(isRetryableError(new Error("503 model is experiencing high demand"))).toBe(true);
    expect(isRetryableError(new Error("fetch failed"))).toBe(true);
  });

  it("does not retry client errors", () => {
    expect(isRetryableError(new AppError(400, "bad request"))).toBe(false);
    expect(isRetryableError(new AppError(422, "no captions"))).toBe(false);
  });
});

describe("resolvePort", () => {
  it("uses the documented port when PORT is unset or blank", () => {
    for (const raw of [undefined, null, "", "   "]) {
      expect(resolvePort(raw).port).toBe(DEFAULT_API_PORT);
      expect(resolvePort(raw).reason).toBeUndefined();
    }
  });

  it("honours an explicit, usable port", () => {
    expect(resolvePort("8080")).toEqual({ port: 8080 });
  });

  it("does not bind an ephemeral port when a parent process exports PORT=0", () => {
    // dotenv never overrides an existing env var, so a PORT exported by a shell
    // profile or IDE would shadow server/.env and make the API unreachable.
    const resolved = resolvePort("0");
    expect(resolved.port).toBe(DEFAULT_API_PORT);
    expect(resolved.reason).toContain('"0"');
  });

  it("rejects unusable values with a reason", () => {
    for (const raw of ["abc", "-1", "70000", "5055.5"]) {
      const resolved = resolvePort(raw);
      expect(resolved.reason).toBeDefined();
      expect(resolved.port).toBe(DEFAULT_API_PORT);
    }
  });
});

describe("signRefreshToken", () => {
  it("mints a distinct token (and hash) per call for the same user", () => {
    process.env.REFRESH_TOKEN_SECRET = "test_refresh_secret";

    const first = signRefreshToken("user-1");
    const second = signRefreshToken("user-1");

    // refresh_tokens.token_hash is UNIQUE, so identical JWTs would 500 on login.
    expect(first).not.toBe(second);
    expect(hashToken(first)).not.toBe(hashToken(second));
  });

  it("stays verifiable and carries a unique id", () => {
    process.env.REFRESH_TOKEN_SECRET = "test_refresh_secret";

    const payload = jwt.verify(signRefreshToken("user-1"), "test_refresh_secret") as {
      userId: string;
      jti: string;
    };

    expect(payload.userId).toBe("user-1");
    expect(payload.jti).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe("notesSchema doodle handling", () => {
  const notesWithDoodles = (doodles: unknown) => ({
    title: "Backprop",
    subject: "Neural networks",
    pages: [
      {
        topic: "Gradients",
        doodles,
        blocks: [{ type: "paragraph", html: "<p>Chain rule again.</p>" }],
      },
    ],
  });

  const pagesOf = (input: ReturnType<typeof notesWithDoodles>) => {
    const result = notesSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (!result.success) throw new Error("expected success");
    return result.data.pages;
  };

  it("drops unusable doodles instead of failing the whole notebook", () => {
    // A live model produced {"top": 1.2e+160} with no text at all; that must
    // not cost an entire generation.
    const pages = pagesOf(
      notesWithDoodles([
        { top: 1.2e160 },
        { top: "middle", text: "note" },
        { text: "  revise  " },
        "garbage",
        null,
        42,
      ]),
    );

    expect(pages[0].doodles).toEqual([
      { top: 0, text: "note" },
      { top: 0, text: "revise" },
    ]);
  });

  it("clamps the offset into the printable band and caps length and count", () => {
    const pages = pagesOf(
      notesWithDoodles([
        { top: 1.2e160, text: "imp" },
        { top: -50, text: "revise" },
        { top: 120, text: "x".repeat(80) },
        { top: 300, text: "fourth" },
      ]),
    );

    expect(pages[0].doodles).toEqual([
      { top: 900, text: "imp" },
      { top: 0, text: "revise" },
      { top: 120, text: "x".repeat(40) },
    ]);
  });

  it("treats a missing or malformed doodles value as no doodles", () => {
    expect(pagesOf(notesWithDoodles(undefined))[0].doodles).toBeUndefined();
    expect(pagesOf(notesWithDoodles("scribble"))[0].doodles).toEqual([]);
    expect(pagesOf(notesWithDoodles({ top: 1 }))[0].doodles).toEqual([]);
  });
});

describe("extractJsonPayload", () => {
  it("passes plain JSON through", () => {
    expect(extractJsonPayload('{"title":"a"}')).toBe('{"title":"a"}');
    expect(extractJsonPayload('[1,2]')).toBe("[1,2]");
  });

  it("unwraps markdown fences, which weaker fallback models emit", () => {
    const fenced = '```json\n{\n  "title": "a"\n}\n```';
    expect(extractJsonPayload(fenced)).toBe('{\n  "title": "a"\n}');
    expect(extractJsonPayload("```\n[1]\n```")).toBe("[1]");
  });

  it("keeps the outermost object when prose surrounds it", () => {
    const chatty = 'Sure! Here are the notes:\n{"title":"a"}\nLet me know if you need more.';
    expect(extractJsonPayload(chatty)).toBe('{"title":"a"}');
  });

  it("flags answers that contain no JSON at all", () => {
    // A real response from the last-resort model: YAML-ish, nothing object-shaped.
    expect(extractJsonPayload("pages:\n  - blocks:\n    - text: hi")).toBeNull();
    expect(extractJsonPayload("")).toBeNull();
  });
});

describe("isQuotaExhaustedError", () => {
  it("recognises a daily free-tier quota from the 429 text", () => {
    const live =
      "429 Rate limit exceeded for model gemini-3.8-flash (limit: 20 requests " +
      "per day on Free Tier). Please retry in 15h56m18s or upgrade your tier.";
    expect(isQuotaExhaustedError(new Error(live))).toBe(true);
  });

  it("leaves short-lived rate limits retryable", () => {
    expect(isQuotaExhaustedError(new Error("429 too many requests, retry in 8s"))).toBe(false);
    expect(isQuotaExhaustedError(new Error("503 high demand"))).toBe(false);
    expect(isQuotaExhaustedError(new Error("fetch failed"))).toBe(false);
  });
});
