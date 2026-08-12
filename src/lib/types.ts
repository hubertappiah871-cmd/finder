export type Role = 'user' | 'admin'
export type ItemType = 'lost' | 'found'
export type ItemStatus = 'open' | 'claimed' | 'resolved'
export type ClaimStatus = 'pending' | 'approved' | 'rejected'

/** profiles table */
export interface Profile {
  id: string
  name: string
  email: string
  role: Role
  active: boolean
  created_at: string
}

/** items table */
export interface Item {
  id: string
  type: ItemType
  title: string
  category: string
  description: string
  location: string
  date: string
  photo_url: string | null
  status: ItemStatus
  reported_by: string | null
  created_at: string
}

/** Item with the reporter's profile embedded via PostgREST */
export interface ItemWithReporter extends Item {
  reporter: Pick<Profile, 'name' | 'email'> | null
}

/** claims table */
export interface Claim {
  id: string
  item_id: string
  claimant_uid: string
  verification_details: string
  status: ClaimStatus
  rejection_reason: string | null
  created_at: string
}

/** Claim with the item and claimant embedded */
export interface ClaimWithRelations extends Claim {
  item: Pick<Item, 'id' | 'title' | 'type' | 'photo_url' | 'status'> | null
  claimant: Pick<Profile, 'name' | 'email'> | null
}

/** notifications table */
export interface NotificationRow {
  id: string
  user_id: string
  message: string
  read: boolean
  created_at: string
}
