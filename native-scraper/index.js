import express from "express";
import puppeteer from "puppeteer";
import readline from "readline";

const app = express();
app.use(express.json());

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

function waitForEnter(message = "Press ENTER to continue... ") {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    rl.question(message, () => {
      rl.close();
      resolve();
    });
  });
}

app.post("/scrape/aliexpress", async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ success: false, error: "url required" });

  let browser;
  try {
    browser = await puppeteer.launch({
      headless: false,
      args: ["--no-sandbox", "--disable-setuid-sandbox"]
    });

    const page = await browser.newPage();
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 120000 });

    console.log("");
    console.log("==================================================");
    console.log("PAGE LOADED. Please inspect the browser window.");
    console.log("If there is a CAPTCHA, solve it.");
    console.log("If no CAPTCHA, just confirm page looks correct.");
    console.log("Then press ENTER here to continue...");
    console.log("==================================================");
    await waitForEnter();

    const pageUrl = page.url();
    const pageTitle = await page.title();
    console.log("[SCRAPER] Current URL:", pageUrl);
    console.log("[SCRAPER] Page title:", pageTitle);

    const title = await page.evaluate(() => {
      const h1 = document.querySelector("h1");
      return h1 ? h1.innerText.trim() : null;
    });
    console.log("[SCRAPER] Extracted title:", title);

    const images = await page.evaluate(() => {
      const out = [];
      document.querySelectorAll("img").forEach(img => {
        const src =
          img.getAttribute("src") ||
          img.getAttribute("data-src") ||
          img.getAttribute("data-ks-lazyload");
        if (src && src.includes("alicdn")) {
          out.push(src.startsWith("//") ? "https:" + src : src);
        }
      });
      return out;
    });
    console.log("[SCRAPER] Images found:", images.length);

    const priceText = await page.evaluate(() => {
      const el =
        document.querySelector("span[class*=price]") ||
        document.querySelector("div[class*=price]");
      return el ? el.innerText.trim() : "";
    });

    if (title === null || title === "" || !Array.isArray(images) || images.length === 0) {
      throw new Error("native_scraper_extraction_failed");
    }

    await browser.close();
    return res.json({
      success: true,
      title,
      price: priceText,
      currency: "USD",
      images
    });
  } catch (err) {
    if (browser) {
      await browser.close().catch(() => {});
    }
    return res.status(500).json({ success: false, error: err?.message || "scrape_failed" });
  }
});

const PORT = process.env.PORT || 4444;
app.listen(PORT, () => {
  console.log(`Native scraper running on ${PORT}`);
});
