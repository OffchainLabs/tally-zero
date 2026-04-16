import clsx from "clsx";
import Image from "next/image";

import { type StepType } from "@/types/steps";
import { Tab, TabGroup, TabList, TabPanel, TabPanels } from "@headlessui/react";

import Step from "@components/section/how-it-works/Step";

function StepConnector({ isActive }: { isActive: boolean }) {
  return (
    <div className="absolute top-1/2 -right-4 z-10 flex h-8 w-8 -translate-y-1/2 items-center justify-center">
      <div
        className={clsx(
          "flex h-6 w-6 items-center justify-center rounded-full transition-all duration-300",
          isActive
            ? "bg-arb-blue shadow-lg shadow-arb-blue/30"
            : "bg-slate-300 dark:bg-slate-600"
        )}
      >
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
            d="M9 5l7 7-7 7"
          />
        </svg>
      </div>
    </div>
  );
}

export default function HowItWorksDesktop(steps: StepType[]) {
  const stepsArray = Object.values(steps);

  return (
    <TabGroup as="div" className="hidden lg:mt-20 lg:block">
      {({ selectedIndex }) => (
        <>
          <TabList className="grid grid-cols-3 gap-x-12">
            {stepsArray.map((step, stepIndex) => (
              <div key={step.name} className="relative">
                <Step
                  step={{
                    ...step,
                    name: (
                      <Tab className="[&:not(:focus-visible)]:focus:outline-none">
                        <span className="absolute inset-0 cursor-pointer" />
                        {step.name}
                      </Tab>
                    ),
                  }}
                  isActive={stepIndex === selectedIndex}
                  stepNumber={stepIndex + 1}
                  className="relative"
                />
                {/* Connector arrow between steps */}
                {stepIndex < stepsArray.length - 1 && (
                  <StepConnector isActive={stepIndex < selectedIndex} />
                )}
              </div>
            ))}
          </TabList>

          {/* Image panel with glass styling */}
          <TabPanels className="glass relative mt-16 overflow-hidden rounded-2xl p-8 xl:p-10">
            <div className="-mx-4 flex">
              {stepsArray.map((step, stepIndex) => (
                <TabPanel
                  static
                  key={step.name}
                  className={clsx(
                    "px-4 transition duration-500 ease-in-out [&:not(:focus-visible)]:focus:outline-none",
                    stepIndex !== selectedIndex && "opacity-50"
                  )}
                  style={{ transform: `translateX(-${selectedIndex * 100}%)` }}
                  aria-hidden={stepIndex !== selectedIndex}
                >
                  <div className="w-[52.75rem] overflow-hidden rounded-xl glass-subtle backdrop-blur bg-arb-blue/20 dark:bg-arb-blue/25 shadow-xl shadow-slate-900/10 ring-1 ring-arb-blue/20 dark:ring-arb-blue/25">
                    <Image
                      className="w-full"
                      src={step.image}
                      alt={`Step ${stepIndex + 1}: ${step.name}`}
                      width={720}
                      height={300}
                      sizes="52.75rem"
                    />
                  </div>
                </TabPanel>
              ))}
            </div>
          </TabPanels>
        </>
      )}
    </TabGroup>
  );
}
