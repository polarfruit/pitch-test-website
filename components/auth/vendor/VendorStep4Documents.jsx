'use client'

import { useRef } from 'react'
import styles from '../SignupWizard.module.css'

const DOC_SPECS = [
  {
    key: 'food_safety_cert',
    icon: '📜',
    name: 'Food Safety Certificate',
    requirement: 'Current certificate from an approved Food Safety Supervisor course. Required by most events.',
    optional: false,
  },
  {
    key: 'pli',
    icon: '🛡️',
    name: 'Public Liability Insurance',
    requirement: 'Minimum $10 million coverage. Certificate of currency from your insurer.',
    optional: false,
  },
  {
    key: 'council_permit',
    icon: '🏛️',
    name: 'Council Trading Permit',
    requirement: 'Required by some councils. Check with your local council if you operate in multiple areas.',
    optional: true,
  },
]

export default function VendorStep4Documents({ formData, updateField, onNext, onBack }) {
  const inputRefs = useRef({})

  function handleSelectFile(docKey, event) {
    const file = event.target.files?.[0]
    if (!file) return
    updateField('documents', { ...formData.documents, [docKey]: file.name })
    // Reset native file input so selecting the same filename again still triggers change.
    event.target.value = ''
  }

  function handleRemove(docKey) {
    const nextDocuments = { ...formData.documents }
    delete nextDocuments[docKey]
    updateField('documents', nextDocuments)
  }

  function openFilePicker(docKey) {
    const input = inputRefs.current[docKey]
    if (input) input.click()
  }

  return (
    <div className={styles.form}>
      <h2 className={styles.heading}>Your documents</h2>
      <p className={styles.subtitle}>
        Upload your compliance documents to get a Verified badge. You can add these later, but many organisers require them before approving applications.
      </p>

      <div>
        {DOC_SPECS.map((doc) => {
          const fileName = formData.documents[doc.key]
          return (
            <div key={doc.key} className={styles.docCard}>
              <div className={styles.docHeader}>
                <div className={styles.docHeaderLeft}>
                  <div className={styles.docIcon} aria-hidden="true">{doc.icon}</div>
                  <div>
                    <p className={styles.docName}>{doc.name}</p>
                    <p className={styles.docReq}>{doc.requirement}</p>
                  </div>
                </div>
                {doc.optional ? (
                  <span className={styles.docOptionalTag}>Optional</span>
                ) : null}
              </div>

              <input
                ref={(element) => { inputRefs.current[doc.key] = element }}
                type="file"
                accept=".pdf,.jpg,.jpeg,.png"
                onChange={(event) => handleSelectFile(doc.key, event)}
                style={{ display: 'none' }}
                aria-label={`Upload ${doc.name}`}
              />

              {fileName ? (
                <div className={styles.docUploaded}>
                  <span className={styles.docUploadedIcon}>✓</span>
                  <span className={styles.docUploadedName}>{fileName}</span>
                  <button
                    type="button"
                    className={styles.docRemove}
                    onClick={() => handleRemove(doc.key)}
                    aria-label={`Remove ${doc.name}`}
                  >
                    ✕
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  className={styles.docUploadArea}
                  onClick={() => openFilePicker(doc.key)}
                  style={{ width: '100%' }}
                >
                  <div className={styles.docUploadIcon}>📎</div>
                  <div className={styles.docUploadText}>Click to upload or drag &amp; drop</div>
                  <div className={styles.docUploadHint}>PDF, JPG or PNG · Max 5MB</div>
                </button>
              )}
            </div>
          )
        })}
      </div>

      <div className={styles.docPrivacy}>
        🔒 Documents are reviewed privately by the Pitch. team and never shared publicly. Only your verification status is shown on your profile.
      </div>

      <div className={styles.stepActions}>
        <button type="button" className={styles.backButton} onClick={onBack}>
          ← Back
        </button>
        <button type="button" className={styles.nextButton} onClick={onNext}>
          Next: Choose a plan →
        </button>
      </div>
    </div>
  )
}
