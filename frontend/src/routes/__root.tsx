import { Outlet, createRootRouteWithContext } from '@tanstack/react-router'
import type { QueryClient } from '@tanstack/react-query'
import { MobileNav } from '@/components/layout/mobile-nav'
import { Sidebar } from '@/components/layout/sidebar'
import { Topbar } from '@/components/layout/topbar'
import { LoginScreen } from '@/components/login-screen'
import { useSession } from '@/lib/session'

interface RouterContext {
  queryClient: QueryClient
}

export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootLayout,
})

function RootLayout() {
  const { role } = useSession()

  if (!role) return <LoginScreen />

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar />
        {/* Extra bottom padding below 960px clears the fixed mobile tab bar. */}
        <main className="min-w-0 flex-1 overflow-y-auto p-[clamp(14px,2.6vw,26px)] pb-28 nav:pb-24">
          <Outlet />
        </main>
      </div>
      <MobileNav />
    </div>
  )
}
