import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createCssExpect } from "../dist/index.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const cssFile = join(__dirname, "functions.css");

const css = await createCssExpect({
  browser: "chromium",
  files: [cssFile],
  unsupported: "skip",
});

try {
  const support = await css.features();

  if (!support.functionRules) {
    console.log("Browser does not support CSS custom functions. Skipping expectations.");
  } else {
    console.log(`Browser supports CSS custom functions: ${support.functionRules}`);

    await css.function("--double", ["4px"]).as("inline-size").equals("8px");
    await css
      .function("--apply-shadow", ["rgb(12, 90, 180)"])
      .as("box-shadow")
      .matches(matchesExpectedShadow);
    await css
      .function("--space-plus-gap", ["6px"])
      .with({ "--gap": "2px" })
      .as("margin-inline-start")
      .equals("8px");

    console.log("CSS function expectations passed.");
  }
} finally {
  await css.close();
}

function matchesExpectedShadow(actual) {
  // Check the stable parts of the computed box-shadow; browsers may include
  // extra normalized values such as spread radius or reorder whitespace.
  return actual.includes("rgb(12, 90, 180)") && actual.includes("0px 2px 4px");
}
