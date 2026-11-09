# Handoff

Verified clone-to-run commands in a clean temporary source copy without .env,
node_modules or build output, using Node 22.23.4, npm 10.9.9 and local PostgreSQL 18. Dependency installation passed offline and with normal registry/cache behavior
(audit/funding output disabled). Used a separate disposable database/runtime role;
the user's board database was not reset.

Passed: initial setup.ps1 creates .env and stops for credentials; configured
setup.ps1 and root npm run setup seed successfully; scripts/start.ps1 starts both
servers; frontend HTML and GraphQL discovery, 25-task page and 60-task summary
work through the Vite proxy. Compiled npm start plus frontend preview/proxy passed.
Backend-only dev honors PowerShell PORT=4001; frontend-origin CORS preflight passed.
All PowerShell wrappers parse correctly. scripts/verify.ps1 passed lint,
typechecks, 51 backend and 10 frontend mocked tests, and both builds.

Windows blocks direct .ps1 execution under the current policy. README now gives
process-only wrapper invocations, recommends npm.cmd, and explains PostgreSQL
service/superuser prerequisites and credential editing. Sandbox restrictions
required rerunning setup, Vite verification and live checks outside the sandbox.
No executable code changes or new tests. Original transcripts unchanged.

Next: user review. These are local smoke results, not proof for every machine;
PostgreSQL installation, credentials, ports and package availability remain local
prerequisites.
