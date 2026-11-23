import { useContext } from 'react'
import { KindContext } from './kind-context'
import { categoryLabel, type Category } from './smartwork-data'

// 배지 색상은 Smartwork.css의 .sw-badge-{구분} 클래스에 있고, 라벨은 지금 공간의 팀 유형을 따릅니다.
export function CategoryBadge({ category }: { category: Category }) {
  const kind = useContext(KindContext)
  return <span className={`sw-badge sw-badge-${category}`}>
    <i className="sw-badge-dot" aria-hidden="true" />{categoryLabel(category, kind)}
  </span>
}

export function OverdueBadge({ days }: { days: number }) {
  return <span className="sw-overdue-badge">D+{days}</span>
}
