'use client'

import { useRef, useEffect, useState, useCallback } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import 'leaflet.markercluster'
import 'leaflet.markercluster/dist/MarkerCluster.css'
import 'leaflet.markercluster/dist/MarkerCluster.Default.css'
import { COLOR_EMBER } from '@/constants/ui'
import {
  CATEGORY_PIN_COLORS,
  ADELAIDE_CENTER,
  DEFAULT_ZOOM,
  FIT_BOUNDS_PADDING,
  FIT_BOUNDS_MAX_ZOOM,
  SINGLE_MARKER_ZOOM,
  CLUSTER_MAX_RADIUS,
  CLUSTER_DISABLE_AT_ZOOM,
  createPinIcon,
  createClusterIcon,
  buildPopupHTML,
  isMobile,
  calculateMinZoom,
} from '@/lib/utils/mapHelpers'
import MapDrawer from './MapDrawer'
import styles from './EventsMap.module.css'

export default function EventsMap({ events }) {
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const clusterRef = useRef(null)
  const [drawerEvent, setDrawerEvent] = useState(null)
  const [isDrawerOpen, setIsDrawerOpen] = useState(false)

  const handleCloseDrawer = useCallback(() => {
    setIsDrawerOpen(false)
    setDrawerEvent(null)
  }, [])

  // Initialise the Leaflet map instance once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    const minZoom = calculateMinZoom(containerRef.current)

    const map = L.map(containerRef.current, {
      center: ADELAIDE_CENTER,
      zoom: DEFAULT_ZOOM,
      minZoom,
      worldCopyJump: true,
      zoomControl: false,
      attributionControl: false,
    })

    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      maxZoom: 19,
      subdomains: 'abcd',
      noWrap: false,
    }).addTo(map)

    L.control.zoom({ position: 'topright' }).addTo(map)

    // Recalculate minZoom on resize to prevent dark tile gaps
    map.on('resize', () => {
      const worldBounds = L.latLngBounds([[-85, -180], [85, 180]])
      const newMinZoom = Math.max(Math.ceil(map.getBoundsZoom(worldBounds, false)), 2)
      map.setMinZoom(newMinZoom)
    })

    mapRef.current = map

    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [])

  // Sync markers with the filtered events prop
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    if (clusterRef.current) {
      map.removeLayer(clusterRef.current)
    }

    const eventsWithCoordinates = events.filter(
      (event) => event.lat && event.lng
    )

    const clusterGroup = L.markerClusterGroup({
      maxClusterRadius: CLUSTER_MAX_RADIUS,
      disableClusteringAtZoom: CLUSTER_DISABLE_AT_ZOOM,
      spiderfyOnMaxZoom: true,
      showCoverageOnHover: false,
      iconCreateFunction: createClusterIcon,
    })

    for (const event of eventsWithCoordinates) {
      const pinColor = CATEGORY_PIN_COLORS[event.category] || COLOR_EMBER
      const marker = L.marker([event.lat, event.lng], {
        icon: createPinIcon(pinColor),
      })

      marker.on('click', () => {
        if (isMobile()) {
          map.closePopup()
          setDrawerEvent(event)
          setIsDrawerOpen(true)
        } else {
          L.popup({ closeButton: true, maxWidth: 260, className: '' })
            .setLatLng([event.lat, event.lng])
            .setContent(buildPopupHTML(event))
            .openOn(map)
        }
      })

      clusterGroup.addLayer(marker)
    }

    map.addLayer(clusterGroup)
    clusterRef.current = clusterGroup

    if (eventsWithCoordinates.length === 1) {
      const singleEvent = eventsWithCoordinates[0]
      map.flyTo([singleEvent.lat, singleEvent.lng], SINGLE_MARKER_ZOOM, {
        duration: 0.8,
      })
    } else if (eventsWithCoordinates.length > 1) {
      const bounds = L.latLngBounds(
        eventsWithCoordinates.map((event) => [event.lat, event.lng])
      )
      map.fitBounds(bounds, {
        padding: FIT_BOUNDS_PADDING,
        maxZoom: FIT_BOUNDS_MAX_ZOOM,
        animate: true,
      })
    }
  }, [events])

  return (
    <>
      <div ref={containerRef} className={styles.mapContainer} />
      <MapDrawer
        event={drawerEvent}
        isOpen={isDrawerOpen}
        onClose={handleCloseDrawer}
      />
    </>
  )
}
