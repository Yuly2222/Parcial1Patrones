#!/usr/bin/env node
// Copia services/_shared -> services/<service>/src/shared para desarrollo
// local (tsc / editor). El Dockerfile de cada servicio hace su propio COPY
// de _shared al construir la imagen; este script NO participa en el build
// de Docker, solo evita tener que symlinkear manualmente para `npm run build`
// / IntelliSense fuera de un contenedor.
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const SHARED_SRC = path.join(ROOT, '_shared');
const SERVICES = ['intake-triage', 'dispatch', 'geospatial', 'notification'];

for (const service of SERVICES) {
  const dest = path.join(ROOT, service, 'src', 'shared');
  fs.rmSync(dest, { recursive: true, force: true });
  fs.mkdirSync(dest, { recursive: true });
  for (const file of fs.readdirSync(SHARED_SRC)) {
    fs.copyFileSync(path.join(SHARED_SRC, file), path.join(dest, file));
  }
  console.log(`sincronizado: ${service}/src/shared`);
}
