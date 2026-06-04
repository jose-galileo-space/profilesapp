# CONTEXT.md — galileo-website (React Frontend)

Analyst-facing dashboard for the OrbitalStack pipeline. Built with React + Vite,
deployed via AWS Amplify.

---

## Stack

| Item | Value |
|------|-------|
| Framework | React (JSX) + Vite |
| Auth | AWS Amplify (`@aws-amplify/ui-react`) |
| Map | Leaflet + react-leaflet |
| Routing | react-router-dom |
| Deploy | AWS Amplify hosting |

---

## What it does

- Displays the latest 12 processed satellite images from `GetImagesFunc` (Function URL)
- Shows a JIT-generated "Mission Briefing" (2-sentence Gemini synthesis)
- Renders YOLOv8 bounding boxes on the map via Leaflet
- Allows analysts to POST satellite tasking commands via `POST /task`

---

## Data Flow

```
GetImagesFunc (ARM64 Lambda, Function URL)
    → returns: { mission_summary, focus_classes, images[] }
    → images[].vehicle_data → Leaflet bounding box overlay
    → images[].gemini_analysis → Sidebar intelligence panel
```

---

## TODO

- Replace hardcoded `jose-test-user` with Amplify Auth (`getCurrentUser()`)
- Reports Engine UI (select images → POST /reports → POST /reports/{id}/analyze)
- RF detection overlay layer (future — when MuSTeR fusion results land in OrbTable)
