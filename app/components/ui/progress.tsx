import { Progress as ProgressPrimitive } from "@base-ui/react/progress"

import { cn } from "~/lib/utils"

function Progress({
  className,
  children,
  value,
  showValue,
  indicatorClassName,
  ...props
}: ProgressPrimitive.Root.Props & { showValue?: boolean; indicatorClassName?: string }) {
  return (
    <ProgressPrimitive.Root value={value} data-slot="progress" className={cn("flex items-center gap-2", className)} {...props}>
      {children}
      <ProgressTrack>
        <ProgressIndicator className={indicatorClassName} />
      </ProgressTrack>
      {showValue ? <ProgressValue value={value ?? 0} /> : null}
    </ProgressPrimitive.Root>
  )
}

function ProgressTrack({ className, ...props }: ProgressPrimitive.Track.Props) {
  return (
    <ProgressPrimitive.Track
      className={cn("relative flex h-1 w-full items-center overflow-x-hidden rounded-full bg-muted", className)}
      data-slot="progress-track"
      {...props}
    />
  )
}

function ProgressIndicator({ className, ...props }: ProgressPrimitive.Indicator.Props) {
  return <ProgressPrimitive.Indicator data-slot="progress-indicator" className={cn("h-full bg-primary transition-all", className)} {...props} />
}

function ProgressLabel({ className, ...props }: ProgressPrimitive.Label.Props) {
  return <ProgressPrimitive.Label className={cn("text-sm font-medium", className)} data-slot="progress-label" {...props} />
}

function ProgressValue({ value, className }: { value: number; className?: string }) {
  return (
    <span className={cn("shrink-0 text-xs text-muted-foreground tabular-nums", className)} data-slot="progress-value">
      {Math.round(value)}%
    </span>
  )
}

export { Progress, ProgressTrack, ProgressIndicator, ProgressLabel, ProgressValue }
