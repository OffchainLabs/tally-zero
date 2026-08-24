import {
  CheckCircledIcon,
  ClockIcon,
  CommitIcon,
  CrossCircledIcon,
  ExclamationTriangleIcon,
  StopwatchIcon,
  UpdateIcon,
} from "@radix-ui/react-icons";

export const states = [
  {
    value: "Active",
    label: "Active",
    bgColor:
      "bg-green-100 text-green-800 dark:bg-green-900/60 dark:text-green-200",
    icon: CheckCircledIcon,
  },
  {
    value: "Pending",
    label: "Pending",
    bgColor:
      "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/60 dark:text-yellow-400",
    icon: UpdateIcon,
  },
  {
    value: "Queued",
    label: "Queued",
    bgColor:
      "bg-amber-100 text-amber-600 dark:bg-amber-900/60 dark:text-amber-400",
    icon: CommitIcon,
  },
  {
    value: "Succeeded",
    label: "Succeeded",
    bgColor:
      "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-400",
    icon: CheckCircledIcon,
  },
  {
    // Display-only: a Core proposal the governor already calls "Executed" whose
    // L1 round-trip has not landed. Never an on-chain state, so it is absent
    // from the status filter's options.
    value: "Executing",
    label: "Executing",
    bgColor:
      "bg-amber-100 text-amber-700 dark:bg-amber-900/60 dark:text-amber-300",
    icon: ClockIcon,
  },
  {
    value: "Executed",
    label: "Executed",
    bgColor:
      "bg-indigo-100 text-indigo-500 dark:bg-indigo-900/60 dark:text-indigo-100",
    icon: ExclamationTriangleIcon,
  },
  {
    value: "Defeated",
    label: "Defeated",
    bgColor:
      "bg-orange-100 text-orange-600 dark:bg-orange-900/60 dark:text-orange-200",
    icon: StopwatchIcon,
  },
  {
    value: "Canceled",
    label: "Canceled",
    bgColor: "bg-red-100 text-red-600 dark:bg-red-900/60 dark:text-red-100",
    icon: CrossCircledIcon,
  },
  {
    value: "Expired",
    label: "Expired",
    bgColor: "bg-rose-100 text-rose-700 dark:bg-rose-900/60 dark:text-rose-200",
    icon: ClockIcon,
  },
];
