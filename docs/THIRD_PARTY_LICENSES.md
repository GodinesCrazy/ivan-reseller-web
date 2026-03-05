# Third-party licenses and attributions

This document lists dependencies used in this project and their licenses. It supports compliance with attribution requirements for BSD, Apache-2.0, MPL-2.0, and similar licenses.

## How to regenerate

From the repository root:

- **Backend:** `cd backend && npx license-checker --csv`
- **Frontend:** `cd frontend && npx license-checker --csv`

To produce a JSON report: `npx license-checker --json`.

## Backend dependencies (summary)

Backend direct dependencies and their licenses are declared in `backend/package.json`. The full dependency tree (including transitive) can be listed with `cd backend && npx license-checker --csv`. Main licenses found in the backend tree: MIT, ISC, Apache-2.0, BSD-2-Clause, BSD-3-Clause, MPL-2.0.

## Frontend dependencies (summary)

Frontend direct dependencies and their licenses are in `frontend/package.json`. Full tree: `cd frontend && npx license-checker --csv`. Main licenses in the frontend tree: MIT, ISC, Apache-2.0, BSD-2-Clause, BSD-3-Clause, MIT-0, CC0-1.0.

## Licenses requiring attribution

The following license types require that redistributions include a copy of the license and/or a notice of attribution. This section provides standard references and, where useful, short attribution text.

### BSD-2-Clause

Packages under BSD-2-Clause (e.g. parts of typescript-eslint) require retention of the copyright notice and the two conditions. Full text: https://opensource.org/licenses/BSD-2-Clause.

### BSD-3-Clause

Packages under BSD-3-Clause (e.g. @humanwhocodes/object-schema, @mapbox/node-pre-gyp, @sinonjs/commons, @sinonjs/fake-timers, babel-plugin-istanbul) require retention of the copyright notice and the three conditions. Full text: https://opensource.org/licenses/BSD-3-Clause.

### Apache-2.0

Packages under Apache-2.0 (e.g. Prisma, Discord.js, Puppeteer, @humanwhocodes/*, @ampproject/remapping) require retention of the license and a notice of any changed files. Full text: https://www.apache.org/licenses/LICENSE-2.0.

### MPL-2.0

Packages under MPL-2.0 (e.g. @cliqz/adblocker*, @remusao/*) require that source files under MPL-2.0 remain under MPL-2.0 and that the license and notices are retained. Full text: https://www.mozilla.org/en-US/MPL/2.0/.

### CC-BY-4.0

If any dependency uses CC-BY-4.0, attribution and a link to the license are required. Full text: https://creativecommons.org/licenses/by/4.0/legalcode.

## Project license

This project is licensed under the MIT License. See the [LICENSE](../LICENSE) file in the repository root.
