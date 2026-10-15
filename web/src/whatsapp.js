/**
 * Return a manual WhatsApp chat URL for a valid Egyptian mobile number.
 * No message is sent automatically and no text is prefilled.
 */
export function clientWhatsAppUrl(value) {
  const phone = String(value ?? '').replace(/[\s()-]/g, '')
  if (/^01[0125]\d{8}$/.test(phone)) return 'https://wa.me/20' + phone.slice(1)
  if (/^\+201[0125]\d{8}$/.test(phone)) return 'https://wa.me/' + phone.slice(1)
  if (/^201[0125]\d{8}$/.test(phone)) return 'https://wa.me/' + phone
  return null
}
