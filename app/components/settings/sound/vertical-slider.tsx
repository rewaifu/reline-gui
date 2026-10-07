"use client"

import * as React from "react"
import { Slider as SliderPrimitive } from "@base-ui/react/slider"

import { cn } from "~/lib/utils"

function VerticalSlider({ className, value, min = 0, max = 1, ...props }: SliderPrimitive.Root.Props) {
  const values = React.useMemo(() => (Array.isArray(value) ? value : [min]), [value, min])
  const thumbKeys = React.useMemo(() => values.map((_, index) => `thumb-${index}`), [values])

  return (
    <SliderPrimitive.Root
      data-slot="vertical-slider"
      orientation="vertical"
      value={value}
      min={min}
      max={max}
      thumbAlignment="edge"
      className={cn("relative flex h-full touch-none select-none flex-col items-center justify-center", className)}
      {...props}
    >
      <SliderPrimitive.Control className="relative flex h-full touch-none select-none flex-col items-center justify-center data-disabled:opacity-50">
        <SliderPrimitive.Track data-slot="vertical-slider-track" className="relative h-full w-2 overflow-hidden rounded-full bg-secondary">
          <SliderPrimitive.Indicator data-slot="vertical-slider-range" className="absolute w-full bg-primary" />
        </SliderPrimitive.Track>

        {thumbKeys.map((key) => (
          <SliderPrimitive.Thumb
            key={key}
            data-slot="vertical-slider-thumb"
            className={cn(
              "relative block size-4 rounded-full bg-card",
              "border-2 border-primary",
              "ring-ring/30 ring-offset-background",
              "transition-[border-width,box-shadow] duration-150",
              "hover:ring-3",
              "data-[dragging]:ring-0 data-[dragging]:border-[4px]",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
              "disabled:pointer-events-none disabled:opacity-50",
              "after:absolute after:-inset-2",
            )}
          />
        ))}
      </SliderPrimitive.Control>
    </SliderPrimitive.Root>
  )
}

export { VerticalSlider }
