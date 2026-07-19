import { EmptyState } from '@/components/EmptyState'

interface RoutePlaceholderPageProps {
  title: string
  detail?: string
}

export function RoutePlaceholderPage({ title, detail }: RoutePlaceholderPageProps) {
  return (
    <section>
      <EmptyState
        title={title}
        detail={detail ?? 'This route will be completed by its feature ticket.'}
      />
    </section>
  )
}
