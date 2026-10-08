import { Input as InputPrimitive } from "@base-ui/react/input"
import { NumberField } from "@base-ui/react/number-field"
import { IconChevronDown, IconChevronUp } from "@tabler/icons-react"
import type * as React from "react"

import { Button } from "~/components/ui/button"
import { cn } from "~/lib/utils"

const inputClasses =
  "h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-base transition-colors outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40"

const numberInputClasses =
  "h-8 w-full min-w-0 border-0 bg-transparent px-2.5 py-1 text-base outline-none placeholder:text-muted-foreground md:text-sm"

const numberGroupClasses =
  "relative flex w-full items-center overflow-hidden rounded-lg border border-input bg-transparent transition-colors outline-none focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 data-disabled:pointer-events-none data-disabled:cursor-not-allowed data-disabled:bg-input/50 data-disabled:opacity-50 has-[[aria-invalid=true]]:border-destructive has-[[aria-invalid=true]]:ring-3 has-[[aria-invalid=true]]:ring-destructive/20 dark:bg-input/30 dark:data-disabled:bg-input/80 dark:has-[[aria-invalid=true]]:ring-destructive/40"

const layoutClassPattern = /^(?:w|min-w|max-w|basis|grow|shrink|flex|m|mx|my|mt|mb|ml|mr|self|order)-/

function splitClassName(className?: string) {
  const layout: string[] = []
  const rest: string[] = []
  for (const token of (className ?? "").split(/\s+/)) {
    if (!token) continue
    if (layoutClassPattern.test(token)) layout.push(token)
    else rest.push(token)
  }
  return { layout: layout.join(" "), rest: rest.join(" ") }
}

function NumberInput({ className, value, onChange, min, max, step, disabled, decrementDisabled, readOnly, ...props }: Omit<React.ComponentProps<"input">, "type"> & { decrementDisabled?: boolean }) {
  const { layout, rest } = splitClassName(className)
  const widthToken = layout.split(/\s+/).find((token) => token.startsWith("w-"))

  const numericValue = value === "" || value == null ? null : Number(value)
  const numericMin = min == null ? undefined : Number(min)
  const numericMax = max == null ? undefined : Number(max)
  const numericStep = step === "any" ? "any" : step == null ? undefined : Number(step)

  return (
    <NumberField.Root
      className={cn("w-full", widthToken, layout)}
      value={numericValue}
      onValueChange={(nextValue) => {
        onChange?.({
          target: { value: nextValue == null ? "" : String(nextValue) },
        } as unknown as React.ChangeEvent<HTMLInputElement>)
      }}
      min={numericMin}
      max={numericMax}
      step={numericStep}
      disabled={disabled}
      readOnly={readOnly}
      locale="en-US"
      format={{ useGrouping: false }}
    >
      <NumberField.Group className={numberGroupClasses}>
        <NumberField.Input data-slot="input" className={cn(numberInputClasses, "min-w-[3.5rem]", rest)} {...props} />
        <div className="flex w-7 shrink-0 flex-col self-stretch border-input border-l">
          <NumberField.Increment
            aria-label="Increment"
            render={<Button variant="ghost" size="icon-xs" tabIndex={-1} />}
            className="min-h-0 w-full flex-1 rounded-none border-0 border-input border-b p-0 pr-0.4 text-muted-foreground hover:bg-muted dark:hover:bg-input/50"
          >
            <IconChevronUp className="size-3.5" />
          </NumberField.Increment>
          <NumberField.Decrement
            aria-label="Decrement"
            disabled={decrementDisabled}
            render={<Button variant="ghost" size="icon-xs" tabIndex={-1} />}
            className="min-h-0 w-full flex-1 rounded-none border-0 p-0 pr-0.4 text-muted-foreground hover:bg-muted dark:hover:bg-input/50"
          >
            <IconChevronDown className="size-3.5" />
          </NumberField.Decrement>
        </div>
      </NumberField.Group>
    </NumberField.Root>
  )
}

function Input({ className, type, decrementDisabled, ...props }: React.ComponentProps<"input"> & { decrementDisabled?: boolean }) {
  if (type === "number") {
    return <NumberInput className={className} decrementDisabled={decrementDisabled} {...props} />
  }

  return <InputPrimitive type={type} data-slot="input" className={cn(inputClasses, className)} {...props} />
}

export { Input }
