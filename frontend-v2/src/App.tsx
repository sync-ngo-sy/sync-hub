import { RouterProvider } from 'react-router-dom'
import { Toaster } from '@/components/ui/sonner'
import { appRouter } from '@/app/AppRouter'
import { AppErrorBoundary } from '@/lib/errors/ErrorBoundaries'

function App() {
  return (
    <AppErrorBoundary>
      <RouterProvider router={appRouter} />
      <Toaster richColors />
    </AppErrorBoundary>
  )
}

export default App
