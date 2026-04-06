import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

function patchWindowsNetUseExec() {
  const require = createRequire(import.meta.url);
  const childProcess = require("node:child_process");
  const originalExec = childProcess.exec.bind(childProcess);

  childProcess.exec = (command, options, callback) => {
    let resolvedOptions = options;
    let resolvedCallback = callback;

    if (typeof resolvedOptions === "function") {
      resolvedCallback = resolvedOptions;
      resolvedOptions = undefined;
    }

    if (String(command || "").trim().toLowerCase() === "net use") {
      queueMicrotask(() => {
        if (typeof resolvedCallback === "function") {
          resolvedCallback(null, "", "");
        }
      });

      return {
        kill() {
          return true;
        },
        on() {
          return this;
        },
        once() {
          return this;
        },
        removeListener() {
          return this;
        },
        unref() {
          return this;
        },
      };
    }

    return originalExec(command, resolvedOptions, resolvedCallback);
  };
}

function toBuffer(source) {
  if (typeof source === "string") {
    return Buffer.from(source, "utf8");
  }

  if (source instanceof Uint8Array) {
    return Buffer.from(source);
  }

  return Buffer.from(String(source ?? ""), "utf8");
}

async function writeBundleOutput(distDir, bundleResult) {
  const bundles = Array.isArray(bundleResult) ? bundleResult : [bundleResult];

  for (const bundle of bundles) {
    if (!bundle || !Array.isArray(bundle.output)) {
      continue;
    }

    for (const output of bundle.output) {
      const filePath = path.join(distDir, output.fileName);
      await mkdir(path.dirname(filePath), { recursive: true });

      if (output.type === "asset") {
        await writeFile(filePath, toBuffer(output.source));
        continue;
      }

      await writeFile(filePath, output.code, "utf8");
      if (output.map) {
        await writeFile(`${filePath}.map`, output.map.toString(), "utf8");
      }
    }
  }
}

try {
  patchWindowsNetUseExec();

  const react = (await import("@vitejs/plugin-react")).default;
  const { build } = await import("vite");

  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const projectRoot = path.resolve(scriptDir, "..");
  const distDir = path.join(projectRoot, "dist");

  const bundleResult = await build({
    configFile: false,
    plugins: [react()],
    build: {
      write: false,
      reportCompressedSize: false,
    },
  });

  await rm(distDir, { recursive: true, force: true });
  await mkdir(distDir, { recursive: true });
  await writeBundleOutput(distDir, bundleResult);
} catch (error) {
  console.error(error);
  process.exit(1);
}
