import { Link } from 'react-router-dom'
import {
  Briefcase,
  Calendar,
  CreditCard,
  Key,
  Laptop,
  MapPin,
  Package,
  Shirt,
  Tag,
  type LucideIcon,
} from 'lucide-react'
import { ITEM_TYPE_LABEL } from '../lib/constants'
import type { ItemWithReporter } from '../lib/types'
import { formatDate } from '../lib/utils'
import { ItemStatusBadge } from './StatusBadge'

const CATEGORY_ICONS: Record<string, LucideIcon> = {
  Clothing: Shirt,
  Electronics: Laptop,
  'Bags & Luggage': Briefcase,
  'IDs & Cards': CreditCard,
  Keys: Key,
  Other: Package,
}

export default function ItemCard({ item }: { item: ItemWithReporter }) {
  const CatIcon = CATEGORY_ICONS[item.category] || Tag

  return (
    <Link to={`/items/${item.id}`} className="item-card">
      <div className="item-card__media">
        {item.photo_url ? (
          <img
            src={item.photo_url}
            alt={item.title}
            loading="lazy"
            onError={(e) => {
              e.currentTarget.style.display = 'none'
            }}
          />
        ) : (
          <div className="item-card__placeholder">
            <CatIcon size={32} strokeWidth={1.5} aria-hidden="true" className="item-card__placeholder-icon" />
            <span className="item-card__placeholder-text">No image added</span>
          </div>
        )}

        <div className="item-card__badges">
          <span className={`item-card__type item-card__type--${item.type}`}>
            {ITEM_TYPE_LABEL[item.type]}
          </span>
          <span className="item-card__status">
            <ItemStatusBadge status={item.status} />
          </span>
        </div>
      </div>

      <div className="item-card__body">
        <h3 className="item-card__title" title={item.title}>
          {item.title}
        </h3>

        <div className="item-card__category-row">
          <span className="item-card__category-tag">
            <CatIcon size={12} aria-hidden="true" />
            <span>{item.category}</span>
          </span>
        </div>

        <div className="item-card__meta-grid">
          <p className="item-card__meta">
            <MapPin size={13} aria-hidden="true" className="item-card__meta-icon" />
            <span className="truncate">{item.location}</span>
          </p>
          <p className="item-card__meta">
            <Calendar size={13} aria-hidden="true" className="item-card__meta-icon" />
            <span>{formatDate(item.date)}</span>
          </p>
        </div>

        {item.description && (
          <p className="item-card__snippet" title={item.description}>
            {item.description}
          </p>
        )}
      </div>
    </Link>
  )
}
