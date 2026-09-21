import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

/**
 * The SVG sanitizer, attacked in a real browser.
 *
 * There is a unit test for it already, but it runs under happy-dom, and this
 * is one of the few places where that is not good enough: the attack that got
 * through depended on Chromium's XML parser accepting markup that happy-dom
 * rejects outright. The unit test passed on the payload below while Chromium
 * executed it. So this check belongs in a browser, next to the browser the
 * app runs in.
 *
 * The module is a client-side one, so it is transpiled and evaluated in a
 * blank page rather than reached through the app — no AI key, no network, and
 * the sanitizer is still the app's own code, imported from source.
 */
const SOURCE = path.join(__dirname, "..", "..", "src", "lib", "utils", "sanitize-svg.ts");

function sanitizerAsScript(): string {
  const source = fs.readFileSync(SOURCE, "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
  });
  // The CommonJS output assigns onto `exports`; give it one and hand the
  // function to the page under a global name.
  return `(() => { const exports = {}; ${outputText}; window.sanitizeSvg = exports.sanitizeSvg; })()`;
}

/**
 * Each payload tries to reach `window.__pwned` through the sanitizer. The
 * processing-instruction one is the attack this test exists for: an XML
 * processing instruction survives serialisation verbatim, and the HTML parser
 * that re-inserts it ends it at the first ">", releasing the <img> as real
 * markup. `img` is one of the tags that breaks out of SVG into HTML, so its
 * onerror fires.
 */
const PAYLOADS: Record<string, string> = {
  "processing instruction": `<svg xmlns="http://www.w3.org/2000/svg"><?a ><img src=x onerror="window.__pwned=1">?></svg>`,
  "comment breakout": `<svg xmlns="http://www.w3.org/2000/svg"><!--</svg><img src=x onerror="window.__pwned=1">--></svg>`,
  "cdata breakout": `<svg xmlns="http://www.w3.org/2000/svg"><text><![CDATA[</text><img src=x onerror="window.__pwned=1">]]></text></svg>`,
  script: `<svg xmlns="http://www.w3.org/2000/svg"><script>window.__pwned=1</script></svg>`,
  "onload handler": `<svg xmlns="http://www.w3.org/2000/svg" onload="window.__pwned=1"><circle cx="1" cy="1" r="1"/></svg>`,
  "animated href": `<svg xmlns="http://www.w3.org/2000/svg"><a><animate attributeName="href" values="javascript:window.__pwned=1"/><text x="1" y="1">go</text></a></svg>`,
  "foreign object": `<svg xmlns="http://www.w3.org/2000/svg"><foreignObject><img src=x onerror="window.__pwned=1"/></foreignObject></svg>`,
};

test.describe("sanitizeSvg in a real browser", () => {
  test("no payload reaches the page as executable markup", async ({ page }) => {
    await page.setContent("<div id='host'></div>");
    await page.evaluate(sanitizerAsScript());

    for (const [name, raw] of Object.entries(PAYLOADS)) {
      const sanitized = await page.evaluate((payload) => {
        (window as unknown as { __pwned: number }).__pwned = 0;
        const clean = (window as unknown as { sanitizeSvg: (s: string) => string | null }).sanitizeSvg(payload);
        document.getElementById("host")!.innerHTML = clean ?? "";
        return clean;
      }, raw);

      // onerror on a broken image is asynchronous — give it a turn to fire.
      await page.waitForTimeout(200);
      const pwned = await page.evaluate(() => (window as unknown as { __pwned: number }).__pwned);

      expect(pwned, `${name} executed script (sanitized output: ${sanitized})`).toBe(0);
      expect(sanitized ?? "", `${name} left an event handler in the output`).not.toContain("onerror");
      expect(sanitized ?? "", `${name} left a non-element node in the output`).not.toContain("<?");
    }
  });

  test("an ordinary diagram survives intact", async ({ page }) => {
    await page.setContent("<div id='host'></div>");
    await page.evaluate(sanitizerAsScript());

    const out = await page.evaluate(() =>
      (window as unknown as { sanitizeSvg: (s: string) => string | null }).sanitizeSvg(
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 220"><rect x="10" y="10" width="80" height="40" fill="#38bdf8"/><text x="20" y="35" font-size="12">Force</text><line x1="10" y1="60" x2="300" y2="60" stroke="#888" stroke-width="2"/></svg>`
      )
    );

    expect(out).toContain("<rect");
    expect(out).toContain("<line");
    expect(out).toContain("Force");
  });
});
