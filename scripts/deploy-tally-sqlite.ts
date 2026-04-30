import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

type Manifest = {
  generatedAt: string;
  sizeBytes: number;
};

type Options = {
  dryRun: boolean;
  skipBuild: boolean;
  skipEnv: boolean;
  pathname?: string;
  environments: string[];
  envName: string;
};

const rootDir = process.cwd();
const dbPath = path.join(rootDir, "public", "tally-data", "tally-zero.sqlite");
const manifestPath = path.join(
  rootDir,
  "public",
  "tally-data",
  "manifest.json"
);
const routePath = path.join(
  rootDir,
  "app",
  "tally-data",
  "tally-zero.sqlite",
  "route.ts"
);
const routeTestPath = path.join(
  rootDir,
  "app",
  "tally-data",
  "tally-zero.sqlite",
  "route.test.ts"
);
const sqliteClientPath = path.join(rootDir, "lib", "tally-data", "sqlite.ts");

function parseArgs(argv: string[]): Options {
  const options: Options = {
    dryRun: false,
    skipBuild: false,
    skipEnv: false,
    environments: ["preview", "production", "development"],
    envName: "NEXT_PUBLIC_TALLY_DATA_SQLITE_URL",
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--") {
      continue;
    } else if (arg === "--dry-run") {
      options.dryRun = true;
    } else if (arg === "--skip-build") {
      options.skipBuild = true;
    } else if (arg === "--skip-env") {
      options.skipEnv = true;
    } else if (arg === "--pathname") {
      options.pathname = argv[++index];
    } else if (arg === "--env") {
      options.environments = argv[++index].split(",").map((env) => env.trim());
    } else if (arg === "--env-name") {
      options.envName = argv[++index];
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

function run(command: string, args: string[], options?: { input?: string }) {
  const printable = [command, ...args].join(" ");
  console.log(`$ ${printable}`);

  const result = spawnSync(command, args, {
    cwd: rootDir,
    encoding: "utf8",
    input: options?.input,
  });

  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${printable} exited with status ${result.status}`);
  }

  return result.stdout;
}

function readManifest(): Manifest {
  return JSON.parse(fs.readFileSync(manifestPath, "utf8")) as Manifest;
}

function defaultPathname(manifest: Manifest): string {
  const generatedAt = new Date(manifest.generatedAt)
    .toISOString()
    .replaceAll("-", "")
    .replaceAll(":", "")
    .replace(/\.\d{3}Z$/, "Z");
  return `tally-data/tally-zero-${generatedAt}-${manifest.sizeBytes}.sqlite`;
}

function parseBlobUrl(output: string): string {
  const match = output.match(/https:\/\/\S+\.blob\.vercel-storage\.com\/\S+/);
  if (!match) {
    throw new Error("Could not find uploaded Blob URL in vercel output.");
  }
  return match[0].trim();
}

function replaceOrThrow(
  filePath: string,
  pattern: RegExp,
  replacement: string
) {
  const original = fs.readFileSync(filePath, "utf8");
  const next = original.replace(pattern, replacement);
  if (next === original) {
    throw new Error(
      `No match found while updating ${path.relative(rootDir, filePath)}`
    );
  }
  fs.writeFileSync(filePath, next);
}

function updateSourceConstants(
  blobUrl: string,
  sizeBytes: number,
  dryRun: boolean
) {
  const updates = [
    path.relative(rootDir, routePath),
    path.relative(rootDir, routeTestPath),
    path.relative(rootDir, sqliteClientPath),
  ];

  console.log(`Updating source constants: ${updates.join(", ")}`);
  if (dryRun) return;

  replaceOrThrow(
    routePath,
    /const DEFAULT_BLOB_URL =\n  "https:\/\/[^"]+";/,
    `const DEFAULT_BLOB_URL =\n  "${blobUrl}";`
  );
  replaceOrThrow(
    routePath,
    /const DB_SIZE_BYTES = \d+;/,
    `const DB_SIZE_BYTES = ${sizeBytes};`
  );
  replaceOrThrow(
    routeTestPath,
    /const DB_SIZE_BYTES = \d+;/,
    `const DB_SIZE_BYTES = ${sizeBytes};`
  );
  replaceOrThrow(
    sqliteClientPath,
    /const DEFAULT_DB_SIZE_BYTES = \d+;/,
    `const DEFAULT_DB_SIZE_BYTES = ${sizeBytes};`
  );
}

function updateVercelEnv(
  envName: string,
  environments: string[],
  blobUrl: string,
  dryRun: boolean
) {
  for (const environment of environments) {
    if (dryRun) {
      console.log(
        `$ printf <blob-url> | vercel env update ${envName} ${environment} --yes`
      );
      continue;
    }
    run("vercel", ["env", "update", envName, environment, "--yes"], {
      input: blobUrl,
    });
  }
}

function main() {
  const options = parseArgs(process.argv.slice(2));

  run("vercel", ["--version"]);

  if (!options.skipBuild) {
    if (options.dryRun) {
      console.log("$ pnpm sqlite:build");
    } else {
      run("pnpm", ["sqlite:build"]);
    }
  }

  if (!fs.existsSync(dbPath)) {
    throw new Error(
      `SQLite database not found: ${path.relative(rootDir, dbPath)}`
    );
  }
  if (!fs.existsSync(manifestPath)) {
    throw new Error(
      `SQLite manifest not found: ${path.relative(rootDir, manifestPath)}`
    );
  }

  const manifest = readManifest();
  const pathname = options.pathname ?? defaultPathname(manifest);
  const blobArgs = [
    "blob",
    "put",
    path.relative(rootDir, dbPath),
    "--pathname",
    pathname,
    "--content-type",
    "application/octet-stream",
    "--cache-control-max-age",
    "31536000",
    "--force",
  ];

  let blobUrl = `https://example.invalid/${pathname}`;
  if (options.dryRun) {
    console.log(`$ vercel ${blobArgs.join(" ")}`);
  } else {
    blobUrl = parseBlobUrl(run("vercel", blobArgs));
  }

  updateSourceConstants(blobUrl, manifest.sizeBytes, options.dryRun);
  if (!options.skipEnv) {
    updateVercelEnv(
      options.envName,
      options.environments,
      blobUrl,
      options.dryRun
    );
  }

  console.log(
    JSON.stringify(
      {
        blobUrl,
        pathname,
        sizeBytes: manifest.sizeBytes,
        envName: options.skipEnv ? null : options.envName,
        environments: options.skipEnv ? [] : options.environments,
      },
      null,
      2
    )
  );
}

main();
