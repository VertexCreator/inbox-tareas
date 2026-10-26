# Manual de Teamflow

Teamflow es la primera herramienta de la línea **Flow**, las herramientas corporativas de Dimassi.

Este dashboard reúne en un solo lugar las iniciativas de marketing del equipo, organizadas por marca, con su
etapa, responsable, fechas y subtareas. Lo nuevo entra en Por planificar (a mano o desde los correos del gerente)
y se convierten en iniciativas con ayuda del agente.

## 1. Entrar

1. Abre la dirección del dashboard que te pasó el gerente.
2. Entra con tu correo `@dimassicorp.com` y la contraseña temporal que te dio.
3. La primera vez el dashboard te pide crear tu propia contraseña (mínimo 8 caracteres).

- **Cambiar la contraseña:** botón **Contraseña** en la barra de arriba.
- **¿La olvidaste?** Pídele al gerente que te dé acceso de nuevo; te genera una contraseña temporal.
- **Modo claro u oscuro:** el botón con el sol o la luna en la barra de arriba cambia el tema al instante.
  El dashboard lo recuerda en tu navegador.

## Deshacer

Casi todo lo que haces se puede deshacer:

- marcar una tarea o subtarea como terminada, o reabrirla;
- mover una iniciativa de etapa, incluso arrastrándola en el tablero;
- cambiar responsable, fecha, marcas, agencia, nombre, descripción u observación;
- borrar una subtarea;
- marcar un correo como listo o cambiarle la prioridad;
- descartar algo por planificar.

Hay tres formas de hacerlo:

- **El aviso de abajo:** dice qué hiciste y tiene un botón grande **↶ Deshacer**. Se cierra solo en 10 segundos
  (la barrita verde muestra cuánto queda).
- **El botón ↶ Deshacer de la barra de arriba:** aparece mientras haya algo para deshacer de los últimos
  5 minutos. Deshace la última acción; si hay varias, muestra cuántas y puedes pulsarlo de nuevo. Al pasar el
  mouse dice qué va a deshacer.
- **El teclado:** ⌘Z en Mac o Ctrl+Z en Windows, cuando no estás escribiendo en un campo.

## Agregar una tarea a mano

Usa el botón **+ Nueva tarea** de la barra de arriba, desde cualquier página, para lo que no llegó por correo.

- **Equipo:** agrega algo **Por planificar** (por defecto, a la lista *Tareas manuales*) con descripción, marca, fecha y
  prioridad. Con **Pedir plan al agente** marcado, el Planificador arma en la próxima media hora la tarea, las
  subtareas y las personas recomendadas, y la gerente lo confirma. En la lista verás "Plan en camino ✦".
- **Gerente:** tiene dos opciones.
  - **Iniciativa directa:** va al tablero con marca, responsable, fecha, etapa y subtareas. Si no eliges
    responsable, el agente sugiere uno.
  - **Pendiente para planificar:** arma la recomendación al instante y te lleva a revisarla.

**Correo relacionado (gerente):** al crear una tarea a mano, marca **Buscar y vincular el correo relacionado**.

- Los parámetros de búsqueda se arman solos con el nombre, la descripción y la marca (con sus alias y dominios).
  Puedes editarlos.
- El script busca en Gmail dentro del plazo configurado (30 días por defecto; se cambia en Configuración →
  Script de Gmail) y vincula el correo que mejor coincide, en menos de 5 minutos.
- En el detalle de la iniciativa, la sección **Correo vinculado** lo muestra con **Abrir**. Desde ahí puedes
  elegir otro candidato, buscar de nuevo con otros parámetros o desvincularlo. El equipo no ve esta sección.

Lo agregado a mano entra al mismo circuito que lo que llega por correo: aparece en el tablero, en Mis tareas y
en la actividad, y el resumen del día avisa si vence.

## 2. Conceptos

| Término | Qué es |
|---|---|
| **Marca** | Cada cliente o marca que maneja el equipo (por ejemplo Peros, Asperox). Tiene un color. |
| **Iniciativa** | Un trabajo concreto de una marca: "Video de producto para TikTok". Es cada tarjeta del tablero. |
| **Multimarca** | Una iniciativa que involucra a varias marcas a la vez (un lanzamiento conjunto de Vaseline y Axe). Lleva la etiqueta **Multimarca** y las marcas que la forman; la primera (★) es la principal. |
| **Etapa** | Dónde está la iniciativa en el flujo de trabajo: Por revisar, En proceso, Falta información, En diseño, Revisión de presupuesto, Listo, Publicada, Por pagar, Cancelado… Cada etapa es una columna del tablero, y el gerente crea las que necesite. |
| **Agencia** | Una agencia con la que trabaja el equipo (creativa, de medios, de eventos). Sus correos, y lo que sale de ellos, quedan con su agencia. |
| **Responsable** | La persona a cargo de la iniciativa. Solo pueden serlo quienes el gerente autorizó. |
| **Subtarea** | Un paso de la iniciativa ("Guion", "Edición"), con su propia persona y fecha. |
| **Observación** | Un aviso visible en la tarjeta: "Falta el logo en vectores del cliente". |
| **Pendiente** | Una idea o pedido anotado en una lista, que todavía no es iniciativa. |

## 3. Iniciativas

Todo el trabajo del equipo en una sola página, de la idea a terminada:

```
📝 Por planificar  →  Por revisar  →  En diseño  →  …  →  Listo
(sin responsable)     (iniciativas, en las etapas que define el gerente)
```

- **📝 Por planificar** (primera columna, la ve todo el equipo): ideas y pedidos que todavía no tienen responsable.
  Llegan desde los correos del gerente, desde **+ Nueva tarea → Por planificar** o escribiendo en el campo
  **+ Agregar** al pie de la columna. El gerente los **planifica** y pasan a las etapas.
- **Las etapas:** las iniciativas, ya con responsable.
- **Vistas** (arriba a la derecha): **Tablero**, **Lista**, **Por marca**, **Por persona**, **Por prioridad**,
  **Por agencia** y **Calendario**. Valen para todo, lo por planificar y las iniciativas.
- **Filtro Lista:** cada proyecto o campaña puede tener su lista ("Desde correos", "Tareas manuales", "Campaña
  Navidad"…). Elige una para ver solo lo suyo. El gerente crea listas con **+ Lista**.
- **Mostrar terminadas / descartadas** y **Ocultar columnas vacías**, debajo de los filtros.

Arriba hay una pestaña por marca:

- **Todas las marcas:** muestra una tarjeta por marca con su avance (% terminado), las vencidas y las que
  tienen observación. Haz clic en una tarjeta para entrar a esa marca.
- **Una marca:** muestra solo sus iniciativas, con la barra de avance (iniciativas y subtareas terminadas) y
  cuántas hay en cada etapa.
- **Multimarca:** junta las iniciativas con dos o más marcas. Cada una aparece también en la pestaña de **cada**
  una de sus marcas y cuenta en el avance de todas ellas.
- **Sin marca:** aparece si hay iniciativas a las que todavía no se les asignó marca.

Debajo están las columnas, una por etapa, en el orden que definió el gerente. Desplázate a los lados para ver
todas. Cada tarjeta muestra:

- marca y agencia, nombre y descripción corta;
- la observación, en amarillo, si la hay;
- la barra de subtareas hechas;
- la fecha límite (en rojo si venció) y la persona responsable.

**Mover una iniciativa de etapa:** arrástrala a otra columna. Pueden hacerlo su responsable y el gerente.
También se cambia desde su detalle.

**Filtros:** busca por nombre, descripción u observación, y filtra por **agencia**, **persona** (responsable o
con subtareas) y **prioridad** (P1, P2, P3). Las marcas se eligen con las pestañas de arriba. Los filtros activos
se ven como etiquetas con **×**; **Limpiar filtros** los quita todos. El tablero los recuerda en este navegador.

**Etapas (solo el gerente):**

- **+ Nueva etapa**, al final de las columnas: eliges nombre, color y cómo cuenta:
  - *Sin empezar*,
  - *En curso*: suma a la carga de la persona,
  - *Terminado*: suma al avance de la marca,
  - *Cancelado*: no cuenta.
- Clic en el nombre de la etapa (o en **⋯**): **Renombrar**, cambiar **color** y **cómo cuenta**, **mover** la
  columna a la izquierda o a la derecha, o **borrar** la etapa. Si tiene iniciativas, eliges a qué etapa pasan.
  Doble clic en el nombre también lo renombra.
- **Ocultar columnas vacías** esconde las etapas sin iniciativas.
- **+ Marca** y **Nueva iniciativa:** solo el gerente.

## 4. Detalle de una iniciativa

Haz clic en una tarjeta para abrir su detalle a la derecha. Se cierra con **Cerrar**, con la tecla Esc o
haciendo clic fuera.

| Campo | Quién lo cambia |
|---|---|
| Etapa | El responsable y el gerente. Haz clic en la etapa nueva o arrastra la tarjeta en el tablero. |
| Agencia | Solo el gerente. Se pone sola si el correo vino de una agencia. |
| Observación | El responsable y el gerente. Escribe y pulsa **Guardar observación**; **Quitar** la borra. |
| Subtareas | El responsable y el gerente crean, editan, asignan, fechan y borran. Cada persona marca las suyas. |
| Marca, nombre, descripción, responsable, fecha límite | Solo el gerente. |

Los cambios se guardan solos y aparecen en las pantallas de todos en pocos segundos.

**Correo original:** si la iniciativa viene de un correo, al asignarla el script de Gmail (cada 5 minutos):

- le **reenvía el correo a la persona responsable** con el asunto **"Asignación TeamFlow - asunto original"**, todo
  el texto, **todos los adjuntos** y un recuadro con la iniciativa (marca, prioridad, fecha, subtareas y el botón
  **Ver en TeamFlow**);
- guarda el texto en la iniciativa, en la sección **✉ Correo original**: remitente, fecha, para, CC, la lista de
  adjuntos y el texto ordenado (los enlaces se abren con un clic y el historial del hilo queda plegado).

**Indicador del correo** (en las tarjetas de Iniciativas y Mis tareas, y en el detalle):

| Indicador | Qué significa |
|---|---|
| **✉ 3:12** (ámbar) | El correo está en camino: es lo que falta para la próxima pasada del script (cada 5 minutos). |
| **✉ ya** | El script está pasando en este momento. |
| **✉✓** (verde) | Gmail ya envió el correo a la persona. Pasa el mouse para ver a quién y cuándo. |
| **✉!** (rojo) | No se pudo enviar; pasa el mouse para ver por qué. Se reintenta solo hasta 3 veces. |
| **✉–** (gris) | No se reenvió (por ejemplo, te la asignaste a ti o el reenvío está apagado). |
| **✉ script detenido** (rojo) | El script de Gmail lleva más de 15 minutos sin revisar: ábrelo en Apps Script. |

Cuando el correo sale, al gerente le aparece un aviso abajo a la derecha. "Enviado" quiere decir que Gmail lo
envió; si la dirección no existe, el aviso de rebote llega a la bandeja del gerente.

En la sección **✉ Correo original**, **⤢ Ver en grande** abre el correo completo en una ventana.

Lo ven el gerente, el responsable y quienes tienen subtareas en la iniciativa. Si se reasigna, se le reenvía a la
persona nueva. Si te la asignas a ti, no se reenvía. El gerente puede pulsar **Reenviar de nuevo**, y lo apaga en
Configuración → Script de Gmail → **Reenviar el correo al asignar**. Gmail acepta hasta 25 MB por correo: si los
adjuntos no caben, el correo dice cuáles quedaron fuera.

**🗑 Eliminar una iniciativa:** en su detalle, **🗑 Eliminar** (con confirmación). Lo pueden hacer el gerente y quien
creó la iniciativa. Se puede **↶ Deshacer** durante 30 minutos; vuelve con sus subtareas.

**⧉ Duplicar para otra marca:** en el detalle de cualquier iniciativa, **⧉ Duplicar** crea una copia idéntica en la
que solo cambia la marca. Lo puede hacer cualquier persona del equipo.

- Eliges una o varias marcas; se crea una copia por cada una. La ventana muestra cómo quedará cada nombre.
- Se copia igual: título y descripción (con el nombre de la marca cambiado donde aparezca), responsable, prioridad,
  esfuerzo, agencia, fechas y todas las subtareas con sus personas y fechas.
- No se copia el avance: la copia empieza en la primera etapa, con las subtareas sin marcar, sin observación ni
  correo vinculado.
- Te equivocaste: **↶ Deshacer** borra las copias (en los 30 minutos siguientes y mientras sean tuyas).

## 5. Mis tareas

Todo lo que te toca, en un solo lugar: las iniciativas de las que eres **responsable** y tus **subtareas** en
iniciativas de otras personas (cada fila dice cuál es cuál).

- **Arriba, tres contadores:** pendientes, vencidas y terminadas esta semana. Haz clic en uno para ir a esa lista.
- **Pendientes**, ordenadas por urgencia: Vencidas, Hoy, Mañana, Próximos 7 días, Más adelante y Sin fecha límite.
  - Marca el **círculo ✓** para terminarla. Una iniciativa pasa a la etapa que cuenta como *Terminado*; si le
    quedan subtareas abiertas, te pregunta antes.
  - **▸ Subtareas** despliega las de la iniciativa para marcarlas ahí mismo. **Ver detalle →** abre todo.
  - **Ver más** muestra la descripción completa. **✉ Ver correo** abre el correo original completo en una ventana
    grande (el gerente también tiene **Abrir en Gmail**).
- **✓ Terminadas:** todo lo que terminaste, agrupado por Hoy, Ayer, Esta semana y Antes, con la hora. **Reabrir** la
  devuelve a Pendientes.
- Al terminar algo aparece un aviso abajo con **Deshacer** y **Ver terminadas**.
- **🔁 Repetitivas:** las tareas que se repiten (ver más abajo).
- **📝 Lo que propuse:** lo que anotaste en Por planificar y en qué quedó.
- Si trabajas con varias marcas, filtra con los botones de marca.
- El gerente puede elegir a cualquier persona del equipo en el menú de arriba para ver sus tareas.

### Tareas repetitivas 🔁

Para lo que se hace siempre (un reporte semanal, revisar métricas cada día, un pago cada 15 días, el cierre de
mes). Cualquier persona del equipo las puede programar **para sí**; para otras personas, el gerente y los cargos con
el permiso **Tareas repetitivas para otros** (solo a quienes pueden asignar).

1. **+ Nueva tarea → 🔁 Repetitiva**, o en **Mis tareas → 🔁 Repetitivas → Nueva tarea repetitiva**.
2. Elige cada cuánto se repite:
   - **Todos los días**, con la opción de solo días hábiles (lunes a viernes);
   - **Cada semana**, en uno o varios días (por ejemplo, lunes y miércoles);
   - **Cada 15 días**, desde la fecha de inicio;
   - **Cada mes**, el mismo día del mes de la fecha de inicio. Si es 31, en los meses más cortos cae el último día.
3. Opcional: fecha final, plazo (vence el mismo día o unos días después), prioridad, marcas y subtareas (una por línea).
   El recuadro azul muestra las próximas fechas antes de guardar.

El día que toca, la tarea **se crea sola**: aparece en **Mis tareas → Pendientes** (y en Iniciativas y Hoy) con 🔁
y la fecha en el nombre ("Reporte semanal · 14/10"). Se termina como cualquier otra. Si un día no se hizo, la
siguiente igual se crea; no se acumulan repeticiones atrasadas.

En **Mis tareas → 🔁 Repetitivas** ves cada una con su regla y la próxima fecha, y puedes **Editar**,
**⏸ Pausar / ▶ Reanudar** o **Borrar** (las tareas ya creadas se quedan).

### Mi correo (equipo)

Cada persona del equipo puede conectar **su propio Gmail** en la pestaña **Mi correo**. Solo esa persona ve su
correo; el gerente no.

**Conectarlo (una vez, unos 3 minutos):**

1. En **Mi correo**, pulsa **Copiar el script**. Ya trae tu clave personal: no la compartas.
2. Abre **script.google.com → Proyecto nuevo** con tu correo de Dimassi, borra lo que trae, pega y guarda.
3. Elige la función **instalar** y pulsa **Ejecutar**. Acepta los permisos (Revisar permisos → tu cuenta → si
   dice "Google no verificó esta app", Configuración avanzada → Ir a… → Permitir). Si no aparece "Revisados …"
   en el registro, pulsa **Ejecutar** otra vez.
4. La página se actualiza sola con el primer envío: **✓ Gmail conectado**.

**Cómo se ordena (sin IA):** el script revisa tu correo cada 10 minutos.

- **P1:** te escriben a ti, te piden algo y hay plazo de hoy o mañana.
- **P2:** te piden algo, te mencionan o el remitente es VIP.
- **P3:** te escriben a ti o nombran una marca.
- **Sin prioridad:** lo informativo, en copia o automático. Lo encuentras en **Sin prioridad**, al final de la página.
- La basura (Promociones, Social, Foros) se separa sola.

Si mueves un correo a otra prioridad, la base **aprende ese remitente** y los próximos llegan así.

**Qué puedes hacer con cada correo:** **Abrir ↗** en tu Gmail, **Crear tarea** y **✓ Listo**. Con
**Crear tarea** puedes **crear la iniciativa y asignarla** a cualquier persona autorizada, o dejarla para
que el gerente la reparta. Si la asignas a otra persona, **tu script le reenvía el correo** ("Asignación
TeamFlow - …", con todo el texto y los adjuntos), igual que cuando asigna el gerente.

**✦ Pedir análisis al agente** (solo si el gerente te lo habilitó): el agente del gerente analiza ese correo en
su próxima pasada (cada 30 minutos, lunes a viernes de 8:00 a 18:30). Te devuelve:

- un resumen, la prioridad sugerida (**Aplicar**) y las marcas;
- una tarea propuesta (**Crear tarea con esto**);
- con **+ respuesta**, un texto de respuesta para copiar en Gmail.

Ese correo pasa por la sesión de Claude del gerente; el resto de tu bandeja nunca llega a Claude. Hay un límite
diario por persona.

## 6. Por planificar y planificación

**Todos** pueden anotar algo por planificar:

1. **+ Nueva tarea → 📝 Por planificar**, o en **Iniciativas**, el campo **+ Agregar** al pie de la columna Por planificar.
2. Si quieres, agrega detalles, marca, agencia, fecha y prioridad.

Mientras no esté planificado, puedes borrar lo tuyo. En **Mis tareas → 📝 Lo que propuse** ves todo lo que anotaste y
en qué quedó: esperando al gerente, con plan listo, ya es iniciativa (con su responsable y etapa) o descartado.
La lista **Desde correos** la llena el agente con lo que detecta en el inbox del gerente.

**Marca sugerida:** el agente deduce la marca de cada correo por el dominio del remitente, los productos o la
firma.

- Si la marca ya existe, la asigna sola.
- Si no existe, verás **✦ ¿Marca: X?** en la tarjeta. El gerente pulsa **Crear y asignar** (o **Asignar**, si
  ya existe con otro nombre) y la marca queda puesta ahí y en todo lo que la sugería.
- La **×** descarta la sugerencia.

**Correos con varias marcas:** el script de Gmail detecta todas las marcas que nombra un correo y le pasa al
agente el párrafo de cada una. El agente decide:

- **Una iniciativa multimarca:** si es el mismo trabajo para varias marcas, deja **una** tarea por planificar con todas ellas.
- **Iniciativas distintas por marca:** si el correo pide cosas distintas a cada marca, las **separa**: una
  por marca, cada una con lo suyo.

Para cambiar las marcas (solo el gerente), en el detalle de la iniciativa o del plan pulsa **+ Marca** para sumar
otra, **×** para quitarla, o haz clic en una marca para volverla la principal.

**El gerente** (y los cargos con el permiso **Repartir lo que está por planificar**, como Coordinador) tiene dos
formas de convertir lo por planificar en iniciativa:

- **Asignar a… ▾** (en la tarjeta y en **Hoy → Por asignar**): eliges a la persona y queda como iniciativa al instante,
  sin subtareas. La pestaña **Iniciativas** muestra un número con cuántas cosas esperan que las asignes.
- **Planificar con subtareas →**: arma el plan completo, como se explica abajo.

Para planificar con subtareas:

1. **Planificar:** el dashboard propone al instante una iniciativa con subtareas. Usa la plantilla que mejor
   calza: campaña en redes, lanzamiento, evento, newsletter, nota de prensa, blog o tarea simple. Cada subtarea
   trae persona recomendada (por habilidad, nivel y carga) y fecha calculada hacia atrás desde la fecha límite.
2. **Revisa y ajusta:**
   - marca, responsable principal (solo personas autorizadas) y fecha,
   - incluye o quita subtareas, cambia personas y fechas, o agrega subtareas nuevas,
   - si la plantilla no es la correcta, cámbiala en el menú **Plantilla**.
3. **Confirmar y asignar** crea la iniciativa con sus subtareas en el tablero.

Algunos detalles de la recomendación:

- **Borrador o afinada:** la etiqueta "Borrador" significa que Claude todavía no la revisó. El planificador la
  afina en la próxima media hora (lunes a viernes, de 8:00 a 18:30). Puedes confirmarla antes si te sirve.
- **Recordar mis cambios:** si lo dejas marcado, la plantilla aprende. Por ejemplo, la próxima vez los copies
  vendrán con la persona que elegiste, o la subtarea que quitaste vendrá desmarcada.

## 7. Hoy

- **Gerente:**
  - **resumen de tus correos** en tres cuadros: **P1 · Responder hoy** (rojo), **P2 · Esta semana** (ámbar)
    y **P3 · Cuando puedas** (gris, plegado). Arriba va la frase del agente con lo más importante.
    - Los cuadros se arman con tus correos pendientes, no con un texto: si marcas uno como **✓ Listo**,
      desaparece al instante.
    - Cada tarjeta dice qué te piden, quién, la marca, la fecha ("hoy", "mañana", "venció…"), si te mencionan o
      estás en copia, y tiene **Abrir**, **Crear tarea** y **✓ Listo**.
    - **Crear tarea** abre una ventana con todo precargado desde el correo (título, descripción, marca,
      prioridad y fecha). Elige **Asignar ahora**: propone responsable y subtareas con persona y fecha según la
      plantilla, y la iniciativa va directo al tablero. O elige **Planificar después**: queda en Por planificar con la
      recomendación lista. Si el correo tiene varias marcas, elige **Una iniciativa multimarca** o **Separar: una
      por marca** (crea una por cada marca con el mismo plan). Por defecto el correo se marca como atendido. Si ya tiene tarea, el botón dice
      **✓ Con tarea** y la ventana te avisa antes de crear otro.
    - El contador grande dice cuántos hay y "+N nuevos" cuántos llegaron desde la revisión anterior. **Ver los N**
      despliega el resto.
    - Filtra por marca con los botones de arriba, o activa **Solo donde me mencionan** para los días con muchos
      hilos grupales.
    - **Cambia la prioridad** arrastrando la tarjeta a otro cuadro, o con los botones **→P1 / →P2 / →P3** de
      la esquina. Queda **📌 fijada por ti**: el agente no la cambia y aprende de tus correcciones para los
      correos parecidos.
    - Debajo: lo nuevo por planificar, iniciativas que vencen, carga del equipo, basura filtrada y correos sospechosos;
  - "Necesita tu atención" (responder hoy, repartos por decidir, vencidas, personas saturadas), donde cada
    tarjeta lleva a su sección;
  - bandeja de correos por prioridad: **Crear tarea** manda el correo a "Desde correos" y **Listo** lo
    marca como respondido;
  - **@ Te mencionan:** en hilos con muchos destinatarios, marca los correos donde te nombraron con @. El
    resumen del agente se basa en el párrafo donde te piden algo. **En copia** y **Por lista** indican que no
    eras destinataria directa;
  - equipo de hoy (carga y lo que terminó cada uno), avance por marca y actividad reciente.
- **Equipo:** tus pendientes ordenados en Vencidas, Hoy, Esta semana y Más adelante, más la actividad del
  equipo.
  - En cada tarjeta, **Etapa** cambia la etapa de tu tarea (la casilla la marca como terminada).
  - **Ver detalle →** abre la tarea completa y **✉ Ver correo** el correo original, si lo tiene.

## 8. Equipo

- Muestra a cada persona con su cargo, sus habilidades, su carga y lo que tiene abierto.
- El gerente agrega personas, les da acceso y define:
  - **Cargo** (Coordinador, Especialista, Diseñador o los que crees) y un **título** opcional que ve el equipo (por
    ejemplo, "Coordinadora de contenido").
  - **Habilidades:** cada clic sube el nivel (básico → intermedio → avanzado → sin nivel).
  - **Capacidad:** 10 = tiempo completo; 5 = medio tiempo.
  - **Disponible:** desmárcalo durante vacaciones para que el agente no le recomiende trabajo.
  - **Permisos de la persona:** por defecto, los de su cargo. En cada permiso puedes dejar **Como el cargo** o darle
    **Sí** o **No** solo a esa persona (queda resaltado). **Dejar todo como el cargo** borra esos ajustes.
  - **Puede asignar tareas:** como su cargo, a todo el equipo, a sus compañeros (no a gerentes), solo autoasignarse o
    **solo a las personas que elijas**. Siempre puede asignarse a sí misma o a sí mismo.
- Cada persona muestra si conectó su Gmail (**✉ Gmail conectado**).
- El límite diario de **Pedir análisis al agente** se ajusta en el recuadro **Análisis del agente para el equipo**.

### Cargos y permisos

En **Equipo → Cargos y permisos → Ver y editar** hay una tabla con un cargo por columna y un permiso por fila. Cada
cambio se guarda al instante y vale para todas las personas con ese cargo, salvo lo que hayas ajustado a alguien.
Con **+ Nuevo cargo** creas otro (empieza solo con lo básico); con ✎ lo renombras y con ✕ lo eliminas (quienes lo
tenían quedan sin cargo, con permisos básicos).

| Permiso | Qué permite | Coordinador | Especialista | Diseñador |
|---|---|:-:|:-:|:-:|
| Asignar tareas | A quién puede asignar | a todos | a compañeros | solo a sí |
| Ser responsable de iniciativas | Aparecer como responsable principal | ✓ | ✓ | ✓ |
| Repartir lo que está por planificar | Asignar, planificar y descartar en Por planificar | ✓ | | |
| Editar iniciativas | Nombre, descripción, fechas, marcas, agencia y responsable | ✓ | | |
| Mover iniciativas de otros | Cambiar la etapa de cualquiera (las suyas siempre) | ✓ | | |
| Eliminar iniciativas de otros | Las que creó siempre las puede eliminar | | | |
| Tareas repetitivas para otros | Programarlas para otras personas | ✓ | | |
| Duplicar para otra marca | ⧉ Duplicar en el detalle | ✓ | ✓ | ✓ |
| Mi correo | Conectar su Gmail | ✓ | ✓ | ✓ |
| Pedir análisis al agente | Usa tu plan de Claude | | | |

Esos son los valores con los que empiezan; cámbialos cuando quieras. Los **administradores pueden todo**, sin
importar su cargo: para que el cargo aplique a alguien, desmárcale **Administrador** en Editar.

## 9. Configuración (solo gerente)

| Pestaña | Para qué |
|---|---|
| Prioridades y resumen | Qué es P1, P2 o basura en los correos, categorías y qué incluye el resumen del día. |
| Marcas, etapas y agencias | Nombre, color y **alias** de cada marca (dominios del cliente, productos) para que el agente la reconozca en los correos; archivar marcas. Etapas: crear, renombrar, color, orden, cómo cuenta y borrar (moviendo sus iniciativas). Agencias: nombre, color y **dominios de correo**; al agregar un dominio se aplica también a lo que ya existe. |
| Plantillas | Subtareas típicas de cada tipo de trabajo, palabras que activan cada plantilla y lo que aprendió de tus cambios. |
| Habilidades | Catálogo de habilidades para perfiles y plantillas. |
| Script de Gmail | Remitentes VIP y basura, y estado del script que lee el correo. |
| Reparto e historial | Modo sugerencia o automático, reglas aprendidas e historial de decisiones. |

## 10. Quién puede hacer qué

Lo que dice "según cargo" depende del cargo de la persona y de sus ajustes (ver **Cargos y permisos**).

| Acción | Equipo | Responsable | Gerente |
|---|:-:|:-:|:-:|
| Ver Iniciativas (incluido Por planificar) y la actividad | ✓ | ✓ | ✓ |
| Agregar algo Por planificar | ✓ | ✓ | ✓ |
| Marcar sus propias subtareas | ✓ | ✓ | ✓ |
| Cambiar etapa (también arrastrando) y observación | según cargo | ✓ | ✓ |
| Crear y editar subtareas de la iniciativa | según cargo | ✓ | ✓ |
| Crear iniciativas y asignarlas a sí mismo | ✓ | ✓ | ✓ |
| Asignar iniciativas a otras personas | según cargo | según cargo | a cualquiera |
| Repartir y planificar lo que está Por planificar | según cargo | según cargo | ✓ |
| Cambiar marca, responsable, fechas y descripción | según cargo | según cargo | ✓ |
| Eliminar una iniciativa | las que creó, o según cargo | las que creó, o según cargo | ✓ |
| Duplicar, Mi correo, Pedir análisis al agente | según cargo | según cargo | ✓ |
| Crear marcas, etapas, agencias y cargos | | | ✓ |
| Ver la bandeja del gerente y configurar el agente | | | ✓ |

## 11. Preguntas frecuentes

- **No puedo cambiar la etapa de una iniciativa.** Lo hacen el responsable, el gerente y los cargos con **Mover
  iniciativas de otros**. Si te toca a ti, pídele al gerente que te asigne como responsable.
- **No aparezco como responsable.** Tu cargo (o tu ajuste en Equipo) tiene que incluir **Ser responsable de
  iniciativas**.
- **No veo un botón que otra persona sí ve** (Asignar a…, Duplicar, Mi correo…). Depende del cargo: el gerente lo
  activa en **Equipo → Cargos y permisos** o solo para ti en **Editar**.
- **La etapa que necesito no existe.** El gerente la crea con **+ Nueva etapa** al final del tablero de Iniciativas.
- **Un correo de una agencia no quedó con su agencia.** Revisa que su dominio esté en Configuración → Marcas,
  etapas y agencias.
- **La recomendación dice "Nadie del equipo tiene…".** Falta esa habilidad en los perfiles. Agrégala en Equipo
  o elige a la persona a mano.
- **No veo un cambio que hizo un compañero.** Se actualiza solo en segundos. Si no, recarga la página.
