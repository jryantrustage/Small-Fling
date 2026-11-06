# Copilot Instructions for DIXUI

Trustage FIcus frontend that displays life insurance applications. It supports both **agent-assisted (AA)** and **direct-to-consumer (DTC)** flows, receiving form navigation informationfrom an API called 'InsuranceApp'. 'DIxuI' will navigate to the next **segment** based ondisplay data it receives from 'InsuranceApp'. The display data is then translated to UI elementsvia a FIcus shared library called 'commonUI'.

---

## Build, Test, and Lint

、*"bash
npm start  # Dev server (Create React App)
npm run build# Production build
npm run lint # EsLint (all .ts/.tsx files)
npm run lint:fix  # EsLint with auto-fix
npm test  # Jest with coverage + watch mode
npm run test-only  # Jest without watch (CI-friendly)
npm run storybook  # Storybook on port 9o10