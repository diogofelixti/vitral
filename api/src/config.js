import { parseDocument, LineCounter } from 'yaml'
import { ConfigSchema as Schema } from './settings/schema.js'

export class ConfigError extends Error {}

export function loadConfig(yamlText) {
  const lineCounter = new LineCounter()
  // Default schema only: `!!js/function` and friends must never execute.
  const doc = parseDocument(yamlText, { lineCounter, schema: 'core' })

  // An unresolved tag (e.g. `!!js/function`) is only a warning to the parser,
  // which otherwise falls back to treating it as a plain string — and that
  // fallback is exactly the executable-YAML door we must keep shut, so it is
  // fatal here. Other warnings (e.g. an anchor name that is merely ambiguous)
  // still resolve to the intended value and must not abort a valid config.
  const tagRefused = doc.warnings.find(w => w.code === 'TAG_RESOLVE_FAILED')
  const problem = doc.errors[0] ?? tagRefused
  if (problem) {
    const message = problem.message.split(/ at line \d+, column \d+:/)[0]
    const line = problem.pos ? lineCounter.linePos(problem.pos[0]).line : null
    fail(message, line)
  }

  const parsed = Schema.safeParse(doc.toJS())
  if (parsed.success) return parsed.data

  const issue = parsed.error.issues[0]
  const path = issue.path.join('.')
  const { node, at } = locate(doc, issue.path)
  const line = node?.range ? lineCounter.linePos(node.range[0]).line : null
  const insideAncestor = at.length && at.length !== issue.path.length
    ? `, inside ${at.join('.')}` : ''
  fail(`${path || '(root)'} — ${issue.message}`, line, insideAncestor)
}

/**
 * The exact key named by `path` may be missing from the source entirely, in
 * which case there is no node there to read a line number from. Walk up to
 * the nearest ancestor that does exist — e.g. the object that should have
 * held the missing key — falling back to the document root.
 */
function locate(doc, path) {
  for (let end = path.length; end > 0; end--) {
    const node = doc.getIn(path.slice(0, end), true)
    if (node) return { node, at: path.slice(0, end) }
  }
  return { node: doc.contents, at: [] }
}

function fail(message, line, extra = '') {
  throw new ConfigError(`config.yaml: ${message}` + (line ? ` (line ${line}${extra})` : ''))
}
