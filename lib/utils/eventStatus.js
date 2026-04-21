const TODAY_ISO_LENGTH = 10

function toIsoDate(value) {
  if (!value) return ''
  return String(value).slice(0, TODAY_ISO_LENGTH)
}

export function deriveEventStatus(event) {
  const today = new Date().toISOString().slice(0, TODAY_ISO_LENGTH)
  const eventEnd = toIsoDate(event.date_end ?? event.date_sort)
  const deadline = toIsoDate(event.deadline)
  const approvedCount = Number(event.approved_count ?? 0)
  const totalSpots = Number(event.stalls_available ?? 0)
  const isFull = totalSpots > 0 && approvedCount >= totalSpots

  if (event.status === 'cancelled') {
    return {
      key: 'cancelled',
      isOpen: false,
      banner: {
        tone: 'error',
        title: 'Event cancelled',
        description: event.cancel_reason || 'This event is no longer running.',
      },
    }
  }

  if (eventEnd && eventEnd < today) {
    return {
      key: 'past',
      isOpen: false,
      banner: {
        tone: 'muted',
        title: 'This event has ended',
        description: 'Check similar upcoming events below.',
      },
    }
  }

  if (isFull) {
    return {
      key: 'full',
      isOpen: false,
      banner: {
        tone: 'info',
        title: 'Fully booked',
        description: 'All vendor spots for this event have been filled.',
      },
    }
  }

  if (deadline && deadline < today) {
    return {
      key: 'closed',
      isOpen: false,
      banner: {
        tone: 'warn',
        title: 'Applications closed',
        description: 'The application deadline for this event has passed.',
      },
    }
  }

  return { key: 'open', isOpen: true, banner: null }
}

export function deriveApplyState({ event, user, status, hasAppliedThisSession }) {
  if (!status.isOpen) {
    const label = status.key === 'cancelled'
      ? 'Event cancelled'
      : status.key === 'past'
        ? 'Event has ended'
        : status.key === 'full'
          ? 'Event full'
          : 'Applications closed'
    return { kind: 'disabled', label }
  }

  if (!user) {
    const slug = event.slug ?? ''
    const next = slug ? `?next=/events/${encodeURIComponent(slug)}` : ''
    return {
      kind: 'link',
      label: 'Sign up to apply',
      href: `/signup/vendor${next}`,
    }
  }

  if (user.role === 'organiser' || user.role === 'admin') {
    return { kind: 'hidden' }
  }

  if (user.role !== 'vendor') {
    return {
      kind: 'link',
      label: 'Sign up as a vendor to apply',
      href: '/signup/vendor',
    }
  }

  if (hasAppliedThisSession || (event.viewer_application_status && event.viewer_application_status !== 'withdrawn')) {
    const status = event.viewer_application_status
    const label = status === 'approved'
      ? 'Application approved'
      : status === 'rejected'
        ? 'Application not accepted'
        : 'Application submitted'
    return { kind: 'submitted', label }
  }

  return { kind: 'primary', label: 'Apply to this event' }
}
