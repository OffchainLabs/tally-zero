/**
 * Step type definitions for marketing page feature showcase
 */

import {
  type ComponentType,
  type JSX,
  type ReactNode,
  type SVGProps,
} from "react";

/** Configuration for a feature step in the marketing carousel */
export type StepType = {
  /** Step name/title */
  name: string;
  /** Short summary for preview display */
  summary: string;
  /** Full description of the feature */
  description: string;
  /** Image URL for the step */
  image: string;
  /** Icon component for the step indicator */
  icon: ComponentType<SVGProps<SVGSVGElement>> | (() => JSX.Element);
};

/** Extended type used when name is rendered as JSX (in desktop view) */
export type StepTypeWithReactName = Omit<StepType, "name"> & {
  /** Step name as ReactNode for rich rendering */
  name: ReactNode;
};
