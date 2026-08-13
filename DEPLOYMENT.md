# Minute to Win It v0.1.0 — Deployment

## 1. GitHub
Create a new repository (recommended name: `minute-to-win-it`) and upload the contents of the full-source package so `render.yaml`, `package.json`, `client/`, and `server/` are at the repository root.

## 2. Render Blueprint
In Render choose **New → Blueprint**, connect the GitHub repository, and deploy the root `render.yaml`.

Blueprint service:
- name: `minute-to-win-it-classroom-260813-a7f3`
- runtime: Node
- region: Singapore
- plan: Free
- build: `npm ci && npm run build -w server`
- start: `npm run start -w server`
- auto deploy: each commit

Expected WebSocket endpoint:
`wss://minute-to-win-it-classroom-260813-a7f3.onrender.com`

No client HTTP health-check/wake request is used.

## 3. itch.io
Upload `Minute-to-Win-It-v0.1.0-itch.io.zip` as an HTML project. The ZIP already has `index.html` at its root and uses relative asset paths.

Recommended settings:
- Kind of project: HTML
- Mobile friendly: enabled
- Embed in page or click to launch/fullscreen according to your normal classroom setup

## 4. Test sequence
1. Open the itch build and host a room.
2. Join from a second device with the five-digit code.
3. Select **Lights Out**, create matchups, and start.
4. Confirm both devices complete five starts and the lower penalised median wins.
5. Return to lobby and select **Time Stop**.
6. Confirm both players receive the same three targets and the lower total error wins.
7. During one active match, reload/disconnect one device and confirm it resumes inside the 20-second grace window.
