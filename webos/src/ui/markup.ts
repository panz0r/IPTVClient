export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function escapeAttr(s: string): string {
  return escapeHtml(s).replace(/"/g, '&quot;');
}

export function posterCardHtml(options: {
  title: string;
  imageUrl: string | null;
  placeholderIcon: string;
  attrs: string;
  progress?: number;
}): string {
  const img = options.imageUrl
    ? `<img src="${escapeAttr(options.imageUrl)}" alt="" loading="lazy" />`
    : `<span class="poster-placeholder" aria-hidden="true">${options.placeholderIcon}</span>`;
  let progressBar = '';
  if (options.progress != null && options.progress > 0) {
    const pct = Math.min(100, options.progress * 100);
    progressBar =
      '<div class="poster-progress"><span style="width:' +
      pct +
      '%"></span></div>';
  }
  return [
    `<article class="poster-card focusable" tabindex="0" data-clickable="true" ${options.attrs}>`,
    `<div class="poster-card__image">${img}${progressBar}</div>`,
    `<span class="poster-card__title">${escapeHtml(options.title)}</span>`,
    `</article>`,
  ].join('');
}

export function contentTileHtml(options: {
  title: string;
  imageUrl: string | null;
  attrs: string;
}): string {
  const img = options.imageUrl
    ? `<img src="${escapeAttr(options.imageUrl)}" alt="" ` +
      `onerror="this.classList.add('content-tile__img--broken')" />`
    : '';
  const placeholder =
    '<span class="content-tile__placeholder" aria-hidden="true">▶</span>';
  return [
    `<article class="content-tile focusable" tabindex="0" data-clickable="true" ${options.attrs}>`,
    `<div class="content-tile__media">${img}${placeholder}</div>`,
    `<span class="content-tile__title">${escapeHtml(options.title)}</span>`,
    `</article>`,
  ].join('');
}

export function hubRowHtml(
  title: string,
  rowId: string,
  postersHtml: string,
  itemCount: number,
): string {
  return [
    `<section class="hub-row" data-row-id="${escapeAttr(rowId)}">`,
    `<div class="content-row">`,
    `<h2 class="content-row__title">${escapeHtml(title)}</h2>`,
    `<button type="button" class="content-row__see-all focusable" data-see-all="${escapeAttr(rowId)}" tabindex="0">`,
    `See all (${itemCount})`,
    `</button>`,
    `</div>`,
    `<div class="horizontal-poster-row-clip"><div class="horizontal-poster-row">${postersHtml}</div></div>`,
    `</section>`,
  ].join('');
}

export function loadingStateHtml(message: string): string {
  return `<div class="state-panel"><div class="spinner" aria-hidden="true"></div><p>${escapeHtml(message)}</p></div>`;
}

export function errorStateHtml(message: string, retryId: string): string {
  return `<div class="state-panel state-panel--error">
    <p class="error-banner">${escapeHtml(message)}</p>
    <button type="button" class="btn filled focusable" id="${escapeAttr(retryId)}" tabindex="0">Retry</button>
  </div>`;
}

export function emptyStateHtml(message: string): string {
  return `<div class="state-panel"><p class="state-panel__message">${escapeHtml(message)}</p></div>`;
}

