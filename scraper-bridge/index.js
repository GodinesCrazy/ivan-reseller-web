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

app.post("/scraping/mercadolibre/search", async (req, res) => {
  try {
    const { site_id: siteId = "MLC", query, limit = 20 } = req.body || {};
    if (!query) return res.status(400).json({ error: "query required" });
    const cap = Math.min(Math.max(Number(limit) || 20, 1), 20);

    const mlApiUrl = `https://api.mercadolibre.com/sites/${siteId}/search?q=${encodeURIComponent(query)}&limit=${cap}`;

    // Attempt 1: ScraperAPI proxy (bypasses IP-level blocks via rotating proxies)
    const scraperApiKey = process.env.SCRAPERAPI_KEY || process.env.SCRAPER_API_KEY || "";
    if (scraperApiKey) {
      try {
        const proxyUrl = `http://api.scraperapi.com/?api_key=${scraperApiKey}&url=${encodeURIComponent(mlApiUrl)}&render=false`;
        const proxyResp = await axios.get(proxyUrl, { timeout: 20000 });
        const results = (proxyResp.data?.results || []).slice(0, cap).map((r) => ({
          id: String(r.id || ""),
          title: r.title || "",
          price: Number(r.price) || 0,
          currency_id: r.currency_id || "CLP",
          permalink: r.permalink || "",
        })).filter((r) => r.price > 0);
        if (results.length > 0) {
          return res.json({ results, source: "scraperapi_proxy" });
        }
      } catch (scraperErr) {
        // fall through
      }
    }

    // Attempt 2: ZenRows proxy
    const zenRowsKey = process.env.ZENROWS_API_KEY || "";
    if (zenRowsKey) {
      try {
        const zenUrl = `https://api.zenrows.com/v1/?apikey=${zenRowsKey}&url=${encodeURIComponent(mlApiUrl)}&premium_proxy=true`;
        const zenResp = await axios.get(zenUrl, { timeout: 20000 });
        const results = (zenResp.data?.results || []).slice(0, cap).map((r) => ({
          id: String(r.id || ""),
          title: r.title || "",
          price: Number(r.price) || 0,
          currency_id: r.currency_id || "CLP",
          permalink: r.permalink || "",
        })).filter((r) => r.price > 0);
        if (results.length > 0) {
          return res.json({ results, source: "zenrows_proxy" });
        }
      } catch (zenErr) {
        // fall through
      }
    }

    // Attempt 3: ML official API direct (may work from non-Railway IPs)
    try {
      const apiResp = await axios.get(mlApiUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; ResellBot/1.0)",
          "Accept": "application/json",
        },
        timeout: 15000,
      });
      const results = (apiResp.data?.results || []).slice(0, cap).map((r) => ({
        id: String(r.id || ""),
        title: r.title || "",
        price: Number(r.price) || 0,
        currency_id: r.currency_id || "CLP",
        permalink: r.permalink || "",
      })).filter((r) => r.price > 0);
      if (results.length > 0) {
        return res.json({ results, source: "ml_api" });
      }
    } catch (apiErr) {
      // fall through to HTML scrape
    }

    // Attempt 2: scrape ML website listing page
    const siteMap = { MLC: "cl", MLB: "com.br", MLM: "com.mx", MLA: "com.ar" };
    const tld = siteMap[siteId] || "cl";
    const webUrl = `https://listado.mercadolibre.${tld}/${encodeURIComponent(query).replace(/%20/g, "-")}`;
    const htmlResp = await axios.get(webUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Language": "es-CL,es;q=0.9",
      },
      timeout: 20000,
    });
    const $ = cheerio.load(htmlResp.data);
    const results = [];
    $("li.ui-search-layout__item").slice(0, cap).each((i, el) => {
      const $el = $(el);
      const title = $el.find(".poly-component__title, .ui-search-item__title").first().text().trim();
      const href = $el.find("a.poly-component__title, a.ui-search-item__image-link").first().attr("href") || "";
      const priceInt = $el.find(".andes-money-amount__fraction").first().text().replace(/\D/g, "");
      const price = parseInt(priceInt, 10) || 0;
      const id = href.match(/MLC\d+/)?.[0] || "";
      if (title && price > 0) {
        results.push({ id, title, price, currency_id: "CLP", permalink: href });
      }
    });
    res.json({ results, source: "ml_web_scrape" });
  } catch (err) {
    res.status(500).json({ error: "ml_search_failed", message: err?.message });
  }
});

const PORT = process.env.PORT || 3333;
app.listen(PORT, () => {
  console.log(`Scraper Bridge running on ${PORT}`);
});
