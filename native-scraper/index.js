import express from "express";
import puppeteer from "puppeteer";
import readline from "readline";

const app = express();
app.use(express.json());

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

function waitForEnter(message) {
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

    console.log("================================================");
    console.log("CHROME OPENED");
    console.log("If you see a CAPTCHA, solve it in the browser.");
    console.log("When the product page is fully visible, PRESS ENTER here.");
    console.log("================================================");
    await waitForEnter("👉 Press ENTER to continue scraping... ");

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

    if (!data.title || !data.title.trim() || !Array.isArray(data.images) || data.images.length === 0) {
      throw new Error("human_confirmation_received_but_no_data");
    }

    await browser.close();
    return res.json({ success: true, data });
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
