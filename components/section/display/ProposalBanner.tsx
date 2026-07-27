import Image from "next/image";

/**
 * Page banner from the Figma frame "Proposals / Option w/ Banner and Stats"
 * (node 405:8610): a glass panel over a clipped starfield, with a blue glow
 * bleeding in from the left and the ballot-box illustration on the right.
 *
 * From lg up it shares a row with the stat cards, so it drops its fixed height
 * and stretches to whatever that grid row is. See `HomeView`.
 */
export default function ProposalBanner() {
  return (
    <section
      aria-labelledby="proposal-banner-heading"
      className="relative isolate h-[140px] overflow-hidden rounded-2xl bg-white/[0.05] lg:h-full lg:min-h-[140px]"
    >
      {/* Starfield */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-cover bg-center bg-no-repeat"
        style={{ backgroundImage: "url(/proposals/stars-bg.svg)" }}
      />

      {/* Blue glow bleeding in from the left edge */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -left-[45%] top-1/2 aspect-square w-[70%] -translate-y-1/2 rotate-180 bg-contain bg-center bg-no-repeat sm:-left-[30%] sm:w-[46%] lg:-left-[18%] lg:w-[43%]"
        style={{ backgroundImage: "url(/proposals/banner-glow.svg)" }}
      />

      {/* Ballot-box illustration, anchored right and clipped by the banner.
          It sits under the headline on narrow screens, beside it from sm up. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute bottom-0 right-0 size-[96px] mix-blend-screen sm:bottom-auto sm:top-[2%] sm:size-[150px]"
      >
        <Image
          src="/proposals/banner-illustration.png"
          alt=""
          fill
          priority
          sizes="(max-width: 640px) 96px, 150px"
          className="object-contain"
        />
      </div>

      <h1
        id="proposal-banner-heading"
        className="absolute inset-x-0 top-[32%] -translate-y-1/2 px-6 text-center text-3xl font-bold uppercase leading-[0.8] tracking-tight text-[#e8f0f8] sm:top-1/2 sm:text-4xl lg:text-5xl"
      >
        Proposals
      </h1>
    </section>
  );
}
