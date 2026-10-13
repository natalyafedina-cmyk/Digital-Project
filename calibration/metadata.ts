import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
export function metadata() {
  let evaluatedCommit: string | null = null;
  try {
    let gitDir = resolve(".git");
    if (statSync(gitDir).isFile())
      gitDir = resolve(
        readFileSync(gitDir, "utf8")
          .trim()
          .replace(/^gitdir:\s*/, ""),
      );
    const head = readFileSync(join(gitDir, "HEAD"), "utf8").trim();
    if (/^[0-9a-f]{40}$/.test(head)) evaluatedCommit = head;
    else {
      const ref = head.replace(/^ref:\s*/, "");
      if (ref.startsWith("refs/") && !ref.includes("..")) {
        const file = join(gitDir, ref);
        evaluatedCommit = existsSync(file)
          ? readFileSync(file, "utf8").trim()
          : readFileSync(join(gitDir, "packed-refs"), "utf8")
              .split("\n")
              .find((line) => line.endsWith(" " + ref))
              ?.split(" ")[0] || null;
      }
    }
  } catch {
    /* Fingerprint remains available even without Git metadata. */
  }
  const hash = createHash("sha256");
  const walk = (directory: string) => {
    for (const name of readdirSync(directory).sort()) {
      const path = join(directory, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (/\.(?:ts|tsx|json|css)$/.test(path)) {
        hash.update(path);
        hash.update(readFileSync(path));
      }
    }
  };
  walk("app");
  walk("lib");
  return { evaluatedCommit, runtimeFingerprint: hash.digest("hex") };
}
