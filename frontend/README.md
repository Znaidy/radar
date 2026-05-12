# Frontend

React 19 + TypeScript + Vite frontend for Radar.

## Dev

```bash
npm install
npm run dev      # http://localhost:5173 (proxies /api → :8000)
```

## Build

```bash
npm run build    # outputs to ../frontend-dist/, served by FastAPI
```

## Stack

- React 19, TypeScript
- Vite + @tailwindcss/vite
- shadcn/ui (Base UI primitives)
- lucide-react icons
- sonner toasts
