// The image assembly enumerates real CSS files; arbitrary config strings never become URLs.
export async function loadThemes() {
  try {
    const list = await (await fetch('themes/index.json')).json()
    const themes = list.filter(name => typeof name === 'string' && /^[a-z][a-z0-9-]*$/.test(name))
    if (!themes.length) throw new Error('empty theme index')
    await Promise.all(themes.map(name => new Promise(resolve => {
      const link = document.createElement('link')
      link.rel = 'stylesheet'
      link.href = `themes/${name}.css`
      link.onload = link.onerror = resolve
      document.head.append(link)
    })))
    return themes
  } catch { return ['terminal'] }
}
