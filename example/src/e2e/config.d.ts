/**
 * Build-time e2e settings. Metro resolves this module (see metro.config.js) to
 * `example/e2e.config.local.json` when the e2e scripts have written one, and to
 * `config.default.json` otherwise. The local file is gitignored: it holds the
 * workspace SDK key for a CI run and is deleted when the run ends.
 */
declare module 'kickflip-e2e-config' {
  const config: {
    /** Show the e2e diagnostics panel. */
    enabled: boolean;
    /** Workspace SDK key; empty keeps the placeholder in attribution.ts. */
    apiKey: string;
  };
  export default config;
}
