import { h } from './dom.js'

/** A labelled control with a slot for its error. `path` is the config path the api names in a 422. */
export function field({ label, path, input, hint }) {
  return h('label', { class: 'field', 'data-path': path },
    h('span', { class: 'field-label', text: label }),
    input,
    hint && h('span', { class: 'field-hint', text: hint }),
    h('span', { class: 'field-error', role: 'alert' }))
}

export function clearErrors(root) {
  for (const slot of root.querySelectorAll('.field-error, .form-error')) slot.textContent = ''
  for (const node of root.querySelectorAll('[aria-invalid]')) node.removeAttribute('aria-invalid')
}

/**
 * Each error goes to the field whose path is the longest prefix of the
 * error's path (bitcoin.providers.1 lands on the bitcoin.providers list);
 * anything with no field goes to the form's own error line.
 */
export function showErrors(root, errors, i18n) {
  clearErrors(root)
  const fields = [...root.querySelectorAll('[data-path]')]
  for (const { path, code } of errors) {
    const target = fields
      .filter(f => path === f.dataset.path || path.startsWith(`${f.dataset.path}.`))
      .sort((a, b) => b.dataset.path.length - a.dataset.path.length)[0]
    const message = i18n.t(`fields.${code}`)
    if (target) {
      target.querySelector('.field-error').textContent = message
      target.querySelector('input, select, textarea')?.setAttribute('aria-invalid', 'true')
    } else {
      const line = root.querySelector('.form-error')
      if (line) line.textContent = `${path}: ${message}`
    }
  }
}
