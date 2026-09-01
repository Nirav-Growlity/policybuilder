import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import type { PolicyType } from "../types";
import { buildTemplateContext } from "./template-context";

const policyTypes: PolicyType[] = [
  "environmental",
  "labour-human-rights",
  "living-wage",
  "ethics",
  "sustainable-procurement",
];

function withSeedDirectory(run: (seedDirectory: string) => void): void {
  const seedDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "policy-context-"));
  try {
    policyTypes.forEach((policyType, index) => {
      fs.writeFileSync(path.join(seedDirectory, `${index}.json`), JSON.stringify({
        name: `${policyType} TEMPLATE SENTINEL`,
        policy: {
          policyType,
          declaration: {
            declaration: `${policyType} DECLARATION SENTINEL`,
            scope: `${policyType} SCOPE SENTINEL`,
          },
          focusAreas: [`${policyType} FOCUS SENTINEL`],
          qualitative: {
            "Energy and emissions": [`${policyType} ENERGY OBJECTIVE`],
            "Water stewardship": [`${policyType} WATER OBJECTIVE`],
          },
          monitoring: `${policyType} MONITORING SENTINEL`,
        },
      }));
    });
    run(seedDirectory);
  } finally {
    fs.rmSync(seedDirectory, { recursive: true, force: true });
  }
}

test("every policy type receives only templates tagged for that policy", () => {
  withSeedDirectory((seedDirectory) => {
    for (const policyType of policyTypes) {
      const context = buildTemplateContext({ policyType, requestType: "declaration", seedDirectory });
      assert.match(context, new RegExp(`${policyType} TEMPLATE SENTINEL`));
      for (const otherType of policyTypes.filter((type) => type !== policyType)) {
        assert.doesNotMatch(context, new RegExp(`${otherType} TEMPLATE SENTINEL`));
      }
    }
  });
});

test("context contains only the requested section", () => {
  withSeedDirectory((seedDirectory) => {
    const context = buildTemplateContext({
      policyType: "environmental",
      requestType: "scope",
      seedDirectory,
    });
    assert.match(context, /environmental SCOPE SENTINEL/);
    assert.doesNotMatch(context, /environmental DECLARATION SENTINEL/);
    assert.doesNotMatch(context, /environmental MONITORING SENTINEL/);
  });
});

test("area-based requests select the most relevant example and stay within the context budget", () => {
  withSeedDirectory((seedDirectory) => {
    const context = buildTemplateContext({
      policyType: "environmental",
      requestType: "qualitative",
      areaName: "Water stewardship",
      seedDirectory,
    });
    assert.match(context, /environmental WATER OBJECTIVE/);
    assert.doesNotMatch(context, /environmental ENERGY OBJECTIVE/);
    assert.ok(context.length <= 12_000);
  });
});

