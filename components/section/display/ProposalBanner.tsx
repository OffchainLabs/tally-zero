import Image from "next/image";

/**
 * Page banner from the Figma frame "Proposals / Option w/ Banner and Stats"
 * (node 405:8610): a glass panel over a clipped starfield, with a blue glow
 * bleeding in from the left and the ballot-box illustration on the right.
 */
export default function ProposalBanner() {
  return (
    <section
      aria-labelledby="proposal-banner-heading"
      className="relative isolate h-[200px] overflow-hidden rounded-2xl bg-white/[0.05]"
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
        className="pointer-events-none absolute bottom-0 right-0 size-[120px] mix-blend-screen sm:bottom-auto sm:top-[3%] sm:size-[220px]"
      >
        <Image
          src="/proposals/banner-illustration.png"
          alt=""
          fill
          priority
          sizes="(max-width: 640px) 120px, (max-width: 768px) 160px, (max-width: 1024px) 190px, (max-width: 1280px) 240px, 320px"
          className="object-contain"
        />
      </div>

      <h1
        id="proposal-banner-heading"
        className="absolute inset-x-0 top-[30%] -translate-y-1/2 px-6 text-center text-3xl font-bold uppercase leading-[0.8] tracking-tight text-[#e8f0f8] sm:top-1/2 sm:text-4xl md:text-5xl lg:text-[64px] xl:text-[80px]"
      >
        Proposals
      </h1>
    </section>
  );
}
