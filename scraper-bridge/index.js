import express from "express";
import axios from "axios";
import * as cheerio from "cheerio";

const app = express();
app.use(express.json());

app.get("/health", (req, res) => {
  res.json({ data: { status: "ok" }, status: "ok" });
});

app.post("/scraping/aliexpress/search", async (req, res) => {
  try {
    const { query, max_items: maxItems = 5 } = req.body || {};
    if (!query) return res.status(400).json({ error: "query required" });
    const limit = Math.min(Math.max(Number(maxItems) || 5, 1), 20);
    const searchUrl = `https://www.aliexpress.com/wholesale?SearchText=${encodeURIComponent(query)}`;
    const html = await axios.get(searchUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
      timeout: 30000,
    });
    const $ = cheerio.load(html.data);
    const items = [];
    $("[data-product-id]").slice(0, limit).each((i, el) => {
      const $el = $(el);
      const title = $el.find("h1, .item-title, a[href*='/item/']").first().text().trim();
      const url = $el.find("a[href*='/item/']").first().attr("href") || "";
      const img = $el.find("img").first().attr("src") || "";
      const priceText = $el.find(".price-current, .price, [data-price]").first().text().trim();
      const priceMatch = priceText.match(/[\d,]+\.?\d*/);
      const price = priceMatch ? parseFloat(priceMatch[0].replace(/,/g, "")) : 0;
      if (title && url && price > 0) {
        items.push({
          productId: url.split("/").pop()?.split(".html")[0] || "",
          title,
          url: url.startsWith("http") ? url : `https://www.aliexpress.com${url}`,
          price,
          currency: "USD",
          images: img ? [img.startsWith("//") ? `https:${img}` : img] : [],
        });
      }
    });
    res.json({ items });
  } catch (err) {
    res.status(500).json({ error: "search_failed", message: err?.message });
  }
});

app.post("/scraping/aliexpress/product", async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: "url required" });

    const html = await axios.get(url, {
      headers: {
        "User-Agent": "Mozilla/5.0"
      }
    });

    const $ = cheerio.load(html.data);

    const title = $("h1").first().text().trim();
    const price = $("span[class*=price]").first().text().trim();
    const images = [];

    $("img").each((i, el) => {
      const src = $(el).attr("src");
      if (src && src.includes("alicdn")) images.push(src);
    });

    res.json({
      title,
      price,
      currency: "USD",
      images
    });

  } catch (err) {
    res.status(500).json({ error: "scrape_failed" });
  }
});

const PORT = process.env.PORT || 3333;
app.listen(PORT, () => {
  console.log(`Scraper Bridge running on ${PORT}`);
});
