import { Link } from 'react-router-dom'
import { Calendar, MapPin } from 'lucide-react'
import { ITEM_TYPE_LABEL } from '../lib/constants'
import type { ItemWithReporter } from '../lib/types'
import { formatDate } from '../lib/utils'
import { ItemStatusBadge } from './StatusBadge'

export default function ItemCard({ item }: { item: ItemWithReporter }) {
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
          <span className="item-card__placeholder">{item.type === 'lost' ? 'LOST' : 'FOUND'}</span>
        )}
        <span className={`item-card__type item-card__type--${item.type}`}>{ITEM_TYPE_LABEL[item.type]}</span>
        <span className="item-card__status">
          <ItemStatusBadge status={item.status} />
        </span>
      </div>
      <div className="item-card__body">
        <h3 className="item-card__title">{item.title}</h3>
        <p className="item-card__category">{item.category}</p>
        <p className="item-card__meta">
          <MapPin size={14} aria-hidden="true" />
          <span>{item.location}</span>
        </p>
        <p className="item-card__meta">
          <Calendar size={14} aria-hidden="true" />
          <span>{formatDate(item.date)}</span>
        </p>
      </div>
    </Link>
  )
}
