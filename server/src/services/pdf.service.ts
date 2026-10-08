import puppeteer, { type Browser } from "puppeteer";
import { PDFDocument } from "pdf-lib";

import { AppError } from "../errors/AppError.js";
import { logger } from "../lib/logger.js";
import { renderSinglePageHtml } from "./renderer.service.js";
import type { NotesData } from "../shared/types.js";

// A4 at 96 CSS px/inch: 8.27in x 11.69in ≈ 794 x 1123 px.
// Used as the render viewport so content lays out correctly for A4
// before printing.
const PAGE_WIDTH_PX = 794;
const PAGE_HEIGHT_PX = 1123;

export async function generatePdf(data: NotesData): Promise<Buffer> {
  let browser: Browser | undefined;

  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
  } catch (error) {
    logger.error("Puppeteer launch failed:");

    logger.error(error instanceof Error ? error.message : String(error));

    if (error instanceof Error && error.stack) {
      logger.error(error.stack);
    }

    throw new AppError(500, "Failed to launch the PDF renderer");
  }

  try {
    const pageBuffers: Uint8Array[] = [];

    for (let i = 0; i < data.pages.length; i++) {
      const html = renderSinglePageHtml(
        data.pages[i],
        data.subject,
        i,
        data.pages.length,
      );

      const browserPage = await browser.newPage();

      try {
        await browserPage.setViewport({
          width: PAGE_WIDTH_PX,
          height: PAGE_HEIGHT_PX,
        });

        // Puppeteer 25 no longer accepts networkidle0 for setContent, so the
        // document is loaded first and the network is then explicitly waited
        // on. Printing straight after 'load' silently falls back to system
        // fonts because Kalam / Permanent Marker / Architects Daughter have
        // not arrived from the Google Fonts CDN yet.
        await browserPage.setContent(html, {
          waitUntil: "load",
          timeout: 60_000,
        });

        try {
          await browserPage.waitForNetworkIdle({
            idleTime: 500,
            timeout: 30_000,
          });
        } catch {
          // The font CDN can legitimately be unavailable; print with whatever
          // is loaded rather than failing the whole generation.
          logger.warn(
            "Timed out waiting for web fonts; printing with current fonts.",
          );
        }

        // Font *decoding* can still be pending after the network settles;
        // document.fonts.ready resolves once it is done.
        await browserPage.evaluate(async () => {
          if (document.fonts && document.fonts.ready) {
            await document.fonts.ready;
          }
        });

        // A4 is used instead of raw width/height so every generated PDF page
        // has consistent A4 proportions. Zero margins let the notebook page
        // control its own visual margins and footer position.
        const pdfBuffer = await browserPage.pdf({
          format: "A4",
          printBackground: true,
          margin: { top: "0px", bottom: "0px", left: "0px", right: "0px" },
        });

        pageBuffers.push(pdfBuffer);
      } finally {
        await browserPage.close();
      }
    }

    const mergedPdf = await PDFDocument.create();

    for (const buffer of pageBuffers) {
      const singlePagePdf = await PDFDocument.load(buffer);

      // A logical page can genuinely span more than one physical A4 page if
      // its content overflows, so copy ALL pages instead of assuming that
      // every logical page produces exactly one physical page.
      const pageIndices = singlePagePdf.getPageIndices();

      const copiedPages = await mergedPdf.copyPages(singlePagePdf, pageIndices);

      copiedPages.forEach((page) => {
        mergedPdf.addPage(page);
      });
    }

    const mergedBytes = await mergedPdf.save();

    return Buffer.from(mergedBytes);
  } finally {
    await browser.close();
  }
}
