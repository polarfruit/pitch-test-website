import L from 'leaflet'
import { CATEGORY_BADGE_COLORS, COLOR_EMBER } from '@/constants/ui'

// Category → solid hex colour for map pin markers
export const CATEGORY_PIN_COLORS = {
  'Night Market': '#2B5BA8',
  'Festival': '#E8500A',
  'Farmers Market': '#2D8B55',
  'Corporate': '#2B5BA8',
  'Pop-up': '#C9840A',
  'Twilight Market': '#2D8B55',
}

export const ADELAIDE_CENTER = [-34.9285, 138.6007]
export const DEFAULT_ZOOM = 10
export const FIT_BOUNDS_PADDING = [64, 64]
export const FIT_BOUNDS_MAX_ZOOM = 14
export const SINGLE_MARKER_ZOOM = 13
export const CLUSTER_MAX_RADIUS = 40
export const CLUSTER_DISABLE_AT_ZOOM = 14
export const MOBILE_BREAKPOINT = 768

export function createPinIcon(color) {
  return L.divIcon({
    className: '',
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    popupAnchor: [0, -18],
    html: `<div style="width:32px;height:32px;border-radius:50%;background:${color};border:2px solid rgba(255,255,255,0.3);display:flex;align-items:center;justify-content:center;cursor:pointer;opacity:0.95;"><div style="width:10px;height:10px;border-radius:50%;background:rgba(255,255,255,0.85);"></div></div>`,
  })
}

export function createClusterIcon(cluster) {
  const count = cluster.getChildCount()
  const size = count < 5 ? 40 : count < 10 ? 48 : 56
  return L.divIcon({
    html: `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${COLOR_EMBER};opacity:0.92;border:2px solid rgba(255,255,255,0.3);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:13px;font-family:'Instrument Sans',sans-serif;">${count}</div>`,
    className: '',
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  })
}

function formatPopupDate(dateString) {
  if (!dateString) return 'TBC'
  return new Date(dateString).toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

export function buildPopupHTML(event) {
  const badgeColors = CATEGORY_BADGE_COLORS[event.category] || {}
  const dateLabel = formatPopupDate(event.date_sort)
  const feeLabel = event.stall_fee_min > 0
    ? `$${event.stall_fee_min}\u2013$${event.stall_fee_max}`
    : 'Contact organiser'

  return `
    <div style="font-weight:700;font-size:14px;margin-bottom:6px;color:#FDF4E7;line-height:1.3;">${event.name}</div>
    <span style="display:inline-block;font-size:10px;font-weight:700;padding:2px 8px;border-radius:100px;margin-bottom:8px;letter-spacing:0.06em;background:${badgeColors.background || '#ffffff12'};color:${badgeColors.color || '#FDF4E7'};">${event.category}</span>
    <div style="font-size:12px;color:#A89880;margin-bottom:3px;">\uD83D\uDCCD ${event.suburb}, ${event.state || 'SA'}</div>
    <div style="font-size:12px;color:#A89880;margin-bottom:3px;">\uD83D\uDCC5 ${dateLabel}</div>
    <div style="font-size:12px;color:#A89880;margin-bottom:10px;">Booth fee: <strong style="color:#FDF4E7;">${feeLabel}</strong></div>
    <a href="/events/${event.slug}" style="display:inline-flex;align-items:center;gap:5px;font-size:13px;font-weight:700;color:#E8500A;text-decoration:none;">View event &rarr;</a>
  `
}

export function isMobile() {
  return window.innerWidth < MOBILE_BREAKPOINT
}

export function calculateMinZoom(container) {
  const worldBounds = L.latLngBounds([[-85, -180], [85, 180]])
  const tempMap = L.map(document.createElement('div'), { center: [0, 0], zoom: 1 })
  tempMap.getSize = () => L.point(container.clientWidth, container.clientHeight)
  const fillZoom = Math.ceil(tempMap.getBoundsZoom(worldBounds, false))
  tempMap.remove()
  return Math.max(fillZoom, 2)
}
