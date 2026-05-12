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
  pathnamesByEnv: Record<string, string>;
  environments: string[];
  envName: string;
  scope: string;
  sourcePrimary?: string;
};

const DEFAULT_PATHNAMES: Record<string, string> = {
  production: "governance-data/delegates.sqlite",
  preview: "governance-data/delegates-preview.sqlite",
  development: "governance-data/delegates-development.sqlite",
};

const rootDir = process.cwd();
const dbPath = path.join(rootDir, "public", "tally-data", "db.sqlite");
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
    pathnamesByEnv: {},
    environments: ["preview", "production", "development"],
    envName: "GOVERNANCE_DATA_SQLITE_BLOB_URL",
    scope: "offchain-labs",
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
    } else if (arg.startsWith("--pathname-")) {
      const env = arg.slice("--pathname-".length);
      options.pathnamesByEnv[env] = argv[++index];
    } else if (arg === "--env") {
      options.environments = argv[++index].split(",").map((env) => env.trim());
    } else if (arg === "--env-name") {
      options.envName = argv[++index];
    } else if (arg === "--scope") {
      options.scope = argv[++index];
    } else if (arg === "--source-primary") {
      options.sourcePrimary = argv[++index];
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

function resolvePathnameForEnv(env: string, options: Options): string {
  if (options.pathname) return options.pathname;
  const explicit = options.pathnamesByEnv[env];
  if (explicit) return explicit;
  const fallback = DEFAULT_PATHNAMES[env];
  if (fallback) return fallback;
  throw new Error(
    `No pathname configured for env "${env}". Pass --pathname-${env} <path>.`
  );
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

  return `${result.stdout}\n${result.stderr}`;
}

function readManifest(): Manifest {
  return JSON.parse(fs.readFileSync(manifestPath, "utf8")) as Manifest;
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
  if (!pattern.test(original)) {
    throw new Error(
      `No match found while updating ${path.relative(rootDir, filePath)}`
    );
  }
  const next = original.replace(pattern, replacement);
  if (next !== original) fs.writeFileSync(filePath, next);
}

function updateSourceConstants(
  blobUrl: string | null,
  sizeBytes: number,
  dryRun: boolean
) {
  const updates = [
    path.relative(rootDir, routePath),
    path.relative(rootDir, routeTestPath),
    path.relative(rootDir, sqliteClientPath),
  ];

  if (blobUrl) {
    console.log(
      `Updating source constants (URL + size): ${updates.join(", ")}`
    );
  } else {
    console.log(
      `Updating source constants (size only, DEFAULT_BLOB_URL preserved): ${updates.join(", ")}`
    );
  }
  if (dryRun) return;

  if (blobUrl) {
    replaceOrThrow(
      routePath,
      /const DEFAULT_BLOB_URL =\n  "https:\/\/[^"]+";/,
      `const DEFAULT_BLOB_URL =\n  "${blobUrl}";`
    );
  }
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
  uploads: Array<{ env: string; blobUrl: string }>,
  scope: string,
  dryRun: boolean
) {
  for (const { env: environment, blobUrl } of uploads) {
    if (dryRun) {
      console.log(
        `$ printf ${blobUrl} | vercel env update ${envName} ${environment} --yes --scope ${scope}`
      );
      continue;
    }
    const update = spawnSync(
      "vercel",
      ["env", "update", envName, environment, "--yes", "--scope", scope],
      {
        cwd: rootDir,
        encoding: "utf8",
        input: blobUrl,
      }
    );
    if (update.stdout) process.stdout.write(update.stdout);
    if (update.stderr) process.stderr.write(update.stderr);
    if (update.error) throw update.error;
    if (update.status === 0) continue;

    run("vercel", ["env", "add", envName, environment, "--scope", scope], {
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
  const uploads: Array<{ env: string; pathname: string; blobUrl: string }> = [];

  for (const env of options.environments) {
    const pathname = resolvePathnameForEnv(env, options);
    const blobArgs = [
      "blob",
      "put",
      path.relative(rootDir, dbPath),
      "--scope",
      options.scope,
      "--pathname",
      pathname,
      "--content-type",
      "application/octet-stream",
      "--cache-control-max-age",
      "31536000",
      "--access",
      "public",
      "--allow-overwrite",
      "true",
    ];

    let blobUrl = `https://example.invalid/${pathname}`;
    if (options.dryRun) {
      console.log(`# upload for env=${env}`);
      console.log(`$ vercel ${blobArgs.join(" ")}`);
    } else {
      blobUrl = parseBlobUrl(run("vercel", blobArgs));
    }
    uploads.push({ env, pathname, blobUrl });
  }

  const productionUpload = uploads.find(
    (upload) => upload.env === "production"
  );
  const explicitPrimary = options.sourcePrimary
    ? uploads.find((upload) => upload.env === options.sourcePrimary)
    : undefined;
  if (options.sourcePrimary && !explicitPrimary) {
    throw new Error(
      `--source-primary "${options.sourcePrimary}" was not in the deployed envs.`
    );
  }

  // DEFAULT_BLOB_URL is the production fallback baked into source. Only rewrite
  // it when production is part of this deploy (or the caller explicitly opts in
  // via --source-primary). Preview-only deploys must not move it.
  const urlSource = explicitPrimary ?? productionUpload ?? null;
  updateSourceConstants(
    urlSource ? urlSource.blobUrl : null,
    manifest.sizeBytes,
    options.dryRun
  );

  if (!options.skipEnv) {
    updateVercelEnv(options.envName, uploads, options.scope, options.dryRun);
  }

  console.log(
    JSON.stringify(
      {
        uploads,
        defaultBlobUrlUpdatedFromEnv: urlSource?.env ?? null,
        sizeBytes: manifest.sizeBytes,
        envName: options.skipEnv ? null : options.envName,
        environments: options.skipEnv ? [] : options.environments,
        scope: options.scope,
      },
      null,
      2
    )
  );
}

main();
