/**
 * ascii-widget.js — Static "perc.store" hero branding
 * "perc" in white, ".store" in pink. No glitch, no animation.
 */

export function initAsciiWidget(container) {
  if (!container) return;
  container.innerHTML = 'perc<span class="accent">.store</span>';
}
