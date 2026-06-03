import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vite-plus/test";
import {
  buildFunctionExpectationCss,
  buildFunctionCall,
  createCssExpect,
  CssExpectError,
  CssExpectUnsupportedError,
  loadCssExpectSource,
} from "../src/index.ts";

describe("CSS expectation generation", () => {
  test("builds custom CSS function calls", () => {
    expect(buildFunctionCall("--double", ["4px"])).toBe("--double(4px)");
    expect(buildFunctionCall("--mix", ["red", "blue"])).toBe("--mix(red, blue)");
  });

  test("rejects non-custom function names", () => {
    expect(() => buildFunctionCall("rgb", ["0", "0", "0"])).toThrow(/custom dashed identifiers/);
  });

  test("builds function expectation CSS with call-site custom properties", () => {
    expect(
      buildFunctionExpectationCss("css-expect-subject-1", "--space(var(--gap))", "margin-left", {
        "--gap": "4px",
      }),
    ).toBe(`.css-expect-subject-1 {
  --gap: 4px;
  margin-left: --space(var(--gap));
}`);
  });

  test("rejects invalid CSS property names", () => {
    expect(() => buildFunctionExpectationCss("subject", "--x()", "width; color", {})).toThrow(
      /Invalid CSS property name/,
    );
  });
});

describe("source loading", () => {
  test("loads files before inline CSS in the provided order", async () => {
    const directory = await mkdtemp(join(tmpdir(), "css-expect-"));
    const first = join(directory, "first.css");
    const second = join(directory, "second.css");

    await writeFile(first, ".first { color: red; }", "utf8");
    await writeFile(second, ".second { color: blue; }", "utf8");

    await expect(
      loadCssExpectSource({
        files: [first, second],
        css: ".inline { color: green; }",
      }),
    ).resolves.toBe(".first { color: red; }\n.second { color: blue; }\n.inline { color: green; }");
  });
});

describe("browser runtime", () => {
  test("reports CSSOM function metadata when Chromium exposes it", async () => {
    const css = await maybeCreateCssExpect({
      css: `
        @function --identity(--value <length>) returns <length> {
          result: var(--value);
        }
      `,
      unsupported: "skip",
    });

    if (css === undefined) {
      return;
    }

    try {
      const functions = await css.functions();

      expect(Array.isArray(functions)).toBe(true);
    } finally {
      await css.close();
    }
  });

  test("reports feature support through focused helpers", async () => {
    const css = await maybeCreateCssExpect({
      css: "",
      unsupported: "skip",
    });

    if (css === undefined) {
      return;
    }

    try {
      const support = await css.features();

      await expect(css.hasFunctions()).resolves.toBe(support.functionRules);
      await expect(css.hasMixins()).resolves.toBe(support.mixinRules);
      await expect(css.hasApply()).resolves.toBe(support.applyRules);
    } finally {
      await css.close();
    }
  });

  test("skips function expectations when native CSS function support is unavailable and skip is requested", async () => {
    const css = await maybeCreateCssExpect({
      css: `
        @function --identity(--value <length>) returns <length> {
          result: var(--value);
        }
      `,
      unsupported: "skip",
    });

    if (css === undefined) {
      return;
    }

    try {
      const result = await css.function("--identity", ["1px"]).as("width").equals("1px");
      const support = await css.features();

      expect(result.skipped).toBe(!support.functionRules);
      expect(result.passed).toBe(support.functionRules);
    } finally {
      await css.close();
    }
  });

  test("throws unsupported diagnostics for mixins until Chromium supports native mixins", async () => {
    const css = await maybeCreateCssExpect({
      css: `
        @mixin --button() {
          @result {
            display: inline-flex;
          }
        }
      `,
      unsupported: "fail",
    });

    if (css === undefined) {
      return;
    }

    try {
      const support = await css.features();

      if (!support.mixinRules || !support.applyRules) {
        await expect(
          css.mixin("--button", []).styles({ display: "inline-flex" }),
        ).rejects.toBeInstanceOf(CssExpectUnsupportedError);
        return;
      }

      await expect(
        css.mixin("--button", []).styles({ display: "inline-flex" }),
      ).resolves.toMatchObject({
        passed: true,
      });
    } finally {
      await css.close();
    }
  });

  test("requires a CSS property grammar for function expectations", async () => {
    const css = await maybeCreateCssExpect({
      css: "",
      unsupported: "skip",
    });

    if (css === undefined) {
      return;
    }

    try {
      await expect(css.function("--double", ["4px"]).equals("8px")).rejects.toThrow(
        /require \.as\(property\)/,
      );
    } finally {
      await css.close();
    }
  });

  test("expects native CSS function computed values when Chromium supports them", async () => {
    const css = await maybeCreateCssExpect({
      css: `
        @function --double(--value <length>) returns <length> {
          result: calc(var(--value) * 2);
        }

        @function --brand-color() returns <color> {
          result: rgb(12 90 180);
        }
      `,
      unsupported: "skip",
    });

    if (css === undefined) {
      return;
    }

    try {
      const support = await css.features();

      if (!support.functionRules) {
        const result = await css.function("--double", ["4px"]).as("width").equals("8px");
        expect(result.skipped).toBe(true);
        return;
      }

      await expect(
        css.function("--double", ["4px"]).as("width").equals("8px"),
      ).resolves.toMatchObject({
        actual: "8px",
        passed: true,
      });
      await expect(
        css.function("--brand-color", []).as("color").equals("rgb(12, 90, 180)"),
      ).resolves.toMatchObject({
        actual: "rgb(12, 90, 180)",
        passed: true,
      });
    } finally {
      await css.close();
    }
  });

  test("includes useful diagnostics for failed native expectations", async () => {
    const css = await maybeCreateCssExpect({
      css: `
        @function --identity(--value <length>) returns <length> {
          result: var(--value);
        }
      `,
      unsupported: "skip",
    });

    if (css === undefined) {
      return;
    }

    try {
      const support = await css.features();

      if (!support.functionRules) {
        return;
      }

      await expect(
        css.function("--identity", ["4px"]).as("width").equals("5px"),
      ).rejects.toMatchObject({
        diagnostics: expect.objectContaining({
          actual: "4px",
          expected: "5px",
          functionCall: "--identity(4px)",
          property: "width",
        }),
      } satisfies Partial<CssExpectError>);
    } finally {
      await css.close();
    }
  });
});

async function maybeCreateCssExpect(options: Parameters<typeof createCssExpect>[0]) {
  try {
    return await createCssExpect(options);
  } catch (error) {
    if (isMissingBrowserError(error)) {
      return undefined;
    }

    throw error;
  }
}

function isMissingBrowserError(error: unknown) {
  return (
    error instanceof Error && /Executable doesn't exist|browserType.launch/.test(error.message)
  );
}
