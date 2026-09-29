import { readFileSync } from "node:fs";

/** A file next to the tests or the example, read relative to this directory. */
export const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
export const readJson = (path) => JSON.parse(read(path));

/** A fresh copy each call, so a test can change it freely. */
export const shop = () => readJson("../example/shop.json");
