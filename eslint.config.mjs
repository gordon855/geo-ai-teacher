import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // The inherited browser harnesses deliberately use CommonJS and run as .cjs.
  { files: ["tests/**/*.cjs"], rules: { "@typescript-eslint/no-require-imports": "off" } },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    ".private-originals/**",
    ".audit/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "public/vendor/**", // Unmodified third-party release files.
  ]),
]);

export default eslintConfig;
