import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

type AvatarManifestEntry = {
  file: string | null;
  addresses: string[];
  ok: boolean;
};

type AvatarManifest = {
  entries: AvatarManifestEntry[];
};

type Options = {
  concurrency: number;
  dryRun: boolean;
  prefix: string;
};

const rootDir = process.cwd();
const manifestPath = path.join(
  rootDir,
  "public",
  "tally-data",
  "avatar-manifest.json"
);
const avatarMapPath = path.join(rootDir, "data", "avatar-map.json");
const DEFAULT_PREFIX = "governance-data/avatars";
const CACHE_CONTROL_MAX_AGE = "31536000";
const DEFAULT_CONCURRENCY = 16;

function parseArgs(argv: string[]): Options {
  const options: Options = {
    concurrency: DEFAULT_CONCURRENCY,
    dryRun: false,
    prefix: DEFAULT_PREFIX,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--dry-run") {
      options.dryRun = true;
    } else if (arg === "--prefix") {
      options.prefix = argv[++index].replace(/^\/+|\/+$/g, "");
    } else if (arg === "--concurrency") {
      options.concurrency = Number(argv[++index]);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (
    !Number.isInteger(options.concurrency) ||
    options.concurrency < 1 ||
    options.concurrency > 64
  ) {
    throw new Error("--concurrency must be an integer from 1 to 64");
  }

  return options;
}

function normalizeAddress(address: string): string {
  return address.toLowerCase();
}

function parseBlobUrl(output: string): string {
  const match = output.match(/https:\/\/\S+\.blob\.vercel-storage\.com\/\S+/);
  if (!match) {
    throw new Error(`Could not find uploaded Blob URL in output: ${output}`);
  }
  return match[0].trim();
}

async function uploadAvatar({
  filePath,
  pathname,
  dryRun,
}: {
  filePath: string;
  pathname: string;
  dryRun: boolean;
}): Promise<string> {
  if (dryRun) {
    return `https://example.invalid/${pathname}`;
  }

  const args = [
    "blob",
    "put",
    path.relative(rootDir, filePath),
    "--scope",
    "offchain-labs",
    "--pathname",
    pathname,
    "--content-type",
    "image/jpeg",
    "--cache-control-max-age",
    CACHE_CONTROL_MAX_AGE,
    "--force",
  ];

  const output = await new Promise<string>((resolve, reject) => {
    const child = spawn("vercel", args, {
      cwd: rootDir,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve(`${stdout}\n${stderr}`);
      } else {
        reject(
          new Error(
            `vercel ${args.join(" ")} exited with ${code}\n${stdout}\n${stderr}`
          )
        );
      }
    });
  });

  return parseBlobUrl(output);
}

async function mapLimit<T, U>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<U>
): Promise<U[]> {
  const results: U[] = [];
  let nextIndex = 0;

  await Promise.all(
    Array.from({ length: limit }, async () => {
      while (nextIndex < items.length) {
        const index = nextIndex;
        nextIndex += 1;
        results[index] = await fn(items[index], index);
      }
    })
  );

  return results;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const manifest = JSON.parse(
    fs.readFileSync(manifestPath, "utf8")
  ) as AvatarManifest;
  const uploads: Array<{
    addressLower: string;
    filePath: string;
    pathname: string;
  }> = [];

  for (const entry of manifest.entries) {
    if (!entry.ok || !entry.file) continue;

    const filePath = path.join(rootDir, "public", "tally-data", entry.file);
    if (!fs.existsSync(filePath)) {
      throw new Error(
        `Missing avatar file: ${path.relative(rootDir, filePath)}`
      );
    }

    for (const address of entry.addresses) {
      const addressLower = normalizeAddress(address);
      uploads.push({
        addressLower,
        filePath,
        pathname: `${options.prefix}/${addressLower}.jpg`,
      });
    }
  }

  const avatarMap: Record<string, string> = {};
  await mapLimit(uploads, options.concurrency, async (upload, index) => {
    avatarMap[upload.addressLower] = await uploadAvatar({
      filePath: upload.filePath,
      pathname: upload.pathname,
      dryRun: options.dryRun,
    });
    const uploadedCount = index + 1;
    if (uploadedCount % 250 === 0 || uploadedCount === uploads.length) {
      console.log(`Uploaded ${uploadedCount}/${uploads.length} avatars`);
    }
  });

  const sortedAvatarMap = Object.fromEntries(
    Object.entries(avatarMap).sort(([a], [b]) => a.localeCompare(b))
  );
  fs.writeFileSync(
    avatarMapPath,
    `${JSON.stringify(sortedAvatarMap, null, 2)}\n`,
    "utf8"
  );

  console.log(
    JSON.stringify(
      {
        avatarMap: path.relative(rootDir, avatarMapPath),
        avatars: Object.keys(sortedAvatarMap).length,
        concurrency: options.concurrency,
        prefix: options.prefix,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
