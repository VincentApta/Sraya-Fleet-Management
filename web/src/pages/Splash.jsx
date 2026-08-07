import { Link } from "react-router-dom"
import { useTheme } from "../context/ThemeContext"
import { Button } from "@/components/ui/button"

// Unauthenticated landing surface: a warm radial gradient behind a single
// claymorphic card with the product name, tagline, and a Sign In CTA.
export default function Splash() {
  const { theme } = useTheme()
  const background =
    theme === "dark"
      ? "radial-gradient(circle at 50% 35%, #4A3525 0%, #2A2419 60%, #1F1A14 100%)"
      : "radial-gradient(circle at 50% 35%, #D9876B 0%, #F5F0E8 60%)"

  return (
    <div
      className="flex min-h-screen items-center justify-center p-4"
      style={{ background }}
    >
      <div
        className="w-full max-w-md rounded-3xl bg-card p-12 text-center shadow-[var(--shadow-clay-lg)]"
      >
        <h1 className="text-4xl font-bold">Sraya Fleet Management</h1>
        <p className="mt-3 text-lg text-muted-foreground">
          Palm oil fleet operations, simplified.
        </p>
        <Button size="lg" className="mt-8 w-full" render={<Link to="/login" />}>
          Sign In
        </Button>
      </div>
    </div>
  )
}
