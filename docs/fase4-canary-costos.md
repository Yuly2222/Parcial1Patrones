# Fase 4 — Despliegue Progresivo (Canary) y Gobernanza de Costos

Implementa el punto 5 (Opción A: Canary con CodeDeploy y Lambda Aliases) y el punto 6
(AWS Budgets) del enunciado.

## Por qué Canary (Opción A) y no Feature Flags (Opción B)

`infra/template.yaml` ya usa AWS SAM desde la Fase 3, y SAM tiene soporte **nativo** para
Canary (`AutoPublishAlias` + `DeploymentPreference`) — agregar la estrategia de despliegue
fue extender un archivo que ya existía, sin integrar un servicio de terceros nuevo
(LaunchDarkly/Flagsmith) ni un motor de flags adicional. La contrapartida: para grabar la
evidencia de rollback hay que esperar la ventana de tráfico (5 min), a diferencia de un kill
switch que es instantáneo — se documenta ese tiempo de espera más abajo.

## Cómo funciona (mecanismo)

1. Cada función Lambda tiene `AutoPublishAlias: prod`. Cada `sam deploy` publica una
   **versión numerada nueva** de la imagen, pero el alias `prod` — que es al que apunta
   API Gateway, no a `$LATEST` — sigue sirviendo la versión anterior hasta que CodeDeploy lo
   mueva.
2. `DeploymentPreference.Type: Canary10Percent5Minutes`: durante los primeros 5 minutos tras
   el deploy, el 10% del tráfico va a la versión nueva y el 90% sigue en la versión estable.
   Si pasan los 5 minutos sin que salte ninguna alarma, CodeDeploy mueve el 100% del tráfico
   a la versión nueva automáticamente.
3. **3 alarmas de CloudWatch por función** (más una compartida) vigilan esa ventana:
   - `*ErrorsAlarm` — cualquier error de Lambda (`AWS/Lambda Errors >= 1` en 60s).
   - `*LatencyAlarm` — latencia p99 sobre el umbral (1500ms para intake/dispatch/notification;
     5000ms para geospatial, porque el clustering es una operación pesada por diseño y 1500ms
     dispararía falsos positivos constantemente).
   - `Api5xxAlarm` (compartida por las 4) — errores 5xx agregados del API Gateway.
4. Si **cualquiera** de esas alarmas entra en estado `ALARM` durante la ventana del 10%,
   CodeDeploy revierte el alias `prod` al 100% de la versión anterior **automáticamente**,
   sin que nadie tenga que intervenir. Esa es exactamente la validación que pide la rúbrica.

`TreatMissingData: notBreaching` en las 9 alarmas: si una función no recibe tráfico en algún
minuto, la ausencia de datos no cuenta como fallo (evitaría rollbacks falsos por baja demanda).

## El interruptor de fallas sintéticas (`CHAOS_ERROR_RATE`)

Para poder **demostrar** el rollback de forma reproducible (sin tener que romper lógica de
negocio real cada vez que se graba el video), se agregó `services/_shared/chaos.ts`: al
principio de cada request, con probabilidad `CHAOS_ERROR_RATE`% (parámetro `ChaosErrorRatePercent`
del template, expuesto como variable de entorno a las 4 Lambdas, default `0`), la función lanza
un error 500 a propósito.

En operación normal, `ChaosErrorRatePercent=0` — no hace nada. La demo del rollback consiste en
volver a desplegar con ese valor en alto:

```bash
sam deploy --template-file infra/template.yaml --stack-name emergencias-api \
  --capabilities CAPABILITY_IAM CAPABILITY_AUTO_EXPAND \
  --parameter-overrides ChaosErrorRatePercent=50 <...el resto de parámetros de siempre...>
```

Eso publica una versión nueva "defectuosa a propósito", dispara el canary del 10%, una parte
de esas invocaciones falla, la alarma de errores (y probablemente la de 5xx) se activa dentro
de la ventana de 5 minutos, y CodeDeploy revierte solo. **Sin este interruptor, demostrar un
rollback real requeriría desplegar un bug de verdad** — esto lo hace seguro y repetible.

## Cómo desplegar y verificar (runbook)

Requiere AWS SAM CLI, y haber hecho ya `services/build-and-push.sh` (Fase 2) + creado los
roles IAM (Fase 2) — el `sam deploy` de abajo es el mismo de la Fase 3, ahora con canary
incluido automáticamente por estar en el template.

### 1. Despliegue normal (baseline)

```bash
sam deploy --template-file infra/template.yaml --stack-name emergencias-api \
  --capabilities CAPABILITY_IAM CAPABILITY_AUTO_EXPAND \
  --parameter-overrides \
    IntakeTriageImageUri=<...>:v1 DispatchImageUri=<...>:v1 \
    GeospatialImageUri=<...>:v1 NotificationImageUri=<...>:v1 \
    IntakeTriageRoleArn=<...> DispatchRoleArn=<...> GeospatialRoleArn=<...> NotificationRoleArn=<...> \
    CorsOrigin=https://tu-app.vercel.app ChaosErrorRatePercent=0
```

Verifica en la consola de AWS (Lambda → tu función → pestaña "Aliases") que `prod` apunta a
la versión que acabas de publicar, y que ya no hay un despliegue de CodeDeploy en curso.

### 2. Disparar el rollback (evidencia para la entrega)

1. Vuelve a construir/subir una imagen nueva de **intake-triage** (o reusa la misma, no
   importa — lo que cambia es el parámetro de chaos) y corre `sam deploy` con
   `ChaosErrorRatePercent=50`.
2. Abre en paralelo, en la consola de AWS:
   - **CodeDeploy → Applications → `emergencias-intake-triage` → Deployments**: vas a ver el
     despliegue en estado `InProgress`, con la barra de tráfico 10%/90%.
   - **CloudWatch → Alarms**: `emergencias-intake-triage-errors` y/o `emergencias-api-5xx`
     deberían pasar a `In alarm` dentro del primer minuto de tráfico real.
3. Genera tráfico real contra `POST /v1/emergencias` mientras tanto (un `curl` en loop, o
   varios envíos desde el formulario del frontend) — sin tráfico, no hay muestras para que la
   alarma evalúe.
4. Cuando la alarma se activa, CodeDeploy debería mostrar el despliegue como `Stopped`/`Failed`
   y el tráfico vuelve al 100% en la versión anterior — **sin que hayas tocado nada** después
   del paso 1. Esa transición (`InProgress` → alarma `In alarm` → `Stopped`, con el alias
   `prod` de vuelta en la versión vieja) es la captura/grabación que pide la rúbrica como
   "Evidencia de rollback automatizado".
5. Limpieza: vuelve a desplegar con `ChaosErrorRatePercent=0` para restaurar operación normal.

## Gobernanza de costos (`infra/budget.yaml`)

Plantilla separada de `template.yaml` a propósito: el presupuesto es una guardarraíl **de la
cuenta AWS**, no del ciclo de vida de esta API — se despliega una sola vez, no en cada
`sam deploy`.

```bash
aws cloudformation deploy \
  --template-file infra/budget.yaml \
  --stack-name emergencias-budget \
  --parameter-overrides MonthlyBudgetLimitUSD=10 AlertEmail=tu-correo@ejemplo.com
```

Crea un presupuesto mensual de $10 USD con 2 alertas:
- **Alerta 1**: consumo **real** > 50% del presupuesto.
- **Alerta 2**: consumo **proyectado** (forecast) > 85% del presupuesto.

No requiere `--capabilities` (no crea recursos IAM). Después de desplegarlo, entra a
**AWS Budgets** en la consola y confirma que las 2 alertas aparecen listadas — esa pantalla es
la captura de pantalla que pide el punto 6 del enunciado como evidencia.

## Validación realizada sin AWS real

Igual que en las fases anteriores, este entorno no tiene AWS CLI/SAM CLI/credenciales, así
que **no se pudo ejecutar un despliegue ni un rollback real**. Lo que sí se hizo:

- Se revisaron a mano la sintaxis de `AWS::CloudWatch::Alarm`, `DeploymentPreference` y
  `AWS::Budgets::Budget` contra la documentación de CloudFormation/SAM.
- Se sincronizó `chaos.ts` en los 4 servicios y se corrió `tsc --noEmit` en los 4 — compilan
  sin errores.

Pendiente para cuando tengas una cuenta AWS real: correr el runbook de arriba tal cual, y
grabar el video de la Fase de rollback (paso 2) para la entrega.

## Checklist de entregables finales (más allá del código)

Estos no son archivos que yo pueda generar por ti — dependen de que el equipo despliegue todo
de verdad y capture la evidencia:

- [ ] Repos en GitHub/GitLab (este mismo repo) con commits limpios y sin secretos.
- [ ] URL real del frontend en Vercel.
- [ ] URL real del API Gateway (`ApiBaseUrl` del output de `sam deploy`, stage `prod`).
- [ ] Diagramas C4 (Contexto, Contenedores, Componentes) — el diagrama de
      `docs/resumen-general.md` es un punto de partida para el de Contenedores.
- [ ] Capturas de la configuración de AWS Budgets y sus 2 alertas.
- [ ] Captura/grabación del rollback automático (runbook de arriba, paso 2).
- [ ] Video demostrativo (≤5 min): flujo completo de creación de solicitudes en las 4
      ciudades + el mecanismo de despliegue progresivo funcionando en vivo.
