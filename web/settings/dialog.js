import { h } from './dom.js'

let stylesheet
function ensureStylesheet() {
  stylesheet ??= document.head.appendChild(h('link', { rel: 'stylesheet', href: 'settings/settings.css' }))
}

/** A modal on the native <dialog>: focus trap, Escape and the top layer for free. */
export function openDialog({ id, title, i18n, onRequestClose }) {
  ensureStylesheet()
  document.getElementById(id)?.remove()
  const body = h('div', { class: 'settings-body' })
  const footer = h('div', { class: 'settings-footer' })
  const closeButton = h('button', { type: 'button', class: 'settings-close', 'aria-label': i18n.t('settings.close'), text: '×' })
  const dialog = h('dialog', { id, class: 'settings-dialog', 'aria-labelledby': `${id}-title` },
    h('header', { class: 'settings-header' }, h('h2', { id: `${id}-title`, text: title }), closeButton),
    body, footer)
  const close = () => { dialog.close(); dialog.remove() }
  const request = event => { event?.preventDefault(); (onRequestClose ?? close)() }
  closeButton.addEventListener('click', () => request())
  dialog.addEventListener('cancel', request) // Escape
  document.body.append(dialog)
  dialog.showModal()
  return { dialog, body, footer, close }
}
