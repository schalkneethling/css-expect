import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { Browser, BrowserContext, BrowserType, Page } from "playwright";
import { chromium, firefox, webkit } from "playwright";

export type CssExpectBrowser = "chromium" | "firefox" | "webkit";
export type UnsupportedFeaturePolicy = "fail" | "skip";

export type CssExpectOptions = {
  css?: string | string[];
  files?: string[];
  browser?: CssExpectBrowser;
  viewport?: {
    width: number;
    height: number;
  };
  unsupported?: UnsupportedFeaturePolicy;
};

export type StyleExpectation = Record<string, string>;

export type CssFunctionParameterInfo = {
  name: string;
  type: string;
  defaultValue: string | null;
};

export type CssFunctionInfo = {
  name: string;
  returnType: string;
  parameters: CssFunctionParameterInfo[];
};

export type CssFeatureSupport = {
  functionRules: boolean;
  mixinRules: boolean;
  applyRules: boolean;
  cssom: {
    functionRules: CssFunctionInfo[];
    ruleTypes: string[];
  };
};

export type CssExpectationResult = {
  actual: string;
  expected?: string;
  generatedCss: string;
  passed: boolean;
  skipped: boolean;
  reason?: string;
};

export type CssExpectDiagnostics = {
  actual?: string;
  browserName: CssExpectBrowser;
  browserVersion: string;
  expected?: string;
  featureSupport: CssFeatureSupport;
  functionCall?: string;
  generatedCss?: string;
  property?: string;
  sourceCss: string;
};

export class CssExpectError extends Error {
  readonly diagnostics: CssExpectDiagnostics;

  constructor(message: string, diagnostics: CssExpectDiagnostics) {
    super(`${message}\n\n${formatDiagnostics(diagnostics)}`);
    this.name = "CssExpectError";
    this.diagnostics = diagnostics;
  }
}

export class CssExpectUnsupportedError extends CssExpectError {
  readonly feature: "function" | "mixin" | "apply";
  readonly skipped: boolean;

  constructor(
    feature: "function" | "mixin" | "apply",
    skipped: boolean,
    diagnostics: CssExpectDiagnostics,
  ) {
    const mode = skipped ? "Skipping" : "Unsupported";
    super(
      `${mode}: native CSS ${feature} support is not available in ${diagnostics.browserName}.`,
      diagnostics,
    );
    this.name = "CssExpectUnsupportedError";
    this.feature = feature;
    this.skipped = skipped;
  }
}

type ExpectContext = {
  browser: Browser;
  browserName: CssExpectBrowser;
  context: BrowserContext;
  page: Page;
  sourceCss: string;
  unsupported: UnsupportedFeaturePolicy;
  browserVersion: string;
};

export async function createCssExpect(options: CssExpectOptions = {}) {
  const browserName = options.browser ?? "chromium";
  const browserType = getBrowserType(browserName);
  const sourceCss = await loadCssExpectSource(options);
  const browser = await browserType.launch();
  const context = await browser.newContext({
    viewport: options.viewport ?? { width: 800, height: 600 },
  });
  const page = await context.newPage();

  await page.setContent("<!doctype html><html><head></head><body></body></html>");

  if (sourceCss.trim() !== "") {
    await page.addStyleTag({ content: sourceCss });
  }

  return new CssExpectRuntime({
    browser,
    browserName,
    context,
    page,
    sourceCss,
    unsupported: options.unsupported ?? "fail",
    browserVersion: browser.version(),
  });
}

export function buildFunctionCall(name: string, args: string[] = []) {
  validateCustomCssName(name, "function");
  return `${name}(${args.join(", ")})`;
}

export function buildFunctionExpectationCss(
  className: string,
  functionCall: string,
  property: string,
  callSiteProperties: StyleExpectation = {},
) {
  validateCssPropertyName(property);
  return buildStyleRule(className, [
    ...buildStyleDeclarations(callSiteProperties),
    buildStyleDeclaration(property, functionCall),
  ]);
}

class CssExpectRuntime {
  readonly #context: ExpectContext;
  #expectationId = 0;

  constructor(context: ExpectContext) {
    this.#context = context;
  }

  function(name: string, args: string[] = []) {
    return new CssFunctionExpectation(this, name, args);
  }

  mixin(name: string, args: string[] = []) {
    return new CssMixinExpectation(this, name, args);
  }

  async functions() {
    const support = await this.features();
    return support.cssom.functionRules;
  }

  async hasFunctions() {
    return (await this.features()).functionRules;
  }

  async hasMixins() {
    return (await this.features()).mixinRules;
  }

  async hasApply() {
    return (await this.features()).applyRules;
  }

  async features(): Promise<CssFeatureSupport> {
    return await this.#context.page.evaluate(() => {
      const style = document.createElement("style");
      style.textContent = `
        @function --css-expect-function-probe(--value <length>) returns <length> {
          result: var(--value);
        }

        @mixin --css-expect-mixin-probe() {
          @result {
            color: green;
          }
        }

        .css-expect-function-probe {
          width: --css-expect-function-probe(2px);
        }

        .css-expect-mixin-probe {
          @apply --css-expect-mixin-probe();
        }
      `;
      document.head.append(style);

      const functionProbe = document.createElement("div");
      functionProbe.className = "css-expect-function-probe";
      document.body.append(functionProbe);

      const mixinProbe = document.createElement("div");
      mixinProbe.className = "css-expect-mixin-probe";
      document.body.append(mixinProbe);

      const functionRules: CssFunctionInfo[] = [];
      const ruleTypes: string[] = [];
      let functionRulesSupported = false;
      let mixinRulesSupported = false;
      let applyRulesSupported = false;

      for (const sheet of Array.from(document.styleSheets)) {
        let rules: CSSRuleList;

        try {
          rules = sheet.cssRules;
        } catch {
          continue;
        }

        for (const rule of Array.from(rules)) {
          const ruleRecord = rule as CSSRule & {
            name?: string;
            returnType?: string;
            getParameters?: () => Array<{
              name?: string;
              type?: string;
              defaultValue?: string | null;
            }>;
          };
          const constructorName = ruleRecord.constructor.name;

          ruleTypes.push(constructorName);

          if (
            constructorName === "CSSFunctionRule" ||
            ruleRecord.name === "--css-expect-function-probe"
          ) {
            functionRulesSupported = true;
            functionRules.push({
              name: ruleRecord.name ?? "",
              returnType: ruleRecord.returnType ?? "",
              parameters: Array.from(ruleRecord.getParameters?.() ?? []).map((parameter) => ({
                name: parameter.name ?? "",
                type: parameter.type ?? "",
                defaultValue: parameter.defaultValue ?? null,
              })),
            });
          }

          if (
            constructorName === "CSSMixinRule" ||
            ruleRecord.name === "--css-expect-mixin-probe"
          ) {
            mixinRulesSupported = true;
          }

          if (rule.cssText.includes("@apply --css-expect-mixin-probe")) {
            applyRulesSupported = true;
          }
        }
      }

      const width = getComputedStyle(functionProbe).width;
      const color = getComputedStyle(mixinProbe).color;

      functionProbe.remove();
      mixinProbe.remove();
      style.remove();

      return {
        functionRules: functionRulesSupported || width === "2px",
        mixinRules: mixinRulesSupported,
        applyRules: applyRulesSupported || color === "rgb(0, 128, 0)",
        cssom: {
          functionRules,
          ruleTypes: Array.from(new Set(ruleTypes)),
        },
      };
    });
  }

  async close() {
    await this.#context.context.close();
    await this.#context.browser.close();
  }

  async expectFunctionEquals(
    name: string,
    args: string[],
    property: string,
    expected: string,
    callSiteProperties: StyleExpectation,
  ): Promise<CssExpectationResult> {
    const actual = await this.computeFunctionValue(
      name,
      args,
      property,
      callSiteProperties,
      expected,
    );

    if (actual.skipped || actual.actual === expected) {
      return {
        ...actual,
        expected,
        passed: !actual.skipped,
      };
    }

    throw new CssExpectError("CSS function expectation failed.", {
      ...(await this.diagnostics({
        expected,
        actual: actual.actual,
        generatedCss: actual.generatedCss,
        functionCall: buildFunctionCall(name, args),
        property,
      })),
    });
  }

  async expectFunctionMatches(
    name: string,
    args: string[],
    property: string,
    predicate: (actual: string) => boolean | Promise<boolean>,
    callSiteProperties: StyleExpectation,
  ): Promise<CssExpectationResult> {
    const actual = await this.computeFunctionValue(name, args, property, callSiteProperties);

    if (actual.skipped) {
      return actual;
    }

    const passed = await predicate(actual.actual);

    if (passed) {
      return {
        ...actual,
        passed: true,
      };
    }

    throw new CssExpectError("CSS function predicate expectation failed.", {
      ...(await this.diagnostics({
        actual: actual.actual,
        generatedCss: actual.generatedCss,
        functionCall: buildFunctionCall(name, args),
        property,
      })),
    });
  }

  async expectMixinStyles(
    name: string,
    args: string[],
    styles: StyleExpectation,
    callSiteProperties: StyleExpectation,
  ): Promise<CssExpectationResult> {
    validateCustomCssName(name, "mixin");

    for (const property of Object.keys(styles)) {
      validateCssPropertyName(property);
    }

    const support = await this.features();

    if (!support.mixinRules || !support.applyRules) {
      const diagnostics = await this.diagnostics({
        generatedCss: this.buildMixinExpectationCss(name, args, callSiteProperties),
      });

      if (this.#context.unsupported === "skip") {
        return {
          actual: "",
          generatedCss: diagnostics.generatedCss ?? "",
          passed: false,
          reason: `Native CSS mixin support is not available in ${this.#context.browserName}.`,
          skipped: true,
        };
      }

      throw new CssExpectUnsupportedError("mixin", false, diagnostics);
    }

    const className = this.nextClassName();
    const generatedCss = this.buildMixinExpectationCss(name, args, callSiteProperties, className);
    const actualStyles = await this.computeStyles(className, generatedCss, Object.keys(styles));

    for (const [property, expected] of Object.entries(styles)) {
      const actual = actualStyles[property] ?? "";

      if (actual !== expected) {
        throw new CssExpectError("CSS mixin style expectation failed.", {
          ...(await this.diagnostics({
            expected,
            actual,
            generatedCss,
            property,
          })),
        });
      }
    }

    return {
      actual: JSON.stringify(actualStyles),
      expected: JSON.stringify(styles),
      generatedCss,
      passed: true,
      skipped: false,
    };
  }

  async computeFunctionValue(
    name: string,
    args: string[],
    property: string,
    callSiteProperties: StyleExpectation,
    expected?: string,
  ): Promise<CssExpectationResult> {
    const support = await this.features();
    const functionCall = buildFunctionCall(name, args);
    const className = this.nextClassName();
    const generatedCss = buildFunctionExpectationCss(
      className,
      functionCall,
      property,
      callSiteProperties,
    );

    if (!support.functionRules) {
      const diagnostics = await this.diagnostics({
        expected,
        functionCall,
        generatedCss,
        property,
      });

      if (this.#context.unsupported === "skip") {
        return {
          actual: "",
          expected,
          generatedCss,
          passed: false,
          reason: `Native CSS custom function support is not available in ${this.#context.browserName}.`,
          skipped: true,
        };
      }

      throw new CssExpectUnsupportedError("function", false, diagnostics);
    }

    const actual = (await this.computeStyles(className, generatedCss, [property]))[property] ?? "";

    return {
      actual,
      expected,
      generatedCss,
      passed: expected === undefined ? false : actual === expected,
      skipped: false,
    };
  }

  buildMixinExpectationCss(
    name: string,
    args: string[],
    callSiteProperties: StyleExpectation,
    className = "css-expect-subject",
  ) {
    const applyCall = buildFunctionCall(name, args);
    return buildStyleRule(className, [
      ...buildStyleDeclarations(callSiteProperties),
      `  @apply ${applyCall};`,
    ]);
  }

  async diagnostics(overrides: Partial<CssExpectDiagnostics> = {}): Promise<CssExpectDiagnostics> {
    return {
      browserName: this.#context.browserName,
      browserVersion: this.#context.browserVersion,
      featureSupport: await this.features(),
      sourceCss: this.#context.sourceCss,
      ...overrides,
    };
  }

  async computeStyles(className: string, generatedCss: string, properties: string[]) {
    return await this.#context.page.evaluate(
      ({ className, generatedCss, properties }) => {
        const style = document.createElement("style");
        style.textContent = generatedCss;
        document.head.append(style);

        const subject = document.createElement("div");
        subject.className = className;
        document.body.append(subject);

        const computed = getComputedStyle(subject);
        const values: Record<string, string> = {};

        for (const property of properties) {
          values[property] = computed.getPropertyValue(property).trim();
        }

        subject.remove();
        style.remove();

        return values;
      },
      { className, generatedCss, properties },
    );
  }

  nextClassName() {
    this.#expectationId += 1;
    return `css-expect-subject-${this.#expectationId}`;
  }
}

class CssFunctionExpectation {
  readonly #runtime: CssExpectRuntime;
  readonly #name: string;
  readonly #args: string[];
  readonly #callSiteProperties: StyleExpectation;
  #property?: string;

  constructor(
    runtime: CssExpectRuntime,
    name: string,
    args: string[],
    callSiteProperties: StyleExpectation = {},
  ) {
    this.#runtime = runtime;
    this.#name = name;
    this.#args = args;
    this.#callSiteProperties = callSiteProperties;
  }

  with(properties: StyleExpectation) {
    return new CssFunctionExpectation(this.#runtime, this.#name, this.#args, {
      ...this.#callSiteProperties,
      ...properties,
    });
  }

  as(property: string) {
    this.#property = property;
    validateCssPropertyName(property);
    return this;
  }

  async equals(expected: string) {
    return await this.#runtime.expectFunctionEquals(
      this.#name,
      this.#args,
      this.requiredProperty(),
      expected,
      this.#callSiteProperties,
    );
  }

  async matches(predicate: (actual: string) => boolean | Promise<boolean>) {
    return await this.#runtime.expectFunctionMatches(
      this.#name,
      this.#args,
      this.requiredProperty(),
      predicate,
      this.#callSiteProperties,
    );
  }

  requiredProperty() {
    if (this.#property === undefined) {
      throw new Error(
        "CSS function expectations require .as(property) before equals() or matches().",
      );
    }

    return this.#property;
  }
}

class CssMixinExpectation {
  readonly #runtime: CssExpectRuntime;
  readonly #name: string;
  readonly #args: string[];
  readonly #callSiteProperties: StyleExpectation;

  constructor(
    runtime: CssExpectRuntime,
    name: string,
    args: string[],
    callSiteProperties: StyleExpectation = {},
  ) {
    this.#runtime = runtime;
    this.#name = name;
    this.#args = args;
    this.#callSiteProperties = callSiteProperties;
  }

  with(properties: StyleExpectation) {
    return new CssMixinExpectation(this.#runtime, this.#name, this.#args, {
      ...this.#callSiteProperties,
      ...properties,
    });
  }

  async styles(styles: StyleExpectation) {
    return await this.#runtime.expectMixinStyles(
      this.#name,
      this.#args,
      styles,
      this.#callSiteProperties,
    );
  }
}

export async function loadCssExpectSource(options: CssExpectOptions) {
  const inlineCss = Array.isArray(options.css) ? options.css.join("\n") : (options.css ?? "");
  const fileCss = await Promise.all(
    (options.files ?? []).map(async (file) => {
      return await readFile(resolve(file), "utf8");
    }),
  );

  return [...fileCss, inlineCss].filter(Boolean).join("\n");
}

function getBrowserType(browserName: CssExpectBrowser): BrowserType {
  switch (browserName) {
    case "chromium":
      return chromium;
    case "firefox":
      return firefox;
    case "webkit":
      return webkit;
  }
}

function buildStyleDeclarations(properties: StyleExpectation) {
  return Object.entries(properties).map(([property, value]) => {
    return buildStyleDeclaration(property, value);
  });
}

function buildStyleDeclaration(property: string, value: string) {
  validateCssPropertyName(property);
  return `  ${property}: ${value};`;
}

function buildStyleRule(className: string, declarations: string[]) {
  return `.${className} {\n${declarations.join("\n")}\n}`;
}

function validateCustomCssName(name: string, kind: "function" | "mixin") {
  if (!/^--[a-zA-Z0-9_-]+$/.test(name)) {
    throw new Error(`CSS ${kind} names must be custom dashed identifiers such as "--example".`);
  }
}

function validateCssPropertyName(name: string) {
  if (!/^-{0,2}[a-zA-Z_][a-zA-Z0-9_-]*$/.test(name)) {
    throw new Error(`Invalid CSS property name: ${name}`);
  }
}

function formatDiagnostics(diagnostics: CssExpectDiagnostics) {
  const lines = [
    `Browser: ${diagnostics.browserName} ${diagnostics.browserVersion}`,
    `Feature support: ${JSON.stringify(diagnostics.featureSupport)}`,
  ];

  if (diagnostics.functionCall !== undefined) {
    lines.push(`Function call: ${diagnostics.functionCall}`);
  }

  if (diagnostics.property !== undefined) {
    lines.push(`Property: ${diagnostics.property}`);
  }

  if (diagnostics.expected !== undefined) {
    lines.push(`Expected: ${diagnostics.expected}`);
  }

  if (diagnostics.actual !== undefined) {
    lines.push(`Actual: ${diagnostics.actual}`);
  }

  if (diagnostics.generatedCss !== undefined) {
    lines.push(`Generated CSS:\n${diagnostics.generatedCss}`);
  }

  return lines.join("\n");
}
