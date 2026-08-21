export type Role = 'user' | 'admin'
export type ItemType = 'lost' | 'found'
export type ItemStatus = 'open' | 'claimed' | 'resolved'
export type ClaimStatus = 'pending' | 'approved' | 'rejected' | 'meeting_required'

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
  owner_name: string
  contact_info: string
  verification_details: string
  status: ClaimStatus
  rejection_reason: string | null
  admin_notes: string | null
  meeting_details: string | null
  created_at: string
}

/** Claim with the item and claimant embedded */
export interface ClaimWithRelations extends Claim {
  item: (Pick<Item, 'id' | 'title' | 'type' | 'photo_url' | 'status'> & { reported_by?: string | null }) | null
  claimant: Pick<Profile, 'name' | 'email'> | null
}

/** messages table */
export interface Message {
  id: string
  claim_id: string | null
  item_id?: string | null
  sender_id: string
  recipient_id: string
  body: string
  created_at: string
  read: boolean
}

/** Message with sender profile and optional claim/item embedded */
export interface MessageWithSender extends Message {
  sender: Pick<Profile, 'name' | 'role'> | null
  recipient?: Pick<Profile, 'name' | 'role'> | null
  item?: Pick<Item, 'id' | 'title' | 'type' | 'photo_url'> | null
  claim?: (Pick<Claim, 'id' | 'item_id' | 'claimant_uid' | 'status'> & {
    item?: Pick<Item, 'id' | 'title' | 'type' | 'photo_url'> | null
    claimant?: Pick<Profile, 'name' | 'email'> | null
  }) | null
}

/** notifications table */
export interface NotificationRow {
  id: string
  user_id: string
  message: string
  read: boolean
  created_at: string
}
