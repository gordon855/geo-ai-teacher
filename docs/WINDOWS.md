# Windows local operation

Docker Desktop is already installed and verified on the acceptance machine.
Other users should follow [Docker's Windows installation instructions](https://docs.docker.com/desktop/setup/install/windows-install/).
This project requires Linux containers. Any Windows feature, BIOS or WSL change
must be performed deliberately by the operator; project scripts do not change it.

Open a new PowerShell in the checkout:

```powershell
docker version
docker compose version
docker run --rm hello-world
npm ci
# Run setup only when .env does not already exist:
npm run demo:setup
docker compose config --quiet
docker compose up --build --wait --wait-timeout 300
docker compose ps
```

If an old terminal cannot locate Docker, reopen it. For the verified all-users
install location, this session-only fallback exposes both docker.exe and its
credential helper without editing system settings:

```powershell
$dockerBin='C:\Program Files\Docker\Docker\resources\bin'
if (Test-Path (Join-Path $dockerBin 'docker.exe')) {
  $env:PATH=$dockerBin+';'+$env:PATH
}
docker version
docker compose version
```

Visit http://localhost:3000/teacher/login or /student/login. Keep .env local.
Leave the generated project name unchanged so the same volumes are mounted.
If port 3000 is occupied, inspect and intentionally select a different host port
and matching CLASSROOM_PUBLIC_ORIGIN; the acceptance script supports port 3000
only. Do not terminate unrelated processes.

Use docker compose stop / docker compose up --wait for routine pauses.
[Compose up](https://docs.docker.com/reference/cli/docker/compose/up/) waits for
health with --wait; [Compose down](https://docs.docker.com/reference/cli/docker/compose/down/)
removes containers/networks by default, while --volumes removes named volumes.
Never add --volumes for data you want to keep.

For native Node development, create a separate local database and configure
DATABASE_URL, STORAGE_DRIVER=local and required encryption/admin credentials.
Compose provides those inside the app container; .env alone is not a complete
native database connection configuration. The supported beginner path is Compose.
See TESTING.md for compile-only checks and POSTGRESQL.md for database inspection.

