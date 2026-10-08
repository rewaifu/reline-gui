import { IconSun, IconMoon } from "@tabler/icons-react"
import { useTheme } from "next-themes"
import { Button } from "~/components/ui"

export function ModeToggle() {
  const { resolvedTheme, setTheme } = useTheme()
  const toggleTheme = () => {
    setTheme(resolvedTheme === "dark" ? "light" : "dark")
  }

  return (
    <Button variant="ghost" size="icon-lg" onClick={toggleTheme} className="relative transition-colors duration-300">
      <IconSun
        className={`
                    h-[1.2rem] w-[1.2rem]
                    transition-all duration-300
                    dark:-rotate-90 dark:scale-0
                    animate-in fade-in-0 zoom-in-50
                `}
      />
      <IconMoon
        className={`
                    absolute h-[1.2rem] w-[1.2rem]
                    transition-all duration-300
                    rotate-90 scale-0
                    dark:rotate-0 dark:scale-100
                    animate-in fade-in-0 zoom-in-50
                `}
      />
      <span className="sr-only">Toggle theme</span>
    </Button>
  )
}
