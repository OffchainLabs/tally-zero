import { type StepType } from "@/types/steps";
import Image from "next/image";

import Step from "@components/section/how-it-works/Step";

function MobileStepConnector() {
  return (
    <div className="flex justify-center py-6">
      <div className="flex flex-col items-center gap-1">
        <div className="h-4 w-0.5 bg-gradient-to-b from-violet-400 to-violet-500" />
        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-violet-500 shadow-lg shadow-violet-500/30">
          <svg
            className="h-3 w-3 text-white"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={3}
              d="M19 14l-7 7m0 0l-7-7m7 7V3"
            />
          </svg>
        </div>
        <div className="h-4 w-0.5 bg-gradient-to-b from-violet-500 to-violet-400" />
      </div>
    </div>
  );
}

export default function HowItWorksMobile(steps: StepType[]) {
  const stepsArray = Object.values(steps);

  return (
    <div className="-mx-4 mt-16 flex flex-col overflow-hidden px-4 sm:-mx-6 sm:px-6 lg:hidden">
      {stepsArray.map((step, index) => (
        <div key={step.name}>
          <Step
            step={step}
            stepNumber={index + 1}
            className="mx-auto max-w-2xl"
            isActive
          />

          {/* Image container with glass styling */}
          <div className="glass relative mx-auto mt-8 max-w-2xl overflow-hidden rounded-2xl p-4">
            <div className="overflow-hidden rounded-xl glass-subtle bg-violet-500/20 dark:bg-violet-500/25 shadow-lg shadow-slate-900/5 ring-1 ring-violet-500/20 dark:ring-violet-500/25">
              <Image
                className="w-full"
                src={step.image}
                alt={`Step ${index + 1}: ${step.name}`}
                width={600}
                height={400}
                sizes="(max-width: 768px) 100vw, 672px"
              />
            </div>
          </div>

          {/* Connector between steps */}
          {index < stepsArray.length - 1 && <MobileStepConnector />}
        </div>
      ))}
    </div>
  );
}
