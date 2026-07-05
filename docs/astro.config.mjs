import { defineConfig } from "astro/config";

const site = process.env.SITE_URL ?? "http://localhost:4321";
const base = process.env.BASE_PATH ?? "/";

export default defineConfig({
  site,
  base,
  output: "static",
  publicDir: "./assets",
  srcDir: "./src",
  outDir: "./dist",
  trailingSlash: "always",
});
