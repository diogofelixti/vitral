const PROPERTIES = new Set(['value', 'checked', 'disabled', 'selected', 'hidden', 'open'])
const DANGEROUS_URL = /^\s*javascript:/i

/**
 * The only way the settings build DOM. Text goes in as text nodes and
 * attributes through setAttribute: there is no path from a value to markup.
 */
export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag)
  for (const [key, value] of Object.entries(props)) {
    if (value === undefined || value === null || value === false) continue
    if (key === 'class') el.className = value
    else if (key === 'text') el.textContent = value
    // a non-function "on*" value is never an attribute either: it would be markup with a live handler
    else if (key.startsWith('on')) { if (typeof value === 'function') el.addEventListener(key.slice(2), value) }
    else if (PROPERTIES.has(key)) el[key] = value
    else if ((key === 'href' || key === 'src') && DANGEROUS_URL.test(String(value))) { /* refuse a javascript: address */ }
    else el.setAttribute(key, value === true ? '' : String(value))
  }
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false) continue
    el.append(child instanceof Node ? child : document.createTextNode(String(child)))
  }
  return el
}
