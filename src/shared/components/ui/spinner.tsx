import { LoaderCircle } from "lucide-react";
import { cn } from "@shared/lib/utils";
import type { ComponentProps } from "react";

type SpinnerProps = ComponentProps<typeof LoaderCircle>;

export function Spinner({ className, ...props }: SpinnerProps) {
  return <LoaderCircle className={cn("size-4 animate-spin", className)} aria-hidden="true" {...props} />;
}
