# css-expect

Native browser-backed expectations for CSS custom functions and future CSS mixins.

`@schalkneethling/css-expect` is a small prototype for unit testing native CSS custom functions in a real browser. It lets you load CSS, call a custom function through an actual CSS property, and assert against the computed value returned by the browser engine.

It is inspired by the ergonomics of Sass True, but it has a different contract: css-expect does not parse, transform, compile, polyfill, or emulate CSS. The selected browser is the source of truth.

Read the announcement post for the background and motivation: [Introducing css-expect: unit testing CSS functions in the browser](https://schalkneethling.com/posts/introducing-css-expect-unit-testing-css-functions-in-the-browser/).

## What It Is

- A browser-backed expectation helper for native CSS custom functions.
- A way to test computed CSS values with Playwright-managed browsers.
- A prototype API for native CSS mixins once browsers implement `@mixin` and `@apply`.

## What It Is Not

- It is not a CSS parser, compiler, transpiler, or polyfill.
- It does not make unsupported CSS features work in browsers that do not implement them.
- It does not replace Vitest, Playwright Test, or another test runner. Use it inside the runner you already prefer.
- It is not a general-purpose DOM assertion library. Its focus is CSS language features evaluated by the browser.
- It is not a general CSS feature-detection library. Use built-in CSS and Web APIs such as `CSS.supports()` for broad feature detection.

## Requirements

- A JavaScript or TypeScript test environment that can run ESM.
- Playwright, installed as this package's runtime browser automation dependency.
- Chrome with native CSS custom function support for the current prototype.

Chrome is the currently validated browser. The `browser` option defaults to Playwright's `"chromium"` engine and also accepts `"firefox"` and `"webkit"` so future test suites can target whichever engine first implements a given native CSS feature.

CSS mixin expectations are future-ready, but currently report unsupported until browsers implement native `@mixin` and `@apply`.

## Install

```bash
npm install --save-dev @schalkneethling/css-expect
npx playwright install chromium
```

If your package manager disables install scripts, make sure the Chromium browser binary is installed before running browser-backed expectations.

## Quick Start

Create a css-expect runtime with inline CSS or one or more CSS files. Always close the runtime when the test is done so the Playwright browser exits cleanly.

```ts
import { createCssExpect } from "@schalkneethling/css-expect";

const css = await createCssExpect({
  browser: "chromium",
  css: `
    @function --double(--value <length>) returns <length> {
      result: calc(var(--value) * 2);
    }
  `,
});

try {
  await css.function("--double", ["4px"]).as("width").equals("8px");
} finally {
  await css.close();
}
```

Use `.as(property)` to test a function through a real CSS property grammar. CSS custom functions are evaluated at computed-value time, so css-expect reads the final value from `getComputedStyle()`.

```ts
await css
  .function("--space-plus-gap", ["6px"])
  .with({ "--gap": "2px" })
  .as("margin-inline-start")
  .equals("8px");
```

For values that browsers may serialize with small differences, use `.matches(predicate)`.

```ts
await css
  .function("--apply-shadow", ["rgb(12, 90, 180)"])
  .as("box-shadow")
  .matches((actual) => actual.includes("rgb(12, 90, 180)") && actual.includes("0px 2px 4px"));
```

## Using CSS Files

Pass `files` to load CSS from disk. Files are loaded in order before any inline `css` option.

```ts
const css = await createCssExpect({
  browser: "chromium",
  files: ["./functions.css"],
  unsupported: "skip",
});
```

The `unsupported` option controls what happens when the selected browser does not support the native CSS feature being tested:

- `"fail"` is the default and throws a `CssExpectUnsupportedError`.
- `"skip"` returns a skipped expectation result with a clear reason.

## With Vitest

css-expect can be used inside Vitest and other async-capable JavaScript runners.

```ts
import { describe, expect, test } from "vitest";
import { createCssExpect } from "@schalkneethling/css-expect";

describe("CSS custom functions", () => {
  test("doubles a length", async () => {
    const css = await createCssExpect({
      css: `
        @function --double(--value <length>) returns <length> {
          result: calc(var(--value) * 2);
        }
      `,
      unsupported: "skip",
    });

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
    } finally {
      await css.close();
    }
  });
});
```

## Runnable Example

This repository includes a runnable file-based example in `examples/functions.css`.

```bash
vp install
vp run example
```

The script builds the package, loads the CSS file through `files: ["examples/functions.css"]`, and runs Chromium-backed expectations against the functions in that file.

## CSSOM Introspection

`css.functions()` reports metadata observed through the browser's CSSOM when the browser exposes the CSS Functions and Mixins interfaces.

```ts
const functions = await css.functions();
const support = await css.features();

const supportsFunctions = await css.hasFunctions();
const supportsMixins = await css.hasMixins();
const supportsApply = await css.hasApply();
```

The returned metadata is diagnostic only. css-expect does not depend on CSSOM descriptors to execute expectations; expectations are based on actual computed style.

## Mixins

The mixin API is reserved for native browser support:

```ts
await css.mixin("--button", ["primary"]).styles({
  display: "inline-flex",
  color: "rgb(255, 255, 255)",
});
```

In the current prototype this feature-detects `@mixin` and `@apply`, then fails or skips with a clear unsupported-feature diagnostic depending on the `unsupported` option.

## Development

```bash
vp install
vp check
vp test
vp pack
```

## Maintainer Notes

Before the first release:

- Enable 2FA for npm and GitHub.
- Configure npm trusted publishing for `@schalkneethling/css-expect` after creating the package on npm:
  - provider: GitHub Actions
  - repository: `schalkneethling/css-expect`
  - workflow filename: `publish.yml`
  - environment: `publish`
- Remove any npm tokens from GitHub repository secrets.
- Protect the `main` branch and require pull-request review before merging.
- Set GitHub Actions default workflow permissions to read-only.
- Create a GitHub environment named `publish` and restrict it to the `main` branch.
- Run the local package checks:

```bash
vp check
vp test
vp run build
vp run package:check
npm pack --dry-run
```

This package uses `.npmrc` with `ignore-scripts=true` so npm lifecycle scripts do not run during installs.
