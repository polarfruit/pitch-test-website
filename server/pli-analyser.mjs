/**
 * pli-analyser.mjs — Extracts and validates PLI certificate details from PDFs/images.
 *
 * Extracts: insured name, policy number, coverage amount, expiry date.
 * Flags issues: expired, low coverage (<$10M), name mismatch vs ABN entity.
 */

// Use pdf-parse/lib to avoid the test-file-loading bug in v1's index.js
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const pdfParse = require('pdf-parse/lib/pdf-parse.js');

// ── Text extraction ─────────────────────────────────────────────────────────

export async function extractTextFromDataUrl(dataUrl) {
  if (!dataUrl || !dataUrl.startsWith('data:')) return null;

  const mimeMatch = dataUrl.match(/^data:([^;]+);base64,/);
  if (!mimeMatch) return null;
  const mime = mimeMatch[1];
  const base64 = dataUrl.replace(/^data:[^;]+;base64,/, '');
  const buffer = Buffer.from(base64, 'base64');

  if (mime === 'application/pdf' || mime === 'application/octet-stream') {
    try {
      const pdf = await pdfParse(buffer);
      return pdf.text || '';
    } catch (e) {
      console.error('[pli-analyser] PDF parse error:', e.message);
      return null;
    }
  }

  // For images (jpg/png) we can't extract text without OCR — return null
  return null;
}

// ── Pattern matching ────────────────────────────────────────────────────────

function parseAmount(text) {
  // Match dollar amounts: $10,000,000 or $10M or $10 million or 10,000,000
  const patterns = [
    /\$\s*([\d,]+(?:\.\d{2})?)\s*(?:million|mil|m)\b/gi,
    /\$([\d,]+(?:\.\d{2})?)/g,
    /([\d,]+(?:\.\d{2})?)\s*(?:million|mil)\b/gi,
  ];

  let highest = 0;

  // "$10 million" style
  for (const m of text.matchAll(patterns[0])) {
    const val = parseFloat(m[1].replace(/,/g, '')) * 1_000_000;
    if (val > highest) highest = val;
  }

  // "$10,000,000" style
  for (const m of text.matchAll(patterns[1])) {
    const val = parseFloat(m[1].replace(/,/g, ''));
    if (val > highest) highest = val;
  }

  // "10 million" (no dollar sign)
  for (const m of text.matchAll(patterns[2])) {
    const val = parseFloat(m[1].replace(/,/g, '')) * 1_000_000;
    if (val > highest) highest = val;
  }

  return highest || null;
}

function formatAmount(num) {
  if (!num) return null;
  if (num >= 1_000_000) return `$${(num / 1_000_000).toFixed(0)}M`;
  if (num >= 1_000) return `$${(num / 1_000).toFixed(0)}K`;
  return `$${num}`;
}

function parseDates(text) {
  const dates = [];

  // DD/MM/YYYY or DD-MM-YYYY
  for (const m of text.matchAll(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/g)) {
    const [, d, mo, y] = m;
    const date = new Date(parseInt(y), parseInt(mo) - 1, parseInt(d));
    if (!isNaN(date.getTime()) && date.getFullYear() > 2020) {
      dates.push({ date, raw: m[0] });
    }
  }

  // "1 January 2026" / "1st January 2026" / "January 1, 2026"
  const months = 'january|february|march|april|may|june|july|august|september|october|november|december';
  const longDateRe = new RegExp(`(\\d{1,2})(?:st|nd|rd|th)?\\s+(${months})\\s+(\\d{4})`, 'gi');
  for (const m of text.matchAll(longDateRe)) {
    const date = new Date(`${m[2]} ${m[1]}, ${m[3]}`);
    if (!isNaN(date.getTime())) dates.push({ date, raw: m[0] });
  }

  const longDateRe2 = new RegExp(`(${months})\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(\\d{4})`, 'gi');
  for (const m of text.matchAll(longDateRe2)) {
    const date = new Date(`${m[1]} ${m[2]}, ${m[3]}`);
    if (!isNaN(date.getTime())) dates.push({ date, raw: m[0] });
  }

  return dates;
}

function findExpiry(text, allDates) {
  // Look for dates near expiry-related keywords
  const expiryKeywords = /expir|renewal|end\s+date|period\s+(?:of\s+)?(?:insurance\s+)?to|valid\s+(?:until|to|through)|cover\s+(?:ends?|to)|policy\s+(?:end|to)|insured\s+(?:until|to)/i;

  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (expiryKeywords.test(lines[i])) {
      // Check this line and the next 2 lines for a date
      const chunk = lines.slice(i, i + 3).join(' ');
      const dates = parseDates(chunk);
      if (dates.length > 0) {
        // Return the latest date found near the keyword (most likely the end date)
        return dates.sort((a, b) => b.date - a.date)[0];
      }
    }
  }

  // Fallback: if we find a "from DATE to DATE" pattern anywhere
  const rangeMatch = text.match(/from\s+.{5,30}?\s+to\s+(.{5,30})/i);
  if (rangeMatch) {
    const dates = parseDates(rangeMatch[1]);
    if (dates.length) return dates[0];
  }

  // Last resort: return the furthest future date (likely the expiry)
  if (allDates.length >= 2) {
    return allDates.sort((a, b) => b.date - a.date)[0];
  }

  return null;
}

function findPolicyNumber(text) {
  const patterns = [
    /policy\s*(?:no\.?|number|#|num)?\s*:?\s*([A-Z0-9][A-Z0-9\-\/]{3,20})/i,
    /certificate\s*(?:no\.?|number|#)?\s*:?\s*([A-Z0-9][A-Z0-9\-\/]{3,20})/i,
    /reference\s*(?:no\.?|number|#)?\s*:?\s*([A-Z0-9][A-Z0-9\-\/]{3,20})/i,
    /\b(POL[A-Z0-9\-]{5,15})\b/,
    /\b([A-Z]{2,4}\d{5,12})\b/,
  ];

  for (const re of patterns) {
    const m = text.match(re);
    if (m) return m[1].trim();
  }
  return null;
}

function findInsuredName(text) {
  const patterns = [
    /(?:insured|policy\s*holder|named\s*insured|the\s*insured)\s*(?:name)?\s*:?\s*(.+)/i,
    /(?:name\s*of\s*insured)\s*:?\s*(.+)/i,
    /(?:insured\s*party)\s*:?\s*(.+)/i,
  ];

  for (const re of patterns) {
    const m = text.match(re);
    if (m) {
      // Clean up: take first line, remove trailing junk
      let name = m[1].split('\n')[0].trim();
      name = name.replace(/\s*(ABN|ACN|trading as|t\/a|policy|address|date).*$/i, '').trim();
      if (name.length > 2 && name.length < 120) return name;
    }
  }
  return null;
}

function isPublicLiability(text) {
  const keywords = /public\s*liability|general\s*liability|third\s*party\s*liability|broadform\s*liability|CGL|commercial\s*general/i;
  return keywords.test(text);
}

// ── Name matching ───────────────────────────────────────────────────────────

function normalise(str) {
  return (str || '').toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
}

function namesMatch(pliName, abnEntityName, tradingName) {
  if (!pliName) return 'unknown';
  const pliNorm = normalise(pliName);
  if (!abnEntityName && !tradingName) return 'unknown';

  // Check against ABN entity name
  if (abnEntityName) {
    const abnNorm = normalise(abnEntityName);
    if (pliNorm.includes(abnNorm) || abnNorm.includes(pliNorm)) return 'match';
    // Check word overlap (at least 2 words match)
    const pliWords = pliNorm.split(' ').filter(w => w.length > 2);
    const abnWords = abnNorm.split(' ').filter(w => w.length > 2);
    const overlap = pliWords.filter(w => abnWords.includes(w));
    if (overlap.length >= 2) return 'match';
  }

  // Check against trading name
  if (tradingName) {
    const tradNorm = normalise(tradingName);
    if (pliNorm.includes(tradNorm) || tradNorm.includes(pliNorm)) return 'match';
  }

  return 'mismatch';
}

// ── Main analysis function ──────────────────────────────────────────────────

const MIN_COVERAGE = 10_000_000; // $10M

export async function analysePli(dataUrl, vendor = {}) {
  const result = {
    insured_name: null,
    policy_number: null,
    coverage_amount: null,
    expiry: null,
    status: 'pending',
    flags: [],
  };

  const text = await extractTextFromDataUrl(dataUrl);
  if (!text) {
    result.status = 'pending';
    result.flags.push('Could not extract text — manual review required');
    return result;
  }

  // Check it's actually a PLI certificate
  if (!isPublicLiability(text)) {
    result.flags.push('Document may not be a public liability insurance certificate');
  }

  // Extract fields
  result.insured_name = findInsuredName(text);
  result.policy_number = findPolicyNumber(text);

  const amount = parseAmount(text);
  result.coverage_amount = formatAmount(amount);

  const allDates = parseDates(text);
  const expiry = findExpiry(text, allDates);
  if (expiry) {
    result.expiry = expiry.date.toISOString().split('T')[0]; // YYYY-MM-DD
  }

  // ── Validation flags ──────────────────────────────────────────────────

  // Check coverage meets minimum
  if (amount && amount < MIN_COVERAGE) {
    result.flags.push(`Coverage is ${formatAmount(amount)} — minimum $10M required`);
  }

  // Check expiry
  if (result.expiry) {
    const expiryDate = new Date(result.expiry);
    const now = new Date();
    const daysUntilExpiry = Math.ceil((expiryDate - now) / (1000 * 60 * 60 * 24));

    if (daysUntilExpiry < 0) {
      result.flags.push(`Policy expired on ${result.expiry}`);
    } else if (daysUntilExpiry <= 30) {
      result.flags.push(`Policy expires in ${daysUntilExpiry} days (${result.expiry})`);
    }
  } else {
    result.flags.push('Could not determine expiry date');
  }

  // Check insured name matches vendor
  if (result.insured_name) {
    const nameResult = namesMatch(result.insured_name, vendor.abn_entity_name, vendor.trading_name);
    if (nameResult === 'mismatch') {
      result.flags.push(`Insured name "${result.insured_name}" does not match business name`);
    }
  } else {
    result.flags.push('Could not determine insured name');
  }

  // Determine overall status
  const hasExpired = result.expiry && new Date(result.expiry) < new Date();
  const hasCriticalFlag = result.flags.some(f =>
    f.includes('expired') || f.includes('does not match') || f.includes('not be a public liability')
  );

  if (hasExpired) {
    result.status = 'expired';
  } else if (hasCriticalFlag || result.flags.length > 2) {
    result.status = 'flagged';
  } else if (amount && amount >= MIN_COVERAGE && result.expiry && result.insured_name) {
    result.status = 'verified';
  } else {
    result.status = 'flagged';
  }

  return result;
}
