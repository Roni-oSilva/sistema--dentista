import next from "eslint-config-next";

const config = [
  ...next,
  // links de download de arquivos (/api/...) usam <a> de propósito
  { rules: { "@next/next/no-html-link-for-pages": "off" } },
  { ignores: [".next/**", "node_modules/**", "next-env.d.ts"] },
];

export default config;
