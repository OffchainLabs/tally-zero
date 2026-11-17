import { User } from "lucide-react";

/** A 24px profile picture, or a generic person icon when the address has none. */
export function AddressAvatar({ picture }: { picture: string | null }) {
  if (picture) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={picture}
        alt=""
        className="h-6 w-6 shrink-0 rounded-full object-cover ring-1 ring-border"
        loading="lazy"
      />
    );
  }
  return (
    <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted ring-1 ring-border">
      <User className="h-3 w-3 text-muted-foreground" />
    </span>
  );
}
