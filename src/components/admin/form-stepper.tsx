"use client";

import type { ComponentType } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export type WizardStep = {
  id: string;
  title: string;
  description: string;
  icon: ComponentType<{ className?: string }>;
};

type FormStepperProps = {
  steps: WizardStep[];
  current: number;
  // Só permite voltar a passos já visitados (índice <= current).
  onStepClick: (index: number) => void;
};

export function FormStepper({ steps, current, onStepClick }: FormStepperProps) {
  return (
    <ol className="flex items-center">
      {steps.map((step, index) => {
        const status =
          index < current ? "complete" : index === current ? "current" : "upcoming";
        const Icon = step.icon;
        const clickable = index <= current;
        const isLast = index === steps.length - 1;

        return (
          <li
            key={step.id}
            className={cn("flex items-center gap-3", !isLast && "flex-1")}
          >
            <button
              type="button"
              onClick={() => clickable && onStepClick(index)}
              disabled={!clickable}
              aria-current={status === "current" ? "step" : undefined}
              className={cn(
                "group flex items-center gap-3 rounded-full text-left transition",
                clickable ? "cursor-pointer" : "cursor-default",
              )}
            >
              <span
                className={cn(
                  "grid size-10 shrink-0 place-items-center rounded-full border text-sm font-semibold transition",
                  status === "current" &&
                    "border-primary bg-primary text-primary-foreground shadow-sm ring-4 ring-ring",
                  status === "complete" &&
                    "border-primary/30 bg-primary/15 text-primary group-hover:bg-primary/20",
                  status === "upcoming" &&
                    "border-border/70 bg-background/50 text-muted-foreground dark:border-white/10 dark:bg-white/[0.03]",
                )}
              >
                {status === "complete" ? (
                  <Check className="size-5" />
                ) : (
                  <Icon className="size-5" />
                )}
              </span>
              <span className="hidden min-w-0 sm:block">
                <span className="block text-[0.7rem] font-medium uppercase tracking-[0.18em] text-muted-foreground">
                  Passo {index + 1}
                </span>
                <span
                  className={cn(
                    "block truncate text-sm font-semibold transition",
                    status === "upcoming" ? "text-muted-foreground" : "text-foreground",
                  )}
                >
                  {step.title}
                </span>
              </span>
            </button>

            {!isLast ? (
              <span
                aria-hidden
                className={cn(
                  "h-px flex-1 rounded-full transition",
                  index < current
                    ? "bg-primary/40"
                    : "bg-border/70 dark:bg-white/10",
                )}
              />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
