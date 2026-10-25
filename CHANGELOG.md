# Changelog

## [1.0.1](https://github.com/aimuzov/zen-money-mcp/compare/v1.0.0...v1.0.1) (2026-10-25)


### Bug Fixes

* **api:** check HTTP status in fetchDiff ([b0f2407](https://github.com/aimuzov/zen-money-mcp/commit/b0f24072e935e548792fe0f7ad14b569003addce))
* **auth:** keep transient token errors apart from rejected grants ([561c3c4](https://github.com/aimuzov/zen-money-mcp/commit/561c3c4d0199f588de697a0cafa85e7e76935c07))
* **auth:** report a busy OAuth callback port instead of crashing ([c65ef12](https://github.com/aimuzov/zen-money-mcp/commit/c65ef1219d1c1b3b222b175cb5339b6c7386544f))
* **auth:** surface unreadable token file instead of treating it as missing ([d372127](https://github.com/aimuzov/zen-money-mcp/commit/d3721275856e8c013464ffd22aa672ef2560c003))
* **config:** reject invalid env values and load config lazily ([9366bcf](https://github.com/aimuzov/zen-money-mcp/commit/9366bcf5840109e4501eedf78056b90684a5c1f4))
* **import:** make writes safe to retry after a local cache failure ([12d9d73](https://github.com/aimuzov/zen-money-mcp/commit/12d9d73bbd286c32e9a57f35ca3f33f50aac747c))
* stop hiding ZenMoney write, token and config errors ([55142bf](https://github.com/aimuzov/zen-money-mcp/commit/55142bf733cecca15f82139fc1ca130c40152c1f))

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
