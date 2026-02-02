import express from "express";
import axios from "axios";
import * as cheerio from "cheerio";

const app = express();
app.use(express.json());

app.get("/health", (req, res) => {
  res.json({ data: { status: "ok" } });
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

app.listen(3333, () => {
  console.log("Scraper Bridge running on 3333");
});
