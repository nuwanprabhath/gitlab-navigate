// Files that belong in the repo but not inside the packaged extension.
// Without this, web-ext bundles the screenshot tooling, tests and docs into the
// .xpi and flags tools/screenshot.sh as an unexpected file extension.
module.exports = {
  ignoreFiles: [
    'tools',
    'docs',
    'test',
    'icon.svg',
    'extension-key.pem',
    'web-ext-config.cjs',
    '*.md',
  ],
};
