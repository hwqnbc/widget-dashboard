# TestSite — Widget Dashboard SPA

**🔗 Live demo: https://hwqnbc.github.io/widget-dashboard/**

A single-page app for a widget-based website where widgets are **draggable**
and **resizable** on a responsive grid. Layout and widget state persist to
`localStorage`.

## Stack

- **Vite** + **React 19** + **TypeScript**
- **MUI** (Material UI) for components + theming
- **Redux Toolkit** + **react-redux** for state
- **redux-persist** → localStorage for persistence
- **react-router-dom** for routing (Dashboard + Settings)
- **react-grid-layout** for the drag/resize grid
- **ESLint 9** (flat config)

## Scripts

```bash
npm run dev      # start the dev server
npm run build    # type-check (tsc -b) + production build
npm run preview  # preview the production build
npm run lint     # run ESLint
```

## Project structure

```
src/
  app/          Redux store + typed hooks
  features/     Redux slices (widgets, ui) + widget catalog
  registry/     Widget type -> component mapping
  theme/        MUI theme + provider
  components/   AppLayout, WidgetBoard, WidgetCard, widgets/*
  pages/        DashboardPage, SettingsPage
```

## Adding a new widget

1. Add the type to `WidgetType` in `src/features/widgets/types.ts`.
2. Add an entry (title, default size, default data) to
   `src/features/widgets/widgetCatalog.ts`.
3. Create the component in `src/components/widgets/` and register it in
   `src/registry/widgetRegistry.ts`.
