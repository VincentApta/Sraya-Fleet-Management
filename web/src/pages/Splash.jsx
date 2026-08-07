import { Link } from "react-router-dom"
import {
  Activity,
  ChevronRight,
  ClipboardList,
  Factory,
  History,
  Route,
  Scale,
  Truck,
} from "lucide-react"
import { useTheme } from "../context/ThemeContext"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"

// Unauthenticated informational landing: warm clay gradient behind a compact
// brand intro, a recessed trip-workflow rail, capability modules, and a
// factual dashboard-coverage summary. Internal-tool tone — no sales copy or
// invented metrics.
const CAPABILITIES = [
  {
    icon: ClipboardList,
    title: "Dispatch trips",
    body: "Assign truck, driver, pickup site, and trip money.",
  },
  {
    icon: Scale,
    title: "Record weighbridge returns",
    body: "Capture pickup and factory weights for each trip.",
  },
  {
    icon: Activity,
    title: "Monitor fleet activity",
    body: "See active trips and truck availability at a glance.",
  },
  {
    icon: History,
    title: "Review history",
    body: "Filter completed trips and export them to CSV.",
  },
]

const WORKFLOW = ["Dispatch", "Collect TBS", "Weigh at factory", "Review & export"]

const COVERAGE = [
  { icon: Route, label: "Active trips in progress" },
  { icon: Truck, label: "Trucks currently out" },
  { icon: Factory, label: "Factory TBS total" },
  { icon: History, label: "Completed-trip history" },
]

export default function Splash() {
  const { theme } = useTheme()
  const background =
    theme === "dark"
      ? "radial-gradient(circle at 50% 22%, #4A3525 0%, #2A2419 55%, #1F1A14 100%)"
      : "radial-gradient(circle at 50% 22%, #D9876B 0%, #F5F0E8 60%)"

  return (
    <div className="min-h-screen w-full px-4 py-12 sm:py-16" style={{ background }}>
      <main className="mx-auto w-full max-w-5xl">
        {/* Hero — compact brand introduction */}
        <header className="flex flex-col items-center text-center">
          <span className="inline-flex items-center rounded-full bg-secondary px-3 py-1 text-xs font-medium text-muted-foreground shadow-[var(--shadow-clay-sm)]">
            Internal operations tool
          </span>
          <h1 className="mt-4 text-4xl font-bold tracking-tight sm:text-5xl">
            Sraya Fleet Management
          </h1>
          <p className="mt-3 max-w-xl text-balance text-lg text-muted-foreground">
            Palm oil fleet operations, simplified.
          </p>
          <Button size="lg" className="mt-8 w-full sm:w-auto" render={<Link to="/login" />}>
            Sign In
          </Button>
        </header>

        {/* Workflow band — recessed horizontal rail, stacks vertically on mobile */}
        <section
          aria-labelledby="workflow-heading"
          className="mt-14 rounded-2xl bg-secondary p-4 shadow-[var(--shadow-clay-inset)] sm:mt-16 sm:p-6"
        >
          <h2 id="workflow-heading" className="sr-only">
            Trip workflow
          </h2>
          <ol className="flex flex-col gap-3 sm:flex-row sm:items-center">
            {WORKFLOW.map((step, i) => (
              <li
                key={step}
                className="flex flex-col gap-3 sm:flex-1 sm:flex-row sm:items-center"
              >
                <div className="flex items-center gap-3">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground shadow-[var(--shadow-clay-sm)]">
                    {i + 1}
                  </span>
                  <span className="text-sm font-medium text-foreground">{step}</span>
                </div>
                {i < WORKFLOW.length - 1 && (
                  <ChevronRight
                    aria-hidden="true"
                    className="mx-auto size-4 shrink-0 rotate-90 text-muted-foreground sm:rotate-0"
                  />
                )}
              </li>
            ))}
          </ol>
        </section>

        {/* Operational capabilities */}
        <section aria-labelledby="capabilities-heading" className="mt-14 sm:mt-16">
          <h2
            id="capabilities-heading"
            className="text-center text-sm font-semibold uppercase tracking-wide text-muted-foreground"
          >
            What you can do
          </h2>
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            {CAPABILITIES.map(({ icon: Icon, title, body }) => (
              <Card
                key={title}
                className="rounded-2xl shadow-[var(--shadow-clay-md)] motion-safe:transition-shadow motion-safe:duration-200 hover:shadow-[var(--shadow-clay-lg)]"
              >
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary shadow-[var(--shadow-clay-sm)]">
                      <Icon className="size-5" aria-hidden="true" />
                    </span>
                    <CardTitle className="text-base">{title}</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">{body}</CardContent>
              </Card>
            ))}
          </div>
        </section>

        {/* Coverage — factual summary, no live numbers or invented metrics */}
        <section aria-labelledby="coverage-heading" className="mt-8 sm:mt-10">
          <Card className="rounded-2xl shadow-[var(--shadow-clay-md)]">
            <CardContent className="p-6">
              <CardTitle id="coverage-heading" className="text-lg">
                What the dashboard covers
              </CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                One screen summarizing current fleet state and past trips.
              </p>
              <Separator className="my-4" />
              <ul className="grid gap-4 sm:grid-cols-2">
                {COVERAGE.map(({ icon: Icon, label }) => (
                  <li key={label} className="flex items-center gap-3">
                    <Icon className="size-5 shrink-0 text-primary" aria-hidden="true" />
                    <span className="text-sm text-foreground">{label}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </section>
      </main>
    </div>
  )
}
