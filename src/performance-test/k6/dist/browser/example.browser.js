// src/performance-test/k6/browser/example.browser.ts
import { browser } from "k6/experimental/browser";
import { check as check2, sleep as sleep2 } from "k6";

// src/performance-test/k6/lib/utils.ts
import { check, sleep } from "k6";
var env = {
  BASEURL: __ENV.BASEURL || "https://example.com",
  API_BASEURL: __ENV.API_BASEURL || "https://api.example.com",
  AUTH_TOKEN: __ENV.AUTH_TOKEN || ""
};

// src/performance-test/k6/lib/thresholds.ts
var commonThresholds = {
  http_req_failed: ["rate<0.01"],
  http_req_duration: ["p(95)<500", "p(99)<1200"],
  checks: ["rate>0.99"]
};

// src/performance-test/k6/browser/example.browser.ts
var options = {
  thresholds: commonThresholds,
  scenarios: {
    ui: {
      executor: "constant-vus",
      vus: 3,
      duration: "1m",
      options: { browser: { type: "chromium" } }
    }
  },
  tags: { suite: "browser-ui" }
};
async function example_browser_default() {
  const page = browser.newPage();
  try {
    await page.goto(env.BASEURL, { waitUntil: "networkidle" });
    const title = await page.title();
    check2(title, { "has title": (t) => typeof t === "string" && t.length > 0 });
    await page.waitForTimeout(500);
    sleep2(1);
  } finally {
    await page.close();
  }
}
export {
  example_browser_default as default,
  options
};
//# sourceMappingURL=example.browser.js.map
