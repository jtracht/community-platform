import { mkdir, copyFile } from "node:fs/promises";
await mkdir("apps/public/vendor", { recursive: true });
await copyFile(
  "node_modules/motion/dist/motion.js",
  "apps/public/vendor/motion.js",
);
await copyFile(
  "node_modules/motion/LICENSE.md",
  "apps/public/vendor/MOTION-LICENSE.md",
);
