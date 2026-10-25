# Changelog

## [1.0.0](https://github.com/aimuzov/zen-money-mcp/compare/v0.1.0...v1.0.0) (2026-10-25)


### ⚠ BREAKING CHANGES

* Node 26 is required, and the package is published as @aimuzov/zen-money-mcp.

### Features

* configurable OAuth redirect URI (ZEN_REDIRECT_URI) ([07c1365](https://github.com/aimuzov/zen-money-mcp/commit/07c13654b0cb2738117a01dd249aecd5ba6ed870))
* import missing transactions from Ozon bank PDF statements ([7496eef](https://github.com/aimuzov/zen-money-mcp/commit/7496eef5647a82dd0f9e45f1c427f9662daa79f7))
* move onto infra-mcp-kit and the shared MCP server stack ([927210e](https://github.com/aimuzov/zen-money-mcp/commit/927210e75363c4b59b0b655bb1cdb45f4d084d48))
* ZenMoney MCP server for auditing transaction categories (phases 1-2) ([4602cd0](https://github.com/aimuzov/zen-money-mcp/commit/4602cd0a5e28fc3bf9e5e4f6082f7000412e2a5e))


### Bug Fixes

* **deps:** move to infra-mcp-kit v1.0.1, which installs with build/ from GitHub ([0cc8520](https://github.com/aimuzov/zen-money-mcp/commit/0cc85209de15f11b6555e00a2b5bf9ed45fc9580))
* load .env from project root regardless of cwd ([a718f70](https://github.com/aimuzov/zen-money-mcp/commit/a718f700605c6d42f07e39ba7f19dbd7e02b963f))
* real-data sync and expense audit ([40f465d](https://github.com/aimuzov/zen-money-mcp/commit/40f465d731804930238af2cf8945b5f924f8a626))
