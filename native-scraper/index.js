import express from "express";
import puppeteer from "puppeteer";

const app = express();
app.use(express.json());

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

app.post("/scrape/aliexpress", async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: "url required" });

  let browser;
  try {
    browser = await puppeteer.launch({
      headless: "new",
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--no-zygote"
      ]
    });

    const page = await browser.newPage();
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });

    await page.waitForSelector("body", { timeout: 15000 });

    const html = await page.content();
    if (/captcha|verify|blocked|access denied/i.test(html)) {
      return res.status(429).json({
        success: false,
        error: "captcha_or_blocked"
      });
    }

    const data = await page.evaluate(() => {

      const title =
        document.querySelector("h1.product-title-text")?.innerText ||
        document.querySelector("h1")?.innerText ||
        document.title ||
        "";

      const images = [];

      document.querySelectorAll("img").forEach(img => {
        const src =
          img.getAttribute("src") ||
          img.getAttribute("data-src") ||
          img.getAttribute("data-ks-lazyload");

        if (src && src.includes("alicdn")) {
          images.push(src.startsWith("//") ? "https:" + src : src);
        }
      });

      const priceText =
        document.querySelector("span[class*=price]")?.innerText ||
        document.querySelector("div[class*=price]")?.innerText ||
        "";

      return {
        title: title.trim(),
        price: priceText.trim(),
        currency: "USD",
        images
      };
    });

    await browser.close();
    res.json(data);
  } catch (err) {
    if (browser) await browser.close().catch(() => {});
    if (err.message && /captcha|block|denied/i.test(err.message)) {
      return res.status(429).json({
        success: false,
        error: "captcha_or_blocked"
      });
    }
    res.status(500).json({ success: false, error: "scrape_failed" });
  }
});

const PORT = process.env.PORT || 4444;
app.listen(PORT, () => {
  console.log(`Native scraper running on ${PORT}`);
});
