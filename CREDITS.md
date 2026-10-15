# Credits

Third-party code and assets in this repository, with their licences.

| What | Version | Where | Licence |
|---|---|---|---|
| [three.js](https://threejs.org/) | 0.186.1 | `vendor/three/` | MIT (`vendor/three/LICENSE`) |
| [Rapier](https://rapier.rs/) (`@dimforge/rapier3d-compat`) | 0.21.0 | `vendor/rapier/` | Apache-2.0 (`vendor/rapier/LICENSE`) |
| [lil-gui](https://lil-gui.georgealways.com/) | 0.21.0 | `vendor/lil-gui/` | MIT (`vendor/lil-gui/LICENSE.md`) |
| [Barlow and Barlow Condensed](https://github.com/jpt/barlow) fonts | Google Fonts v13 | `assets/fonts/` | SIL Open Font License 1.1 (`assets/fonts/OFL.txt`) |
| [Playwright](https://playwright.dev/) (tests only, not shipped) | 1.56.1 | `package.json` | Apache-2.0 |

To update a library: download the new version from npm, replace its files in `vendor/`, update this table, and run `npm test` and `npm run smoke`.
