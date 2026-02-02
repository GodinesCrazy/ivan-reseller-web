import express from "express";
import puppeteer from "puppeteer";

const app = express();
app.use(express.json());

app.post("/scrape/aliexpress", async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: "url required" });

  const browser = await puppeteer.launch({
    headless: false,
    args: ["--no-sandbox","--disable-setuid-sandbox"]
  });

  const page = await browser.newPage();
  await page.goto(url, { waitUntil: "domcontentloaded" });

  // Give time for manual captcha if needed
  await new Promise(r => setTimeout(r, 30000));

  const data = await page.evaluate(() => {
    const title = document.querySelector("h1")?.innerText || "";
    const price = document.querySelector("span[class*=price]")?.innerText || "";
    const images = Array.from(document.querySelectorAll("img"))
      .map(i => i.src)
      .filter(src => src.includes("alicdn"));
    return { title, price, currency: "USD", images };
  });

  await browser.close();
  res.json(data);
});

const PORT = process.env.PORT || 4444;
app.listen(PORT, () => {
  console.log(`Native scraper running on ${PORT}`);
});
