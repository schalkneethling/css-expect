import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createCssExpect } from "../dist/index.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const cssFile = join(__dirname, "functions.css");

const css = await createCssExpect({
  browser: "chromium",
  files: [cssFile],
});

try {
  const support = await css.features();

  console.log(`Browser supports CSS custom functions: ${support.functionRules}`);

  await css.function("--double", ["4px"]).as("width").equals("8px");
  await css.function("--brand-color", []).as("color").equals("rgb(12, 90, 180)");
  await css
    .function("--space-plus-gap", ["6px"])
    .with({ "--gap": "2px" })
    .as("margin-left")
    .equals("8px");

  console.log("CSS function expectations passed.");
} finally {
  await css.close();
}
