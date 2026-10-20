shin-wallslice is an automated wallpaper manager. It ingests a single source wallpaper image, crops it to exact aspect ratios and dimensions for common devices, and organizes the outputs for easy use.

## Architecture

### Deployable

shin-wallslice should be kept deployable as a single docker image with no runtime dependencies on other docker images (ex. databases).

shin-wallslice should be optimized for deployment on home NAS systems like [unraid via community apps](https://unraid.net/community/apps).

Support Linux amd64 and arm64 container deployments. Run the application as a non-root user.

## Technology

### Language and repository structure

Both client and server are written in TypeScript.

Enable strict TypeScript checking and use ES modules throughout. Run explicit type checks in addition to builds.

Keep the client and server in separate packages within one repository.

### Package management

Use pnpm for package management and workspace management.

Pin the pnpm version and commit its lockfile.

### Runtime

Use Node.js 24 LTS consistently for local development and Docker.

### Client

The client is written in [Lit](https://lit.dev).

Use Vite for client development and production builds. Prefer Vite ecosystem tools where suitable.

### Server

The server is written in NodeJS using [Fastify](https://fastify.dev).

In production, Fastify serves the built client assets and API through one Node.js process and one exposed port. During development, Vite proxies API requests to Fastify.

Compile the server with TypeScript in watch mode during development and restart it using Node.js watch mode. Production runs compiled JavaScript.

### Testing and code quality

Use Vitest for both packages. Test server routes through Fastify request injection. Use Vitest Browser Mode with Playwright and Chromium for Lit component tests.

Use ESLint with typescript-eslint for linting and Prettier for formatting. Provide root commands for linting, formatting checks, type checking, tests, and builds.

### Configuration

All application runtime configuration should be managed via static JSON files. Development and build tools may use their native configuration formats.

Ship documented default runtime configuration. Allow a read-only JSON file mounted at `/config/config.json` to replace the defaults in Docker. Validate runtime configuration at startup and report clear errors for invalid configuration.

### Data persistence

Any data persistence must be handled only with flat files.

Use `/data` as the container location for persistent application files when persistence is introduced.

## User experience

Low-fidelity user experience mockups are available in ./ui.excalidraw. These mockups are guidelines and may not be followed explicitly should better user experiences prevail or new functionality is added.

### Design system

shin-wallslice is built with the [web awesome](https://webawesome.com) design system.

## Developer preferences

- When an agent needs an answer to a question, use the agent's "question and answer" interface to do so rather than expecting a plain text response.
  - Ask one question at a time
  - Use a select or radio wherever possible with a recommended option
