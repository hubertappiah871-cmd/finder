import type { ClaimStatus, ItemStatus, ItemType } from './types'

export const CATEGORIES = [
  'Electronics',
  'Bags & Luggage',
  'Books & Study Materials',
  'IDs & Cards',
  'Clothing',
  'Accessories',
  'Keys',
  'Sports Equipment',
  'Water Bottles',
  'Other',
] as const

export const ITEM_TYPE_LABEL: Record<ItemType, string> = {
  lost: 'Lost',
  found: 'Found',
}

export const ITEM_STATUS_META: Record<ItemStatus, { label: string; tone: 'gold' | 'blue' | 'green' }> = {
  open: { label: 'Open', tone: 'gold' },
  claimed: { label: 'Claimed', tone: 'blue' },
  resolved: { label: 'Resolved', tone: 'green' },
}

export const CLAIM_STATUS_META: Record<ClaimStatus, { label: string; tone: 'gold' | 'green' | 'red' | 'blue' }> = {
  pending: { label: 'Pending', tone: 'gold' },
  approved: { label: 'Approved', tone: 'green' },
  rejected: { label: 'Rejected', tone: 'red' },
  meeting_required: { label: 'Meeting Required', tone: 'blue' },
}
