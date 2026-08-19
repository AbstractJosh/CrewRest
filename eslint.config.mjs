import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    /*
     * Design handoffs are vendored references, not source: the bundles under design/ ship their
     * own runtime so the prototype opens in a browser, and its README says not to port it. Linting
     * someone else's prototype only reports problems nobody is going to fix.
     */
    "design/**",
  ]),
]);

export default eslintConfig;
