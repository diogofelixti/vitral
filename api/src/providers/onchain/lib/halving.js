// Lives in lib/, not flat in providers/onchain/: registry.js discovers a
// provider from every top-level .js file in a capability directory and
// requires each one to have a default export carrying an .id. This file
// has neither -- it's shared math, not a provider -- so a lib/
// subdirectory is where code more than one provider needs in common
// belongs; registry.js skips subdirectories entirely.

const INTERVAL = 210_000
const BLOCKS_PER_DAY = 144

/**
 * Derived rather than fetched. Two providers reporting their own halving
 * estimate would disagree by a day or two and the number on the wall would
 * change when a source went down, for no reason the viewer could see.
 */
export function halvingFrom(blockHeight) {
  const blocksLeft = INTERVAL - (blockHeight % INTERVAL)
  return { blocksLeft, estimatedDays: Math.round(blocksLeft / BLOCKS_PER_DAY) }
}
