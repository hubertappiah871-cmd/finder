import { BadgeCheck, CircleDot, CircleX, Clock, type LucideIcon } from 'lucide-react'
import { CLAIM_STATUS_META, ITEM_STATUS_META } from '../lib/constants'
import type { ClaimStatus, ItemStatus, ItemType } from '../lib/types'
import { cn } from '../lib/utils'

const ITEM_STATUS_ICON: Record<ItemStatus, LucideIcon> = {
  open: CircleDot,
  claimed: Clock,
  resolved: BadgeCheck,
}

const CLAIM_STATUS_ICON: Record<ClaimStatus, LucideIcon> = {
  pending: Clock,
  approved: BadgeCheck,
  rejected: CircleX,
  meeting_required: Clock,
}

export function ItemStatusBadge({ status }: { status: ItemStatus }) {
  const meta = ITEM_STATUS_META[status]
  const Icon = ITEM_STATUS_ICON[status]
  return (
    <span className={cn('badge', `badge--${meta.tone}`)}>
      <Icon size={12} aria-hidden="true" />
      {meta.label}
    </span>
  )
}

export function ClaimStatusBadge({ status }: { status: ClaimStatus }) {
  const meta = CLAIM_STATUS_META[status]
  const Icon = CLAIM_STATUS_ICON[status]
  return (
    <span className={cn('badge', `badge--${meta.tone}`)}>
      <Icon size={12} aria-hidden="true" />
      {meta.label}
    </span>
  )
}

export function TypeBadge({ type }: { type: ItemType }) {
  return (
    <span className={cn('badge badge--type', `badge--type-${type}`)}>
      {type === 'lost' ? 'Lost item' : 'Found item'}
    </span>
  )
}
