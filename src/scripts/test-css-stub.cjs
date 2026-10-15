// Lets node:test import components that use CSS (Next.js bundles these in the app).
// A CSS module resolves to an object whose class names equal their keys.
const classNames = new Proxy({}, { get: (_target, key) => (key === "__esModule" ? false : typeof key === "string" ? key : undefined) });

require.extensions[".css"] = (module, filename) => {
  module.exports = filename.endsWith(".module.css") ? classNames : {};
};
