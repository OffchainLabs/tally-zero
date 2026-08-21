import { indexerFetch } from "@/lib/indexer/server";
import { deleteAvatar, putAvatar } from "@/lib/storage";

export type AvatarCommit =
  | { kind: "committed"; url: string }
  | { kind: "rejected"; status: number }
  | { kind: "unreachable"; error: unknown };

type CommitArgs = {
  address: string;
  cookie: string;
  bytes: Uint8Array;
  contentType: string;
  /** The profile's current `picture`, read before we overwrite it. */
  previousPicture: string | null;
};

/**
 * Stage the image, point the profile at it, then collect whichever copy the
 * outcome made garbage — so a caller never sees a successful upload while the
 * profile still points somewhere else.
 */
export async function commitAvatar({
  address,
  cookie,
  bytes,
  contentType,
  previousPicture,
}: CommitArgs): Promise<AvatarCommit> {
  const { url } = await putAvatar(address, bytes, contentType);

  let update: Response;
  try {
    update = await indexerFetch("/api/me/profile", {
      method: "PATCH",
      cookie,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ picture: url }),
    });
  } catch (error) {
    await collect(address, { garbage: url, live: previousPicture });
    return { kind: "unreachable", error };
  }

  // On success the previous image is garbage; on rejection the one just staged
  // is. Re-uploading the identical file yields the same content-addressed URL,
  // and `collect` leaves that alone rather than deleting the live image.
  const committed = update.ok;
  await collect(address, {
    garbage: committed ? previousPicture : url,
    live: committed ? url : previousPicture,
  });

  return committed
    ? { kind: "committed", url }
    : { kind: "rejected", status: update.status };
}

async function collect(
  address: string,
  { garbage, live }: { garbage: string | null; live: string | null }
): Promise<void> {
  if (!garbage || garbage === live) return;
  try {
    await deleteAvatar(address, garbage);
  } catch (error) {
    console.error("Failed to delete a superseded avatar.", error);
  }
}
