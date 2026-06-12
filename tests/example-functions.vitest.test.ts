import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { createCssExpect } from "../src/index.ts";

const exampleFunctionsFile = fileURLToPath(new URL("../examples/functions.css", import.meta.url));

describe("examples/functions.css with Vitest", () => {
  test("evaluates custom CSS functions in the browser", async () => {
    const css = await createCssExpectOrNull({
      browser: "chromium",
      files: [exampleFunctionsFile],
      unsupported: "skip",
    });

    if (css === null) {
      return;
    }

    try {
      if (!(await css.hasFunctions())) {
        return;
      }

      await expect(
        css.function("--double", ["4px"]).as("inline-size").equals("8px"),
      ).resolves.toMatchObject({
        actual: "8px",
        passed: true,
      });

      await expect(
        css
          .function("--apply-shadow", ["rgb(12, 90, 180)"])
          .as("box-shadow")
          .matches(matchesExpectedShadow),
      ).resolves.toMatchObject({
        passed: true,
      });

      await expect(
        css
          .function("--space-plus-gap", ["6px"])
          .with({ "--gap": "2px" })
          .as("margin-inline-start")
          .equals("8px"),
      ).resolves.toMatchObject({
        actual: "8px",
        passed: true,
      });
    } finally {
      await css.close();
    }
  });
});

async function createCssExpectOrNull(options: Parameters<typeof createCssExpect>[0]) {
  try {
    return await createCssExpect(options);
  } catch (error) {
    if (isMissingBrowserError(error)) {
      return null;
    }

    throw error;
  }
}

function matchesExpectedShadow(actual: string) {
  // Check the stable parts of the computed box-shadow; browsers may include
  // extra normalized values such as spread radius or reorder whitespace.
  return actual.includes("rgb(12, 90, 180)") && actual.includes("0px 2px 4px");
}

function isMissingBrowserError(error: unknown) {
  return (
    error instanceof Error && /Executable doesn't exist|browserType.launch/.test(error.message)
  );
}
