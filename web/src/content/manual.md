# Manual de Teamflow

Teamflow es la primera herramienta de la línea **Flow**, las herramientas corporativas de Dimassi.

Este dashboard reúne en un solo lugar las iniciativas de marketing del equipo, organizadas por marca, con su
etapa, responsable, fechas y subtareas. Los pendientes nacen en las listas (o desde los correos del gerente)
y se convierten en iniciativas con ayuda del agente.

## 1. Entrar

1. Abre la dirección del dashboard que te pasó el gerente.
2. Entra con tu correo `@dimassicorp.com` y la contraseña temporal que te dio.
3. La primera vez el dashboard te pide crear tu propia contraseña (mínimo 8 caracteres).

- **Cambiar la contraseña:** botón **Contraseña** en la barra de arriba.
- **¿La olvidaste?** Pídele al gerente que te dé acceso de nuevo; te genera una contraseña temporal.
- **Modo claro u oscuro:** el botón con el sol o la luna en la barra de arriba cambia el tema al instante.
  El dashboard lo recuerda en tu navegador.

## Agregar una tarea a mano

Usa el botón **+ Nueva tarea** de la barra de arriba, desde cualquier página, para lo que no llegó por correo.

- **Equipo:** agrega un **pendiente** a una lista (por defecto, *Tareas manuales*) con descripción, marca, fecha y
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

## 3. Tablero

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

**Indicador del correo** (en las tarjetas del Tablero, Mis tareas y Listas, y en el detalle):

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

Lo ven el gerente, el responsable y quienes tienen subtareas en la iniciativa. Si se reasigna, se le reenvía a la
persona nueva. Si te la asignas a ti, no se reenvía. El gerente puede pulsar **Reenviar de nuevo**, y lo apaga en
Configuración → Script de Gmail → **Reenviar el correo al asignar**. Gmail acepta hasta 25 MB por correo: si los
adjuntos no caben, el correo dice cuáles quedaron fuera.

## 5. Mis tareas

Todo lo que te toca, en un solo lugar: las iniciativas de las que eres **responsable** y tus **subtareas** en
iniciativas de otras personas (cada fila dice cuál es cuál).

- **Arriba, tres contadores:** pendientes, vencidas y terminadas esta semana. Haz clic en uno para ir a esa lista.
- **Pendientes**, ordenadas por urgencia: Vencidas, Hoy, Mañana, Próximos 7 días, Más adelante y Sin fecha límite.
  - Marca el **círculo ✓** para terminarla. Una iniciativa pasa a la etapa que cuenta como *Terminado*; si le
    quedan subtareas abiertas, te pregunta antes.
  - **▸ Subtareas** despliega las de la iniciativa para marcarlas ahí mismo. **Ver detalle** abre todo.
- **✓ Terminadas:** todo lo que terminaste, agrupado por Hoy, Ayer, Esta semana y Antes, con la hora. **Reabrir** la
  devuelve a Pendientes.
- Al terminar algo aparece un aviso abajo con **Deshacer** y **Ver terminadas**.
- Si trabajas con varias marcas, filtra con los botones de marca.
- El gerente puede elegir a cualquier persona del equipo en el menú de arriba para ver sus tareas.

## 6. Listas y planificación

**Todos** pueden anotar pendientes:

1. Entra a **Listas** y elige una lista (cada proyecto o campaña tiene la suya).
2. En la fila de abajo escribe el pendiente.
3. Si quieres, agrega detalles, marca, agencia, fecha y prioridad. Pulsa **Agregar**.

**Todas las listas** junta los pendientes de todas las listas en una sola vista.

**Vistas** (arriba a la derecha; se recuerda la última que usaste):

| Vista | Qué muestra |
|---|---|
| **Lista** | La tabla de siempre: pendiente, estado, responsable, fecha límite y acciones. |
| **Kanban** | Una columna por estado: Sin planificar, Recomendación lista, En tareas, Terminado (y Descartado si lo muestras). |
| **Por marca** | Un grupo por marca con su avance y sus vencidos. Los multimarca aparecen en cada una de sus marcas. |
| **Por persona** | Un grupo por responsable, y "Sin responsable" para lo que falta asignar. |
| **Por prioridad** | P1, P2, P3 y sin prioridad. |
| **Por agencia** | Un grupo por agencia, y "Sin agencia". |
| **Calendario** | El mes con cada pendiente en su fecha límite (rojo si venció, tachado si se terminó). Clic en un día para ver sus pendientes; abajo, los que no tienen fecha. |

Los grupos se pliegan con un clic en su nombre. En todas las vistas el gerente puede **Planificar** o **Revisar
plan** desde la tarjeta.

**Filtros:** búsqueda, **marca** (una o varias, o "Sin marca"), **agencia**, **persona** (responsable o con
subtareas, o "Sin asignar") y **prioridad**. Se combinan entre sí y valen para todas las vistas.

Mientras no esté planificado, puedes borrar tu propio pendiente. La lista **Desde correos** la llena el agente
con lo que detecta en el inbox del gerente.

**Marca sugerida:** el agente deduce la marca de cada correo por el dominio del remitente, los productos o la
firma.

- Si la marca ya existe, la asigna sola.
- Si no existe, verás **✦ ¿Marca: X?** en el pendiente. El gerente pulsa **Crear y asignar** (o **Asignar**, si
  ya existe con otro nombre) y la marca queda puesta en ese pendiente y en todos los que la sugerían.
- La **×** descarta la sugerencia.

**Correos con varias marcas:** el script de Gmail detecta todas las marcas que nombra un correo y le pasa al
agente el párrafo de cada una. El agente decide:

- **Una iniciativa multimarca:** si es el mismo trabajo para varias marcas, crea **un** pendiente con todas ellas.
- **Iniciativas distintas por marca:** si el correo pide cosas distintas a cada marca, las **separa**: un
  pendiente por marca, cada uno con lo suyo.

Para cambiar las marcas (solo el gerente), en el detalle de la iniciativa o del plan pulsa **+ Marca** para sumar
otra, **×** para quitarla, o haz clic en una marca para volverla la principal.

**El gerente** convierte los pendientes en iniciativas:

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
      estás en copia, y tiene **Abrir**, **Crear pendiente** y **✓ Listo**.
    - **Crear pendiente** abre una ventana con todo precargado desde el correo (título, descripción, marca,
      prioridad y fecha). Elige **Asignar ahora**: propone responsable y subtareas con persona y fecha según la
      plantilla, y la iniciativa va directo al tablero. O elige **Planificar después**: queda en Listas con la
      recomendación lista. Si el correo tiene varias marcas, elige **Una iniciativa multimarca** o **Separar: una
      por marca** (crea una por cada marca con el mismo plan). Por defecto el correo se marca como atendido. Si ya tiene pendiente, el botón dice
      **✓ Con pendiente** y la ventana te avisa antes de crear otro.
    - El contador grande dice cuántos hay y "+N nuevos" cuántos llegaron desde la revisión anterior. **Ver los N**
      despliega el resto.
    - Filtra por marca con los botones de arriba, o activa **Solo donde me mencionan** para los días con muchos
      hilos grupales.
    - **Cambia la prioridad** arrastrando la tarjeta a otro cuadro, o con los botones **→P1 / →P2 / →P3** de
      la esquina. Queda **📌 fijada por ti**: el agente no la cambia y aprende de tus correcciones para los
      correos parecidos.
    - Debajo: pendientes nuevos, iniciativas que vencen, carga del equipo, basura filtrada y correos sospechosos;
  - "Necesita tu atención" (responder hoy, repartos por decidir, vencidas, personas saturadas), donde cada
    tarjeta lleva a su sección;
  - bandeja de correos por prioridad: **Crear pendiente** manda el correo a "Desde correos" y **Listo** lo
    marca como respondido;
  - **@ Te mencionan:** en hilos con muchos destinatarios, marca los correos donde te nombraron con @. El
    resumen del agente se basa en el párrafo donde te piden algo. **En copia** y **Por lista** indican que no
    eras destinataria directa;
  - equipo de hoy (carga y lo que terminó cada uno), avance por marca y actividad reciente.
- **Equipo:** tus pendientes ordenados en Vencidas, Hoy, Esta semana y Más adelante, más la actividad del
  equipo.

## 8. Equipo

- Muestra a cada persona con sus habilidades, su carga y lo que tiene abierto.
- El gerente agrega personas, les da acceso y define:
  - **Habilidades:** cada clic sube el nivel (básico → intermedio → avanzado → sin nivel).
  - **Capacidad:** 10 = tiempo completo; 5 = medio tiempo.
  - **Puede ser responsable de iniciativas:** solo quienes lo tienen marcado aparecen como responsables.
  - **Disponible:** desmárcalo durante vacaciones para que el agente no le recomiende trabajo.

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

| Acción | Equipo | Responsable | Gerente |
|---|:-:|:-:|:-:|
| Ver tablero, listas y actividad | ✓ | ✓ | ✓ |
| Agregar pendientes | ✓ | ✓ | ✓ |
| Marcar sus propias subtareas | ✓ | ✓ | ✓ |
| Cambiar etapa (también arrastrando) y observación | | ✓ | ✓ |
| Crear y editar subtareas de la iniciativa | | ✓ | ✓ |
| Crear iniciativas, marcas, etapas y agencias; planificar pendientes | | | ✓ |
| Cambiar marca, responsable, fechas y descripción | | | ✓ |
| Ver correos y configurar el agente | | | ✓ |

## 11. Preguntas frecuentes

- **No puedo cambiar la etapa de una iniciativa.** Solo el responsable y el gerente pueden hacerlo. Si te
  toca a ti, pídele al gerente que te asigne como responsable.
- **No aparezco como responsable.** El gerente tiene que marcarte "Puede ser responsable" en Equipo.
- **La etapa que necesito no existe.** El gerente la crea con **+ Nueva etapa** al final del tablero.
- **Un correo de una agencia no quedó con su agencia.** Revisa que su dominio esté en Configuración → Marcas,
  etapas y agencias.
- **La recomendación dice "Nadie del equipo tiene…".** Falta esa habilidad en los perfiles. Agrégala en Equipo
  o elige a la persona a mano.
- **No veo un cambio que hizo un compañero.** Se actualiza solo en segundos. Si no, recarga la página.
