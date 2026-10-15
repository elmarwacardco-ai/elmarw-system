import test from 'node:test'
import assert from 'node:assert/strict'
import { clientWhatsAppUrl } from './whatsapp.js'

test('local Egyptian number opens only a manual WhatsApp chat', () => {
  assert.equal(clientWhatsAppUrl('01012345678'), 'https://wa.me/201012345678')
  assert.equal(clientWhatsAppUrl('01112345678'), 'https://wa.me/201112345678')
  assert.equal(clientWhatsAppUrl('01212345678'), 'https://wa.me/201212345678')
  assert.equal(clientWhatsAppUrl('01512345678'), 'https://wa.me/201512345678')
})

test('accepts international form without adding duplicate country code', () => {
  assert.equal(clientWhatsAppUrl('+201012345678'), 'https://wa.me/201012345678')
  assert.equal(clientWhatsAppUrl('201012345678'), 'https://wa.me/201012345678')
  assert.equal(clientWhatsAppUrl('010 1234-5678'), 'https://wa.me/201012345678')
})

test('blocks malformed or unverified phone strings and injected URLs', () => {
  for (const value of ['','010123','+201012345678?text=test',
    'javascript:alert(1)', '0123abc5678', null, '015123456789']) {
    assert.equal(clientWhatsAppUrl(value), null)
  }
})
