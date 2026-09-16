import { readFile, writeFile } from "node:fs/promises";

const root = new URL("./", import.meta.url);
const files = [
  ["/robots.txt", "text/plain; charset=utf-8", false],
  ["/static/content-blocked.html", "text/html; charset=utf-8", false],
  ["/index.html", "text/html; charset=utf-8", false, true],
  ["/favicon.ico", "image/x-icon", true, true],
];
const assets = {};
for (const [path, type, base64, optional] of files) {
  try {
    const bytes = await readFile(new URL("index" + path, root));
    assets[path] = { type, base64, body: bytes.toString(base64 ? "base64" : "utf8") };
  } catch (error) {
    if (!optional || error.code !== "ENOENT") throw error;
  }
}
const file = new URL("edge-function.js", root);
const source = await readFile(file, "utf8");
const start = "// BEGIN GENERATED LOCAL ASSETS";
const end = "// END GENERATED LOCAL ASSETS";
const first = source.indexOf(start);
const last = source.indexOf(end, first);
if (first < 0 || last < 0) throw new Error("Missing asset markers");
const data = JSON.stringify(assets, null, 2).replace(/[\u007f-\uffff]/g, (char) =>
  "\\u" + char.charCodeAt(0).toString(16).padStart(4, "0"));
const output = source.slice(0, first) + start + "\nconst LOCAL_ASSETS = " + data + ";\n" + source.slice(last);
if (process.argv.includes("--check")) {
  if (output !== source) throw new Error("Embedded assets are stale; run build-edge-assets.mjs");
} else {
  await writeFile(file, output);
}
console.log(`Embedded ${Object.keys(assets).length} local files (${Buffer.byteLength(output)} bytes total).`);
