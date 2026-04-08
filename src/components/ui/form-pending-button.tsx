"use client";

import { LoaderCircle } from "lucide-react";
import { useFormStatus } from "react-dom";
import { Button, type ButtonProps } from "@/components/ui/button";

type FormPendingButtonProps = ButtonProps & {
  idleLabel: string;
  pendingLabel: string;
};

export function FormPendingButton({
  idleLabel,
  pendingLabel,
  className,
  disabled,
  children,
  ...props
}: FormPendingButtonProps) {
  const { pending } = useFormStatus();

  return (
    <Button
      className={className}
      disabled={disabled || pending}
      aria-busy={pending}
      {...props}
    >
      {pending ? (
        <>
          <LoaderCircle className="mr-2 size-4 animate-spin" />
          {pendingLabel}
        </>
      ) : (
        children ?? idleLabel
      )}
    </Button>
  );
}
