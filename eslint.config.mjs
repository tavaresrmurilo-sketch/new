import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = [
  { ignores: [".next*/**", "node_modules/**", "next-env.d.ts", "coverage/**", "playwright-report/**", "test-results/**", "storage/**"] },
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      // Imagens de eventos já são otimizadas no upload (sharp → WebP em variantes); usamos <img> com srcset.
      "@next/next/no-img-element": "off",
    },
  },
];

export default eslintConfig;
