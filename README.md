# css-expect

Native browser-backed expectations for CSS custom functions and future CSS mixins.

`@schalkneethling/css-expect` is a prototype for unit testing CSS language features in the browser. It is inspired by Sass True's ergonomics, but it does not parse, transform, compile, or emulate CSS. The selected browser engine is the source of truth.

## Requirements

- Chromium with native CSS custom function support for the current prototype.
- Playwright, installed as this package's runtime browser automation dependency.
- CSS mixin expectations are future-ready, but currently report unsupported until Chromium implements native `@mixin` and `@apply`.

Chromium is the default and currently validated browser. The `browser` option also accepts `"firefox"` and `"webkit"` so future test suites can target whichever engine first implements a given native CSS feature.

## Usage

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

Use `.as(property)` to test a function through a real CSS property grammar. CSS custom functions are evaluated at computed-value time, so expectations read values from `getComputedStyle()`.

```ts
await css
  .function("--space-plus", ["var(--gap)"])
  .with({ "--gap": "4px" })
  .as("margin-left")
  .equals("8px");
```

## Runnable Example

This repository includes a runnable file-based example in `examples/functions.css`.

```bash
vp run example
```

The script builds the package, loads the CSS file through `files: ["examples/functions.css"]`, and runs Chromium-backed expectations against the functions in that file.

## CSSOM Introspection

`css.functions()` reports metadata observed through Chromium's CSSOM when the browser exposes the CSS Functions and Mixins interfaces.

```ts
const functions = await css.functions();
const supportsFunctions = await css.hasFunctions();
const supportsMixins = await css.hasMixins();
const supportsApply = await css.hasApply();
```

The returned metadata is diagnostic only. `@schalkneethling/css-expect` does not depend on CSSOM descriptors to execute expectations; expectations are based on actual computed style.

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

## Publishing

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
