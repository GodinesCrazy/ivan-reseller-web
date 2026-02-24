const axios = require("axios");
const BASE = "https://ivanreseller.com";

async function run() {
  const loginRes = await axios.post(BASE + "/api/auth/login", { username: "admin", password: "admin123" }, { withCredentials: true, validateStatus: () => true });
  const cookies = loginRes.headers["set-cookie"] ? loginRes.headers["set-cookie"].join("; ") : "";
  const importRes = await axios.post(BASE + "/api/publisher/add_for_approval", {
    aliexpressUrl: "https://www.aliexpress.com/item/1005000000000.html",
    scrape: true
  }, { headers: { "Content-Type": "application/json", "Cookie": cookies }, withCredentials: true, validateStatus: () => true, timeout: 120000 });
  console.log("STATUS:", importRes.status);
  console.log("RESPONSE:", JSON.stringify(importRes.data, null, 2));
}
run().catch(e => { console.error(e.message); process.exit(1); });
