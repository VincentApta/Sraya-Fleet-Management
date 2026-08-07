import { Link, useLocation, useNavigate } from "react-router-dom"
import {
  ChevronsUpDown,
  History,
  IdCard,
  LayoutDashboard,
  LogOut,
  MapPin,
  Moon,
  Route,
  Sun,
  Truck,
  Users,
} from "lucide-react"

import { useAuth } from "../context/AuthContext"
import { useTheme } from "../context/ThemeContext"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar"

const NAV = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard },
  { title: "Trips", url: "/trips", icon: Route },
  { title: "Drivers", url: "/drivers", icon: IdCard },
  { title: "Pickup Sites", url: "/pickup-sites", icon: MapPin },
  { title: "Trucks", url: "/trucks", icon: Truck },
  { title: "History", url: "/history", icon: History },
]

function isActivePath(pathname, url) {
  if (url === "/") return pathname === "/"
  return pathname === url || pathname.startsWith(url + "/")
}

// Collapsible sidebar (icon mode on desktop, Sheet on mobile). Kept as an inner
// component so it can reach setOpenMobile via useSidebar to close the mobile
// Sheet after navigation.
function AppSidebar({ me, onLogout }) {
  const { setOpenMobile } = useSidebar()
  const { theme, toggleTheme } = useTheme()
  const location = useLocation()
  const isAdmin = me?.role === "Administrator"
  const items = isAdmin
    ? [...NAV, { title: "Users", url: "/users", icon: Users }]
    : NAV
  const closeOnNav = () => setOpenMobile(false)

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              size="lg"
              tooltip="Sraya Fleet Management"
              render={<Link to="/" onClick={closeOnNav} />}
            >
              <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                <Truck />
              </div>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-semibold">Sraya Fleet</span>
                <span className="truncate text-xs text-muted-foreground">
                  Management
                </span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => (
                <SidebarMenuItem key={item.url}>
                  <SidebarMenuButton
                    isActive={isActivePath(location.pathname, item.url)}
                    tooltip={item.title}
                    render={<Link to={item.url} onClick={closeOnNav} />}
                  >
                    <item.icon />
                    <span>{item.title}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton tooltip="Toggle theme" onClick={toggleTheme}>
              {theme === "dark" ? <Sun /> : <Moon />}
              <span>Toggle theme</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <DropdownMenu>
              <SidebarMenuButton
                size="lg"
                className="aria-expanded:bg-sidebar-accent"
                render={<DropdownMenuTrigger />}
              >
                <Avatar>
                  <AvatarFallback>
                    {(me?.username ?? "?").slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-medium">{me?.username}</span>
                  <span className="truncate text-xs text-muted-foreground">
                    {me?.role}
                  </span>
                </div>
                <ChevronsUpDown className="ml-auto" />
              </SidebarMenuButton>
              <DropdownMenuContent
                className="w-(--anchor-width)"
                side="top"
                align="end"
              >
                <DropdownMenuLabel>
                  {me?.username} · {me?.role}
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onClick={onLogout}>
                  <LogOut />
                  Log out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  )
}

// App shell: a sidebar (collapsible on desktop, Sheet on mobile) plus a header
// with the sidebar trigger and the page content passed as children.
export default function Layout({ children }) {
  const { me, logout } = useAuth()
  const navigate = useNavigate()

  async function handleLogout() {
    await logout()
    navigate("/login", { replace: true })
  }

  return (
    <SidebarProvider>
      <AppSidebar me={me} onLogout={handleLogout} />
      <SidebarInset>
        <header className="flex h-14 items-center gap-2 border-b px-4">
          <SidebarTrigger />
          <span className="font-semibold">Sraya Fleet Management</span>
        </header>
        <div className="flex-1 p-4 md:p-6">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  )
}
