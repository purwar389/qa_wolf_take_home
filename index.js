const { chromium } = require("playwright");

const URL = "https://news.ycombinator.com/newest";
const COUNT = 100;

const scrape = async (page) => {
  const seen = new Set();
  const items = [];
  let zeroStreak = 0;

  while (items.length < COUNT) {
    await page.waitForSelector("tr.athing", { timeout: 15000 });
    const { rows, nextUrl, hasMore } = await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll("tr.athing"))
        .map((row) => {
          const id = row.id;
          const title = row.querySelector(".titleline a")?.innerText?.trim();
          const raw = row.nextElementSibling
            ?.querySelector(".age")
            ?.getAttribute("title");
          const iso = raw?.split(" ")[0];
          return id && iso ? { id, title, iso } : null;
        })
        .filter(Boolean);
      const more = document.querySelector("a.morelink");
      return { rows, nextUrl: more?.href || null, hasMore: !!more };
    });

    let added = 0;
    for (const r of rows) {
      if (seen.has(r.id)) continue;
      seen.add(r.id);
      items.push({ ...r, ts: new Date(r.iso).getTime() });
      added++;
      if (items.length >= COUNT) break;
    }

    if (items.length >= COUNT) break;
    zeroStreak = added ? 0 : zeroStreak + 1;
    if (!added && (!hasMore || zeroStreak > 1)) {
      throw new Error(`No new articles; collected ${items.length}`);
    }

    if (!nextUrl) break;
    let success = false;
    for (let attempt = 0; attempt < 3 && !success; attempt++) {
      try {
        const [resp] = await Promise.all([
          page.waitForNavigation({ waitUntil: "domcontentloaded" }),
          page.locator("a.morelink").first().click(),
        ]);
        if (!resp || !resp.ok()) {
          throw new Error(`Failed to load ${nextUrl} (status ${resp?.status()})`);
        }
        success = true;
      } catch (err) {
        if (attempt === 2) throw err;
        await page.waitForTimeout(500 * (attempt + 1));
      }
    }
    await page.waitForTimeout(150);
  }

  return items;
};

const assertSorted = (list) => {
  for (let i = 1; i < list.length; i++) {
    if (list[i].ts > list[i - 1].ts) {
      throw new Error(`Order violation at ${i}: "${list[i].title}"`);
    }
  }
};

(async () => {
  const browser = await chromium.launch({
    headless: false,
    channel: "chrome",
  });
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto(URL, { waitUntil: "domcontentloaded" });
  const articles = await scrape(page);
  assertSorted(articles);
  console.log(
    `Verified first ${articles.length} Hacker News newest articles are sorted newest → oldest`
  );
  articles.forEach((a, i) =>
    console.log(`${i + 1}. ${a.title} — ${new Date(a.ts).toISOString()}`)
  );
  await browser.close();
})();
