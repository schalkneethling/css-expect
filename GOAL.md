# Project Goal

## North Star

css-expect should make it practical to write small, trustworthy tests for native CSS custom functions, and eventually native CSS mixins, by asking a real browser for the computed result instead of emulating CSS in JavaScript.

## Who This Is For

- CSS library authors and design-system maintainers experimenting with native CSS custom functions.
- Frontend engineers who want unit-test-style feedback for browser-evaluated CSS values.
- Standards-aware tool builders who need diagnostics around emerging CSS features without introducing a parser, compiler, transpiler, or polyfill.

## Core Goals

- Provide a compact ESM API that can be used from Vitest, Vite+, Playwright-aware test suites, and other async JavaScript or TypeScript runners.
- Evaluate CSS custom functions through real CSS properties and `getComputedStyle()`, so the selected browser engine remains the source of truth.
- Support inline CSS and ordered CSS files so tests can cover both isolated snippets and reusable CSS modules.
- Return clear expectation results and failure diagnostics, including generated CSS, browser details, feature support, expected values, and actual computed values.
- Expose focused feature-support helpers for CSS functions, mixins, `@apply`, and available CSSOM metadata.

## Success Looks Like

- A user can install the package, load CSS, and assert a custom function result in a few lines of test code.
- Tests fail because the browser computed a different value, not because css-expect guessed or reimplemented CSS semantics incorrectly.
- Unsupported browser features produce actionable skip or failure diagnostics, depending on the configured policy.
- The public API stays small, documented, typed, and stable enough for early adopters to use in real test suites.
- Package checks, type checks, browser-backed tests, examples, and publishing checks pass before release.

## Non-Goals

- css-expect is not a CSS parser, compiler, transpiler, optimizer, or polyfill.
- css-expect should not make unsupported CSS features work in browsers that do not implement them.
- css-expect should not replace Vitest, Playwright Test, or any general-purpose test runner.
- css-expect should not become a broad DOM assertion library, a complete CSS feature-detection framework, or a full suite of CSS assertions and expectations.
- css-expect should stay focused on testing CSS logic such as custom function results and, when the platform supports them, mixin return values.
- css-expect should not hide browser differences behind normalization that changes the meaning of computed CSS.
- css-expect should not add large framework integrations until the core browser-backed expectation model is proven useful.

## Principles and Constraints

- The browser is authoritative. Prefer computed style and native CSSOM evidence over local interpretation.
- Keep assertions property-aware. CSS custom functions are evaluated in a property grammar, so expectations should require callers to name the property under test.
- Be explicit about experimental platform support. Chrome/Chromium is the currently validated target, while Firefox and WebKit options exist for future browser support.
- Keep diagnostics useful for debugging test failures and emerging CSS feature support.
- Keep the package install and publish path conservative: ESM output, generated types, ignored npm lifecycle scripts, pinned release checks, and trusted publishing.
- Prefer a small dependency surface. Playwright is the runtime browser automation dependency; new dependencies should earn their place.

## Current Focus

- Validate the custom-function API against current Chromium support.
- Preserve good behavior when browser support is missing by supporting both fail-fast and skip policies.
- Keep examples and README usage aligned with the shipped API.
- Prepare the package for a safe first public release.
