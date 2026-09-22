export function createViewRenderCoordinator({ renderShared, renderers, renderAfter }) {
  if (typeof renderShared !== "function") {
    throw new TypeError("renderShared must be a function");
  }

  const pageRenderers = { ...renderers };
  const after = typeof renderAfter === "function" ? renderAfter : () => {};

  return Object.freeze({
    render(viewId) {
      renderShared(viewId);
      pageRenderers[viewId]?.();
      after(viewId);
      return Object.prototype.hasOwnProperty.call(pageRenderers, viewId);
    },
    has(viewId) {
      return Object.prototype.hasOwnProperty.call(pageRenderers, viewId);
    }
  });
}
