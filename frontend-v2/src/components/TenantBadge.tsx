import { Building2 } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'

interface TenantBadgeProps {
  name: string
  iconUrl?: string | null
  size?: 'sm' | 'md'
  className?: string
}

export function TenantBadge({ name, iconUrl, size = 'md', className }: TenantBadgeProps) {
  return (
    <Avatar
      size={size === 'sm' ? 'sm' : 'lg'}
      className={cn('rounded-xl bg-primary/8 after:rounded-xl', className)}
    >
      {iconUrl && <AvatarImage src={iconUrl} alt={`${name} logo`} />}
      <AvatarFallback className="rounded-xl bg-transparent text-primary">
        <Building2 size={size === 'sm' ? 14 : 18} />
      </AvatarFallback>
    </Avatar>
  )
}
