// ==UserScript==
// @updateURL    https://raw.githubusercontent.com/AAT-Consultoria/PLEXO/main/aat_rfx.user.js
// @downloadURL  https://raw.githubusercontent.com/AAT-Consultoria/PLEXO/main/aat_rfx.user.js
// @name         AAT · Gestionar RFx (Connected Supplier)
// @namespace    https://aatconsultoria.com/
// @version      21.3.1
// @description  Panel de gestión de RFx en Open Requests: busca pendientes, las clasifica con las reglas de los coordinadores y acepta una a una desde la ficha individual, nunca desde la lista.
// @author       AAT CONSULTORIA DE PROYECTOS SL
// @match        https://appcodeplatform.ericsson.net/ConnectedSupplier*
// @match        https://aat-consultoria.github.io/PLEXO/*
// @grant        none
// @run-at       document-idle
// @noframes
// ==/UserScript==
//
// ─────────────────────────────────────────────────────────────────────────────────────

//
// v20 · «Pegar lista…»: el gestor pega la columna de RFx que le ha aprobado un
// coordinador y la herramienta las busca UNA A UNA en el portal antes de enseñarlas.
// La lista es una PROPUESTA, no una orden:
//   · Solo se admite 7 + 9 cifras. Lo demás se descarta CON SU MOTIVO, nunca en
//     silencio: notación científica de Excel, decimales, cifras de menos, duplicados.
//   · Las que no aparecen en Open Requests se cantan una por una.
//   · Se preselecciona lo que trae la lista, pero las VETADAS por regla de coordinador
//     salen desmarcadas y ejecutar() sigue sacándolas de la cola pase lo que pase.
//   · Simular y Aceptar siguen siendo dos botones distintos, y aceptar sigue pidiendo
//     confirmación con el desglose delante.
//
// v20.1 · Filtro «Selección» (Todas / Marcadas / Sin marcar). Con una lista larga, el
// aviso de «tienes marcadas que no estás viendo» te dice que pasa algo pero no qué:
// esto deja ver la cola de aceptación tal cual, antes de pulsar. La cuenta de
// «Marcadas» se toma de S.sel.size a propósito, para que cuadre siempre con el número
// del pie, que es el que manda al aceptar.
//
// v20.2 · «Buscar pendientes» acota de dos maneras, sueltas o juntas:
//   · Por fechas, como siempre, o con «Sin fechas» para barrerlo todo (medido en el
//     portal: 33 páginas, unas 990 RFx pendientes; pide confirmación porque tarda).
//   · Por operador y servicio. AVISO para quien toque esto: ninguno de los dos es un
//     campo del portal —el operador sale de la referencia y el servicio del recetario—,
//     así que no achican la búsqueda, solo lo que llega puesto. Lo que sí hacen es
//     evitar que se preseleccione nada fuera de lo pedido, que es lo que importa.
//
// v20.3 · El panel se reordena en dos pasos, que es como lo piensa el gestor:
//   · PASO 1 «Buscar en el portal»: solo fechas (o «Sin fechas»). Nada más, porque
//     nada más entiende el portal.
//   · PASO 2 «Elegir dentro de lo encontrado»: operador, servicio, texto y «Ver».
//     ELEGIR NO MARCA. Filtra lo que se ve y punto. Lo que se acepta es lo marcado, se
//     vea o no, y eso sigue avisándose al aceptar.
//   · El puente entre las dos cosas es un botón explícito, «Marcar solo lo que veo»,
//     que además respeta la regla: no marca vetadas ni las de revisar.
// En 20.2 los desplegables de operador y servicio estaban en la barra de búsqueda y
// parecían criterios del portal, que es justo lo que NO son. De ahí la confusión.
//
// v20.4 · EL ATASCO DE LA PÁGINA 13. Cadena completa, medida en el portal:
//   «Open Requests» no imprime «of N records» (las otras pantallas sí) → el troceado
//   por fechas exigía ese número, así que aquí NO SE ACTIVABA NUNCA → un rango ancho se
//   paginaba entero → a las 12 páginas saltaba el refresco preventivo, que obliga a
//   volver andando hasta la 13 → la plataforma se atraganta ahí. Con rangos de una
//   semana no se notaba; «Sin fechas» (33 páginas) lo destapa siempre.
//   Arreglo: cuando no hay total de registros se parte por NÚMERO DE PÁGINAS, que sí
//   está. El umbral (8) va por debajo del refresco preventivo (12) para que ningún
//   tramo llegue nunca a necesitarlo.
//   Y de paso MAX_PROFUNDIDAD sube de 7 a 14: con 7 el troceado se quedaba sin fondo
//   antes de llegar al día suelto (365/2⁷ ≈ 3 días, y con 11 años ≈ 33), así que un
//   pico concentrado seguía dando un tramo enorme. Lo cazó la simulación, no el portal.
//
// v20.5 · EL ATASCO DE LA PÁGINA 13, esta vez de verdad. La explicación de 20.4 era
//   falsa: «Open Requests» SÍ imprime «of N records» (se leyó mal, antes de buscar) y el
//   troceado sí se activaba. Lo que pasa es que las 217 RFx eran TODAS DEL MISMO DÍA, y
//   un día no se puede partir por fechas: 15 páginas a pelo, refresco preventivo en la
//   12, y a por la 13.
//   La causa está en irPagina(): el paginador es una ventana deslizante, así que desde
//   la página 1 el «13» no es pulsable y hay que ir con la flecha «siguiente» — pero la
//   espera exigía estar YA en la 13 después de ese primer clic, que lleva a la 2. Los
//   45 s se agotaban tres veces y se daba por muerta una página que estaba perfecta:
//   medido en el portal, andando de una en una se llega a la 13 en 1-2 s por página.
//   Ahora se espera la página a la que ese clic lleva, no la del final del viaje.
//
// v20.6 · Los contadores de los filtros van EN CASCADA. Antes cada grupo contaba sobre
//   el resultado entero, así que con «Orange 18» puesto el grupo de servicios seguía
//   diciendo «Diseño 20»: un número imposible que hace dudar de toda la pantalla.
//   Ahora cada grupo cuenta sobre lo que dejan pasar los demás filtros (menos el suyo,
//   para poder cambiar de opción dentro de él), y las opciones sin nada detrás se
//   quedan a la vista pero apagadas, para que los botones no bailen de sitio.
//   De paso, un único `pasaFiltro(fila, omitir)` sirve a la tabla Y a los contadores.
//   Tenerlos por duplicado es exactamente cómo se llega a una tabla que no cuadra con
//   su propio título.
//
// v21.0 · MARCHA ATRÁS sobre la aceptación automática, pedida por los gestores.
//   · El botón «clasificar» sale ahora en TODAS las filas con clave, no solo en las de
//     «revisar»: para dar marcha atrás sobre una que se acepta sola hay que poder
//     abrirla.
//   · Dentro, si ese OPERADOR#importe hoy se acepta solo, aparece «sacarla de la
//     aceptación automática». Retira el AUTOMATISMO, no la posibilidad: pasa a
//     «revisar», así que deja de preseleccionarse pero se puede aceptar a mano tras
//     mirarla. Y se deshace cuando se quiera.
//   · Alcanza a todas las de ese operador e importe: corrige la regla, no el caso.
//   · Surte efecto EN EL ACTO y en el ordenador del gestor, sin esperar a nada. Pero
//     la tabla de la verdad vive dentro de este fichero, así que para que valga para
//     todos hay que exportar la aportación, quitar la regla aquí y publicar versión
//     nueva. La caja de Aportaciones dice, regla a regla, si sigue viva en el script o
//     si ya se recogió y esa retirada sobra.
//
// v21.1 · «Copiar aviso para Pepe». El mensaje no dice «quita la 28.09»: trae LA LÍNEA
//   LITERAL que hay que borrar, sacada de la propia tabla, más los pasos (no tocar
//   no_aceptar, subir las dos versiones, pasar test_release.js) y un bloque JSON al
//   final para que algún día una herramienta lo aplique sola. Quien mantiene el script
//   no tiene que buscar nada ni interpretar nada. Las que ya no están en la tabla no
//   salen en el aviso: si no, se pediría dos veces lo mismo.
//
// v21.2 · El aviso sale del propio cuadro: «Guardar y copiar aviso», con el nombre de
//   quien lo pide ahí mismo. Antes había que guardar, abrir Aportaciones y buscar el
//   botón; el aviso interesa en el momento de retirar, no tres clics después. El botón
//   se queda apagado mientras no esté marcado «Sí, que pase a revisar»: apagado dice
//   más que escondido, porque se ve que existe y por qué no se puede usar todavía.
//
// v21.3 · Dos cosas:
//   · FALLO: al retirar, la fila seguía diciendo «aceptar» y seguía MARCADA. La decisión
//     se calcula al recoger y se guarda en la fila; nadie se la volvía a preguntar. Se
//     añade reevaluar(), que repasa todas las filas —una retirada afecta a todas las de
//     ese operador e importe, no solo a la abierta—, las desmarca, y al devolverla las
//     vuelve a marcar. Sin esto, «dar marcha atrás» dejaba la RFx en la cola de
//     aceptación, que es exactamente lo contrario de lo pedido.
//   · El aviso se puede mandar por correo: «Guardar y enviar aviso» abre Outlook con
//     todo escrito. El cuerpo es una versión corta del mismo generador, porque un
//     mailto largo lo trunca Outlook sin decir nada; si aun así no cabe, no se intenta:
//     se copia entero y se avisa. El destinatario se pone una vez (o de fábrica, en
//     CORREO_MANTENIMIENTO, para que venga puesto a todos los gestores).
//
// v21.3.1 · Abrir «Aportaciones» a media tabla sube el panel arriba. La caja se pinta
//   sobre el listado y comparte contenedor con él, así que desde la mitad se abría
//   fuera de la vista y parecía que el botón estaba muerto. Al cerrarla no se toca el
//   scroll: ahí sí interesa volver a la fila que estabas mirando.
(() => {
  'use strict';

  const VERSION = '21.3.1';
  const LOGO_AAT = 'https://aatconsultoria.com/wp-content/uploads/2021/07/AAT_Logo_White.png';
  // PARA QUIEN PUBLIQUE EL SCRIPT: pon aquí el correo de quien mantiene las tablas y
  // todos los gestores lo tendrán ya puesto al redactar el aviso. Si se queda vacío,
  // el correo se abre sin destinatario y cada uno lo escribe (y se le recuerda).
  const CORREO_MANTENIMIENTO = '';

  // Esta misma página hace de dos cosas según cómo se abra:
  //  · normal  → pone el botón flotante «Aceptar RFx» y nada más.
  //  · #aat-panel → ES la ventana del panel: se tapa el portal y manda la herramienta.
  const MODO_PANEL = /(^|[#&])aat-panel\b/.test(location.hash);
  if (MODO_PANEL) window.__AAT_PANEL_LISTO = true;

  // Tercer modo: llegar con una RFx concreta y dejar la lista buscada por ella.
  const IR_A = (location.hash.match(/(?:^|[#&])aat-ir=(7\d{9})/) || [])[1] || null;

  // ── Tiempos ────────────────────────────────────────────────────────────────────────
  const ESPERA_CARGA    = 45000;  // carga de página del motor
  const ESPERA_BUSQUEDA = 45000;  // resultado de una búsqueda
  const ESPERA_PAGINA   = 45000;  // salto de página. Medido en el portal: 1-2 s con la
                                  // plataforma descansada, pero bajo carga sostenida se
                                  // va muy por encima. Bajarlo a 25 s fue un error mío:
                                  // la v14 usaba 45 s y por algo era.
  const PAUSA_ENTRE_PAGINAS = 500; // no atropellar a la plataforma (v14 hacía lo mismo)
  const REINTENTOS_PAGINA   = 2;   // reintento del mismo clic antes de refrescar el motor
  const PAGS_POR_REFRESCO = 12;   // refresco preventivo del motor durante la recogida
  const MAX_POR_TRAMO   = 150;    // 10 páginas. Por encima de esto, el rango se parte en dos.
  // MEDIDO EN EL PORTAL (14-sep-2026): «Open Requests» NO imprime el «of N records» que
  // sí dan las otras pantallas. Sin ese número, el troceado por fechas —que es toda la
  // defensa contra atascarse paginando— no llegaba a activarse NUNCA aquí. Se tapaba
  // solo porque con rangos de una semana no se llegaba a tantas páginas. Así que cuando
  // no hay total se usa lo que sí hay: el número de páginas del paginador.
  // 8 está por debajo de PAGS_POR_REFRESCO a propósito: si ningún tramo llega a 12
  // páginas, el refresco preventivo —que obliga a volver andando hasta la página N, que
  // es donde la plataforma se atraganta— no se dispara jamás.
  const MAX_PAGINAS_TRAMO = 8;
  // Antes era 7, y la nota decía «suficiente para partir un año en días». No lo era:
  // 365/2⁷ son casi 3 días, y con 11 años («Sin fechas») el tramo más fino se quedaba
  // en 33. Si esos días traen mucha RFx, el tramo sigue siendo enorme y se acaba
  // paginando igual. Con 14 se llega al día suelto incluso partiendo de 2015 (2¹⁴ =
  // 16.384 > 4.275 días). No cuesta nada: solo se baja donde de verdad hace falta.
  const MAX_PROFUNDIDAD = 14;
  const RFX_POR_REFRESCO  = 20;   // refresco durante la aceptación (validado con 326 RFx)
  const RFX_POR_REFRESCO_VER = 25;

  // ── Reglas de los coordinadores (2026-08-11) ──────────────────────────────────────
  // 39 aceptar · 3 no aceptar. Lo que no está aquí cae en «revisar» y NO se preselecciona.
  const REGLAS = {
    aceptar: {
      "OSP#97.53": { firma: "OSP#INGPLAN-01-SER:1", srv: "DIS" },
      "OSP#221.93": { firma: "OSP#DISORG-01-SER:1|INGDOC-01-SER:1|RADREP01-SER:1", srv: "DIS" },
      "OSP#34.24": { firma: "OSP#DISADIC-01-SER:1", srv: "DIS" },
      "OSP#76.73": { firma: "OSP#RADREP05-SER:1", srv: "DIS" },
      "OSP#55.24": { firma: "OSP#RADREP03-SER:1", srv: "DIS" },
      "OSP#28.09": { firma: "OSP#INGMODPLAN-01-SER:1", srv: "DIS" },
      "OSP#154.40": { firma: "OSP#DISORG-01-SER:1|INGDOC-01-SER:1|RADREP03-SER:1", srv: "DIS" },
      "OSP#199.50": { firma: "OSP#RADREP01A-SER:1", srv: "DIS" },
      "TME#20.63": { firma: "TME#ER_015:1", srv: "EMR" },
      "TME#41.26": { firma: "TME#ER_015:2", srv: "EMR" },
      "TME#296.62": { firma: "TME#DISTEL-01-SER:1|INGPLAN-01-SER:1|RADREP01-SER:1", srv: "DIS" },
      "TME#22.84": { firma: "TME#INGDOC-01-SER:1", srv: "DIS" },
      "TME#81.49": { firma: "TME#INGMODPLAN-01-SER:1|MOD-SOL-01-SER:1", srv: "DIS" },
      "TME#34.24": { firma: "TME#DISADIC-01-SER:1", srv: "DIS" },
      "TME#53.50": { firma: "TME#DISTEL-02-SER:1", srv: "DIS" },
      "TME#35.82": { firma: "TME#INGPLAN-02-SER:1", srv: "DIS" },
      "TME#89.32": { firma: "TME#DISTEL-02-SER:1|INGPLAN-02-SER:1", srv: "DIS" },
      "TME#50.93": { firma: "TME#INGDOC-01-SER:1|INGMODPLAN-01-SER:1", srv: "DIS" },
      "TME#87.74": { firma: "TME#DISADIC-01-SER:1|DISTEL-02-SER:1", srv: "DIS" },
      "TME#123.56": { firma: "TME#DISADIC-01-SER:1|DISTEL-02-SER:1|INGPLAN-02-SER:1", srv: "DIS" },
      "TME#76.73": { firma: "TME#RADREP05-SER:1", srv: "DIS" },
      "TME#117.70": { firma: "TME#RADREPMI-SER:1", srv: "DIS" },
      "TME#110.97": { firma: "TME#DISADIC-01-SER:1|RADREP05-SER:1", srv: "DIS" },
      "TME#45.68": { firma: "TME#INGDOC-01-SER:1|INGREV02-SER:1", srv: "DIS" },
      "TME#164.47": { firma: "TME#DISADIC-01-SER:1|DISTEL-02-SER:1|RADREP05-SER:1", srv: "DIS" },
      "TME#104.41": { firma: "TME#DISTEL-01-SER:1|INGMODPLAN-01-SER:1", srv: "DIS" },
      "TME#170.81": { firma: "TME#DISTEL-02-SER:1|INGMODPLAN-01-SER:1|INGPLAN-02-SER:1|MOD-SOL-01-SER:1", srv: "DIS" },
      "TME#133.74": { firma: "TME#INGMODPLAN-01-SER:1|MOD-SOL-01-SER:1|MODPLANDDEE-01-SER:1", srv: "DIS" },
      "TME#156.93": { firma: "TME#INGCVE-01-SER:1", srv: "DIS" },
      "TME#173.85": { firma: "TME#DISTEL-01-SER:1|INGPLAN-01-SER:1", srv: "DIS" },
      "TME#28.09": { firma: "TME#INGMODPLAN-01-SER:1", srv: "DIS" },
      "TME#53.40": { firma: "TME#MOD-SOL-01-SER:1", srv: "DIS" },
      "VDF#20.63": { firma: "VDF#ER_015:1", srv: "EMR" },
      "VDF#77.25": { firma: "VDF#INGVOD-01-SER:1", srv: "DIS" },
      "VDF#28.09": { firma: "VDF#INGMODPLAN-01-SER:1", srv: "DIS" },
      "VDF#76.73": { firma: "VDF#RADREP05-SER:1", srv: "DIS" },
      "VDF#81.49": { firma: "VDF#INGMODPLAN-01-SER:1|MOD-SOL-01-SER:1", srv: "DIS" },
      "VDF#97.53": { firma: "VDF#INGPLAN-01-SER:1", srv: "DIS" },
      "VDF#381.14": { firma: "VDF#INGCVE-02-SER:1", srv: "DIS" },
    },
    no_aceptar: {
      "TME#259.59": { firma: "TME#ER_001:1|ER_006:1", srv: "EMR" },
      "TME#323.28": { firma: "TME#ER_001:1|ER_003:1|ER_006:1|ER_007:1", srv: "EMR" },
      "TME#386.97": { firma: "TME#ER_001:1|ER_003:2|ER_006:1|ER_007:2", srv: "EMR" },
    }
  };

  // ── Recetario ────────────────────────────────────────────────────────────────────
  // 137 desgloses sacados de 4.026 RFx reales. NO son decisiones: no dicen si hay que
  // aceptar, solo de qué se compone el importe. Sirven para que quien revisa no tenga
  // que abrir el portal para saber qué está mirando.
  // Medido sobre la sábana del 17-ago: de las 62 RFx que caían en «revisar», 57 (92 %)
  // quedan explicadas con esto.
  const RECETAS = {
      "OSP#104.41": { f: "DISORG-01-SER:1|INGMODPLAN-01-SER:1", srv: "DIS" },
      "OSP#1046.00": { f: "QB_RS01_PIM_NOCAT:1", srv: "PIM" },
      "OSP#1054.70": { f: "MED-Joint visit:1|MED-PIM_Additional bands:1|MED-PIM_First band:1", srv: "PIM" },
      "OSP#106.80": { f: "MOD-SOL-01-SER:2", srv: "DIS" },
      "OSP#110.97": { f: "DISADIC-01-SER:1|RADREP05-SER:1", srv: "DIS" },
      "OSP#1102.94": { f: "MED-PIM_Additional bands:3|MED-PIM_First band:1", srv: "PIM" },
      "OSP#113.66": { f: "DISORG-01-SER:1.19|INGDOC-01-SER:1", srv: "DIS" },
      "OSP#115.73": { f: "DISADIC-01-SER:1|INGMODPLAN-01-SER:1|MOD-SOL-01-SER:1", srv: "DIS" },
      "OSP#116.06": { f: "INGPLAN-01-SER:1.19", srv: "DIS" },
      "OSP#118.00": { f: "DISORG-01-SER:1.19|INGDOC-01-SER:1.19", srv: "DIS" },
      "OSP#122.77": { f: "RADREP01-SER:1", srv: "DIS" },
      "OSP#1264.69": { f: "MED-Joint visit:1|MED-PIM_Additional bands:2|MED-PIM_First band:1", srv: "PIM" },
      "OSP#1278.00": { f: "QB_RS01_PIM_NOCAT:1", srv: "PIM" },
      "OSP#131.77": { f: "DISADIC-01-SER:1|INGPLAN-01-SER:1", srv: "DIS" },
      "OSP#131.97": { f: "RADREP03-SER:1|RADREP05-SER:1", srv: "DIS" },
      "OSP#145.14": { f: "INGMODPLAN-01-SER:1|INGORG-01-SER:1|MOD-SOL-01-SER:1", srv: "DIS" },
      "OSP#145.61": { f: "INGDOC-01-SER:1|RADREP01-SER:1", srv: "DIS" },
      "OSP#146.10": { f: "RADREP01-SER:1.19", srv: "DIS" },
      "OSP#152.56": { f: "DISORG-01-SER:1|INGDOC-01-SER:1|MOD-SOL-01-SER:1", srv: "DIS" },
      "OSP#152.77": { f: "INGPLAN-01-SER:1|RADREP03-SER:1", srv: "DIS" },
      "OSP#153.46": { f: "RADREP05-SER:2", srv: "DIS" },
      "OSP#158.30": { f: "MED-Failed visit:1", srv: "PIM" },
      "OSP#161.18": { f: "INGORG-01-SER:1|INGPLAN-01-SER:1", srv: "DIS" },
      "OSP#162.98": { f: "INGMODPLAN-01-SER:2|MOD-SOL-01-SER:2", srv: "DIS" },
      "OSP#168.90": { f: "DISORG-01-SER:1.19|INGDOC-01-SER:1|RADREP03-SER:1", srv: "DIS" },
      "OSP#170.97": { f: "DISADIC-01-SER:1|INGMODPLAN-01-SER:1|MOD-SOL-01-SER:1|RADREP03-SER:1", srv: "DIS" },
      "OSP#174.26": { f: "INGPLAN-01-SER:1|RADREP05-SER:1", srv: "DIS" },
      "OSP#183.74": { f: "DISORG-01-SER:1.19|INGDOC-01-SER:1.19|RADREP03-SER:1.19", srv: "DIS" },
      "OSP#188.64": { f: "DISADIC-01-SER:1|DISORG-01-SER:1|INGDOC-01-SER:1|RADREP03-SER:1", srv: "DIS" },
      "OSP#195.06": { f: "INGPLAN-01-SER:2", srv: "DIS" },
      "OSP#199.09": { f: "DISORG-01-SER:1|RADREP01-SER:1", srv: "DIS" },
      "OSP#208.82": { f: "DISORG-01-SER:2|INGMODPLAN-01-SER:2", srv: "DIS" },
      "OSP#209.99": { f: "MED-PIM_Additional bands:1", srv: "PIM" },
      "OSP#229.09": { f: "DISORG-01-SER:1|INGPLAN-01-SER:1|RADREP03-SER:1", srv: "DIS" },
      "OSP#229.72": { f: "DISORG-01-SER:1.19|INGDOC-01-SER:1|INGPLAN-01-SER:1.19", srv: "DIS" },
      "OSP#232.12": { f: "INGPLAN-01-SER:2.38", srv: "DIS" },
      "OSP#235.32": { f: "INGPLAN-02-SER:1|RADREP01a-SER:1", srv: "DIS" },
      "OSP#240.74": { f: "INGDOC-01-SER:2|INGPLAN-01-SER:2", srv: "DIS" },
      "OSP#256.17": { f: "DISADIC-01-SER:1|DISORG-01-SER:1|INGDOC-01-SER:1|RADREP01-SER:1", srv: "DIS" },
      "OSP#259.47": { f: "INGPLAN-01-SER:1|RADREP04-SER:1", srv: "DIS" },
      "OSP#261.20": { f: "DISORG-01-SER:1|INGDOC-01-SER:1|MOD-SOL-01-SER:2|RADREP03-SER:1", srv: "DIS" },
      "OSP#263.54": { f: "DISADIC-01-SER:2|INGPLAN-01-SER:2", srv: "DIS" },
      "OSP#274.95": { f: "DDEEREP-XS-SER:1.19|INGDOC-01-SER:1", srv: "DIS" },
      "OSP#297.03": { f: "INGPLAN-01-SER:1|RADREP01a-SER:1", srv: "DIS" },
      "OSP#297.48": { f: "DISORG-01-SER:3|INGDOC-01-SER:3", srv: "DIS" },
      "OSP#308.80": { f: "DISORG-01-SER:2|INGDOC-01-SER:2|RADREP03-SER:2", srv: "DIS" },
      "OSP#318.26": { f: "INGPRO-01-SER:1", srv: "DIS" },
      "OSP#319.46": { f: "DISORG-01-SER:1|INGDOC-01-SER:1|INGPLAN-01-SER:1|RADREP01-SER:1", srv: "DIS" },
      "OSP#337.16": { f: "DDEEREP-XS-SER:1.19|INGORG-02-SER:1", srv: "DIS" },
      "OSP#35.82": { f: "INGPLAN-02-SER:1", srv: "DIS" },
      "OSP#350.16": { f: "DDEEPLAN-XS-SER:1.19", srv: "DIS" },
      "OSP#356.43": { f: "DDEEPLAN-XS-SER:1|MODPLANDDEE-01-SER:1.19", srv: "DIS" },
      "OSP#360.00": { f: "DDEEREP-XS-SER:1.19|INGDOC-01-SER:1|INGORG-02-SER:1", srv: "DIS" },
      "OSP#382.49": { f: "DISORG-01-SER:1.19|INGDOC-01-SER:1|INGPLAN-01-SER:2.19|RADREP03-SER:1", srv: "DIS" },
      "OSP#395.31": { f: "DISADIC-01-SER:3|INGPLAN-01-SER:3", srv: "DIS" },
      "OSP#415.24": { f: "DDEEREP-XS-SER:1.19|INGDOC-01-SER:1|INGORG-02-SER:1|RADREP03-SER:1", srv: "DIS" },
      "OSP#419.98": { f: "MED-PIM_Additional bands:2", srv: "PIM" },
      "OSP#432.58": { f: "DDEEPLAN-XS-SER:1.19|INGDOC-01-SER:1.19|RADREP03-SER:1", srv: "DIS" },
      "OSP#443.86": { f: "DISORG-01-SER:2|INGDOC-01-SER:2|RADREP01-SER:2", srv: "DIS" },
      "OSP#472.97": { f: "MED-PIM_First band:1", srv: "PIM" },
      "OSP#506.11": { f: "DDEEPLAN-XS-SER:1|DDEEREP-XS-SER:1", srv: "DIS" },
      "OSP#52.25": { f: "MODPLANDDEE-01-SER:1", srv: "DIS" },
      "OSP#528.95": { f: "DDEEPLAN-XS-SER:1|DDEEREP-XS-SER:1|INGDOC-01-SER:1", srv: "DIS" },
      "OSP#53.40": { f: "MOD-SOL-01-SER:1", srv: "DIS" },
      "OSP#554.26": { f: "DDEEPLAN-S-SER:1", srv: "DIS" },
      "OSP#56.18": { f: "INGMODPLAN-01-SER:2", srv: "DIS" },
      "OSP#622.04": { f: "DDEEREP-XS-SER:2|DISORG-01-SER:2|INGDOC-01-SER:2", srv: "DIS" },
      "OSP#63.65": { f: "INGORG-01-SER:1", srv: "DIS" },
      "OSP#68.48": { f: "DISADIC-01-SER:2", srv: "DIS" },
      "OSP#682.96": { f: "MED-PIM_Additional bands:1|MED-PIM_First band:1", srv: "PIM" },
      "OSP#76.32": { f: "DISORG-01-SER:1", srv: "DIS" },
      "OSP#78.08": { f: "INGDOC-01-SER:1|RADREP03-SER:1", srv: "DIS" },
      "OSP#81.49": { f: "INGMODPLAN-01-SER:1|MOD-SOL-01-SER:1", srv: "DIS" },
      "OSP#82.42": { f: "INGDOC-01-SER:1.19|RADREP03-SER:1", srv: "DIS" },
      "OSP#89.48": { f: "DISADIC-01-SER:1|RADREP03-SER:1", srv: "DIS" },
      "OSP#892.95": { f: "MED-PIM_Additional bands:2|MED-PIM_First band:1", srv: "PIM" },
      "OSP#945.94": { f: "MED-PIM_First band:2", srv: "PIM" },
      "OSP#99.16": { f: "DISORG-01-SER:1|INGDOC-01-SER:1", srv: "DIS" },
      "TME#106.80": { f: "MOD-SOL-01-SER:2", srv: "DIS" },
      "TME#1063.32": { f: "ER_006:1|ER_007:1|MED-PIM_Additional bands:2|MED-PIM_First band:1", srv: "EMR" },
      "TME#115.73": { f: "DISADIC-01-SER:1|INGMODPLAN-01-SER:1|MOD-SOL-01-SER:1", srv: "DIS" },
      "TME#117.31": { f: "INGMODPLAN-01-SER:1|INGPLAN-02-SER:1|MOD-SOL-01-SER:1", srv: "DIS" },
      "TME#122.77": { f: "RADREP01-SER:1", srv: "DIS" },
      "TME#125.03": { f: "ER_001b:1|ER_003:1", srv: "EMR" },
      "TME#125.86": { f: "ER_001:1", srv: "EMR" },
      "TME#130.23": { f: "DISTEL-02-SER:1|RADREP05-SER:1", srv: "DIS" },
      "TME#133.73": { f: "ER_006:1", srv: "EMR" },
      "TME#134.99": { f: "DISTEL-02-SER:1|INGMODPLAN-01-SER:1|MOD-SOL-01-SER:1", srv: "DIS" },
      "TME#1365.92": { f: "MED-PIM_Additional bands:2|MED-PIM_First band:2", srv: "PIM" },
      "TME#146.40": { f: "DISADIC-01-SER:1|DISTEL-02-SER:1|INGDOC-01-SER:1|INGPLAN-02-SER:1", srv: "DIS" },
      "TME#152.91": { f: "ER_001:1|ER_003:1", srv: "EMR" },
      "TME#153.46": { f: "RADREP05-SER:2", srv: "DIS" },
      "TME#158.30": { f: "MED-Failed visit:1", srv: "PIM" },
      "TME#169.72": { f: "DISTEL-01-SER:1|DISTEL-02-SER:1", srv: "DIS" },
      "TME#170.37": { f: "ER_006:1|ER_007:1", srv: "EMR" },
      "TME#179.96": { f: "ER_001:1|ER_003:2", srv: "EMR" },
      "TME#181.14": { f: "DISTEL-01-SER:1|INGMODPLAN-01-SER:1|RADREP05-SER:1", srv: "DIS" },
      "TME#194.02": { f: "DISTEL-01-SER:1|RADREPMI-SER:1", srv: "DIS" },
      "TME#200.29": { f: "DISADIC-01-SER:1|DISTEL-02-SER:1|INGPLAN-02-SER:1|RADREP05-SER:1", srv: "DIS" },
      "TME#243.65": { f: "ER_006:1|ER_007:3", srv: "EMR" },
      "TME#250.89": { f: "ER_001:1|ER_001a:1|ER_003:1", srv: "EMR" },
      "TME#27.05": { f: "ER_003:1", srv: "EMR" },
      "TME#280.29": { f: "ER_006:1|ER_007:4", srv: "EMR" },
      "TME#316.93": { f: "ER_006:1|ER_007:5", srv: "EMR" },
      "TME#398.13": { f: "DISADIC-01-SER:1|DISTEL-02-SER:1|INGCVE-01-SER:1|RADREP05-SER:2", srv: "DIS" },
      "TME#450.66": { f: "ER_001:1|ER_003:3|ER_006:1|ER_007:3", srv: "EMR" },
      "TME#472.97": { f: "MED-PIM_First band:1", srv: "PIM" },
      "TME#682.96": { f: "MED-PIM_Additional bands:1|MED-PIM_First band:1", srv: "PIM" },
      "TME#70.06": { f: "DISADIC-01-SER:1|INGPLAN-02-SER:1", srv: "DIS" },
      "TME#76.32": { f: "DISTEL-01-SER:1", srv: "DIS" },
      "TME#79.92": { f: "DISADIC-01-SER:1|INGDOC-01-SER:2", srv: "DIS" },
      "TME#841.02": { f: "DDEEREP-S-SER:2|DISADIC-01-SER:1|DISTEL-02-SER:1", srv: "DIS" },
      "TME#892.95": { f: "MED-PIM_Additional bands:2|MED-PIM_First band:1", srv: "PIM" },
      "VDF#1025.41": { f: "DDEEPLAN-S-SER:1|DDEEREP-S-SER:1|DISTVOD-01-SER:1", srv: "DIS" },
      "VDF#1035.00": { f: "INGNOCAT-SER:1035", srv: "DIS" },
      "VDF#109.58": { f: "INGMODPLAN-01-SER:2|MOD-SOL-01-SER:1", srv: "DIS" },
      "VDF#125.86": { f: "ER_001:1", srv: "EMR" },
      "VDF#130.13": { f: "MOD-SOL-01-SER:1|RADREP05-SER:1", srv: "DIS" },
      "VDF#133.73": { f: "ER_006:1", srv: "EMR" },
      "VDF#146.49": { f: "ER_001:1|ER_015:1", srv: "EMR" },
      "VDF#152.91": { f: "ER_001:1|ER_003:1", srv: "EMR" },
      "VDF#170.37": { f: "ER_006:1|ER_007:1", srv: "EMR" },
      "VDF#173.54": { f: "ER_001:1|ER_003:1|ER_015:1", srv: "EMR" },
      "VDF#207.73": { f: "ER_001:1|ER_002:1|ER_015:1", srv: "EMR" },
      "VDF#214.15": { f: "ER_001:1|ER_002:1|ER_003:1", srv: "EMR" },
      "VDF#234.78": { f: "ER_001:1|ER_002:1|ER_003:1|ER_015:1", srv: "EMR" },
      "VDF#243.65": { f: "ER_006:1|ER_007:3", srv: "EMR" },
      "VDF#245.37": { f: "DISTVOD-01-SER:1|INGMODPLAN-01-SER:1|RADREP01-SER:1", srv: "DIS" },
      "VDF#27.05": { f: "ER_003:1", srv: "EMR" },
      "VDF#270.68": { f: "DISTVOD-01-SER:1|MOD-SOL-01-SER:1|RADREP01-SER:1", srv: "DIS" },
      "VDF#297.55": { f: "INGPLAN-01-SER:1|INGVOD-01-SER:1|RADREP01-SER:1", srv: "DIS" },
      "VDF#313.86": { f: "INGCVE-01-SER:2", srv: "DIS" },
      "VDF#314.81": { f: "DISTVOD-01-SER:1|INGPLAN-01-SER:1|RADREP01-SER:1", srv: "DIS" },
      "VDF#347.93": { f: "DISTVOD-01-SER:1|INGVOD-01-SER:1|MOD-SOL-01-SER:1|RADREP01-SER:1", srv: "DIS" },
      "VDF#368.21": { f: "DISTVOD-01-SER:1|INGPLAN-01-SER:1|MOD-SOL-01-SER:1|RADREP01-SER:1", srv: "DIS" },
      "VDF#377.38": { f: "ER_006:2|ER_007:3", srv: "EMR" },
      "VDF#53.40": { f: "MOD-SOL-01-SER:1", srv: "DIS" },
  };

  // Subtipo que el catálogo de Ericsson da a cada código (verificado sobre el
  // histórico: 464 líneas, ninguna contradicción). El subtipo NO se guarda por
  // importe: se deduce de los códigos, que es la regla que propuso Juan.
  const SUBTIPO = {
    "ER_001": "PTT",
    "ER_001A": "PTT",
    "ER_001B": "PTT",
    "ER_002": "PTT",
    "ER_003": "PTT",
    "ER_006": "PSC",
    "ER_007": "PSC",
    "ER_015": "PLL",
  };

  // Importes con MÁS DE UNA composición real conviviendo. Barrido completo del
  // histórico (4.026 RFx, 181 importes distintos): solo estos cuatro. En ellos el
  // importe NO identifica lo que se compró, así que no se afirma una composición
  // ni se deja clasificar por importe: hay que ir RFx a RFx.
  const AMBIGUAS = {
    "TME#22.84": [
      { f: "INGDOC-01-SER:1", pct: 93.9, n: 77, srv: "DIS" },
      { f: "INGREV02-SER:1", pct: 6.1, n: 5, srv: "DIS" },
    ],
    "TME#207.01": [
      { f: "ER_006:1|ER_007:2", pct: 92.1, n: 35, srv: "EMR" },
      { f: "ER_001:1|ER_003:3", pct: 7.9, n: 3, srv: "EMR" },
    ],
    "TME#45.68": [
      { f: "INGDOC-01-SER:1|INGREV02-SER:1", pct: 75.0, n: 3, srv: "DIS" },
      { f: "INGDOC-01-SER:2", pct: 25.0, n: 1, srv: "DIS" },
    ],
    "TME#158.22": [
      { f: "INGMODPLAN-01-SER:1|MOD-SOL-01-SER:1|RADREP02-SER:1", pct: 50.0, n: 1, srv: "DIS" },
      { f: "INGMODPLAN-01-SER:1|MOD-SOL-01-SER:1|RADREP05-SER:1", pct: 50.0, n: 1, srv: "DIS" },
    ],
  };

  // Subtipo de una composición: se deduce de sus códigos. Si conviven varios, se
  // devuelven todos — que es exactamente lo que pasa en TME#207.01.
  function subtipoDeFirma(firma) {
    const tags = [];
    for (const parte of String(firma || '').split('|')) {
      const cod = parte.split(':')[0].trim().toUpperCase();
      const t = SUBTIPO[cod];
      if (t && !tags.includes(t)) tags.push(t);
    }
    return tags;
  }

  const esAmbiguo = clave => !!(clave && AMBIGUAS[clave]);

  // Lo que el script sabe por sí solo: la firma de la regla, o el recetario.
  function desgloseAutomatico(rfx) {
    const op = operadorDe(rfx.ref);
    const val = importeDe(rfx.valor);
    if (op === '?' || val === null) return null;
    const clave = op + '#' + val.toFixed(2);
    // Los ambiguos primero: aunque haya regla de aceptación con su firma, esa firma
    // no es cierta para todas las RFx de ese importe y no se puede presentar como tal.
    if (AMBIGUAS[clave]) {
      const ops = AMBIGUAS[clave];
      const srvs = [...new Set(ops.map(o => o.srv))];
      return { ambiguo: true, opciones: ops, srv: srvs.length === 1 ? srvs[0] : '', origen: 'ambiguo' };
    }
    const regla = REGLAS.aceptar[clave] || REGLAS.no_aceptar[clave];
    if (regla) return { firma: String(regla.firma).replace(/^[A-Z?]{3}#/, ''), srv: regla.srv, origen: 'regla' };
    if (RECETAS[clave]) return { firma: RECETAS[clave].f, srv: RECETAS[clave].srv, origen: 'recetario' };
    return null;
  }

  // Lo que se muestra: manda lo que el gestor haya escrito tras mirar la ficha, y si no,
  // lo que sepa el script. (Hasta la v18.2.2 esto ignoraba lo escrito a mano: se guardaba
  // en las aportaciones pero la fila seguía diciendo «sin desglose conocido».)
  function desgloseDe(rfx) {
    const clave = claveClasif(rfx);
    const man = clave && S.clasificaciones[clave];
    if (man && man.desglose)
      return { firma: man.desglose, srv: man.servicio || '', origen: 'manual' };
    return desgloseAutomatico(rfx);
  }

  // «DISORG-01-SER:1|INGDOC-01-SER:2» → «1 × DISORG-01-SER · 2 × INGDOC-01-SER»
  function firmaLegible(firma) {
    return String(firma).split('|').map(t => {
      const m = t.match(/^(.*):(\d+)$/);
      return m ? `${m[2]} × ${m[1]}` : t;
    }).join(' · ');
  }

  // Servicio de una RFx, en el vocabulario de los coordinadores.
  const NOMBRE_SRV = { PIM: 'PIM', EMR: 'EMR', DIS: 'Diseño' };
  // Lo que el gestor ha clasificado a mano manda: lo ha visto en la ficha, que es la
  // fuente más fiable que hay. Si además existe receta, se avisa al clasificar.
  function servicioDe(rfx) {
    const clave = claveClasif(rfx);
    const man = clave && S.clasificaciones[clave];
    if (man && man.servicio) return man.servicio;
    const d = desgloseAutomatico(rfx);
    return (d && d.srv) || '';            // '' = pendiente de identificar
  }
  const servicioEsManual = rfx => {
    const clave = claveClasif(rfx);
    return !!(clave && S.clasificaciones[clave] && S.clasificaciones[clave].servicio);
  };

  // «EMR (PSC)», «EMR (PSC o PTT)» cuando el importe no distingue, o «EMR» a secas.
  function etiquetaServicio(rfx) {
    const srv = servicioDe(rfx);
    if (!srv) return '';
    const d = desgloseDe(rfx);
    let tags = [];
    if (d && d.ambiguo) {
      for (const o of d.opciones) for (const t of subtipoDeFirma(o.f)) if (!tags.includes(t)) tags.push(t);
    } else if (d && d.firma) {
      tags = subtipoDeFirma(d.firma);
    }
    if (!tags.length) return nombreServicio(srv);
    return `${nombreServicio(srv)} (${tags.join(' o ')})`;
  }
  // El servicio que conoce el script por sí solo, sin clasificaciones a mano.
  const servicioAutomatico = rfx => { const d = desgloseAutomatico(rfx); return (d && d.srv) || ''; };
  const nombreServicio = srv => NOMBRE_SRV[srv] || 'Pendiente';

  // Dónde se guarda lo que clasifica el gestor. En un importe normal, por importe:
  // clasificas una y valen todas. En uno ambiguo eso sería mentir sobre las demás,
  // así que se guarda POR RFx.
  const claveClasif = rfx => {
    const k = claveDe(rfx);
    if (!k) return null;
    return esAmbiguo(k) ? 'rfx:' + rfx.num : k;
  };

  const claveDe = rfx => {
    const op = operadorDe(rfx.ref), val = importeDe(rfx.valor);
    return (op === '?' || val === null) ? null : op + '#' + val.toFixed(2);
  };

  // ── Utilidades ────────────────────────────────────────────────────────────────────
  const dormir = ms => new Promise(r => setTimeout(r, ms));

  // Espera a que `cond()` devuelva algo verdadero, o se rinde a los `ms`.
  //
  // OJO, ESTO ES IMPORTANTE Y COSTÓ ENCONTRARLO: no se puede sondear con setTimeout.
  // Chrome frena los temporizadores de las pestañas que no están a la vista: pide 200 ms
  // y te sirve 1.000, y a partir de cinco minutos oculta los deja en uno por minuto.
  // Con eso, una espera de 45 s podía no llegar a comprobar NADA, y el script daba por
  // muerta una página que había llegado hace rato. Medido en el portal el 25-ago-2026:
  // visibilityState 'hidden', saltos de 200 ms servidos a 913, 1922, 2917 ms…
  //
  // La solución es no preguntar, sino que nos avisen: MutationObserver dispara cuando
  // el DOM cambia de verdad y NO está sujeto a ese frenado. El intervalo queda solo de
  // red de seguridad, y el plazo se mide con Date.now(), así que si el temporizador
  // llega tarde lo único que pasa es que somos más pacientes, nunca menos.
  function esperar(cond, ms = ESPERA_CARGA) {
    return new Promise(resolve => {
      const limite = Date.now() + ms;
      let hecho = false, obs = null, iv = null, to = null, docObservado = null;

      const fin = v => {
        if (hecho) return;
        hecho = true;
        try { obs && obs.disconnect(); } catch (e) {}
        clearInterval(iv); clearTimeout(to);
        resolve(v);
      };

      const probar = () => {
        if (hecho) return;
        let v; try { v = cond(); } catch (e) { v = false; }
        if (v) return fin(v);
        if (Date.now() >= limite) fin(null);
      };

      const observar = () => {
        try {
          const d = M.doc;
          if (!d || !d.body || d === docObservado) return;
          try { obs && obs.disconnect(); } catch (e) {}
          const MO = (M.win && M.win.MutationObserver) || window.MutationObserver;
          obs = new MO(probar);
          obs.observe(d.body, { childList: true, subtree: true, characterData: true });
          docObservado = d;
        } catch (e) {}
      };

      observar();
      iv = setInterval(() => { observar(); probar(); }, 250);
      to = setTimeout(() => fin(null), ms + 2000);
      probar();
    });
  }

  // El operador SIEMPRE está en el Request name. Bug histórico: no fiarse de otra cosa.
  function operadorDe(ref) {
    if (!ref) return '?';
    const t = ref.toUpperCase();
    if (t.startsWith('ORES') || t.startsWith('ORANES')) return 'OSP';
    if (t.startsWith('VODAES') || t.startsWith('VODA')) return 'VDF';
    if (/_P-\d/.test(t) || /^\d/.test(t)) return 'TME';
    return '?';
  }

  // NUEVO · El proyecto es el segmento _P-nnnnnn del Request name.
  // Verificado contra las 336 RFx reales del 17-ago: aparece en el 100 %,
  // tanto en ORES_BI0052_P-303119 como en 2500023_P-336535.
  function proyectoDe(ref) {
    const m = String(ref || '').match(/(P-\d+)/i);
    return m ? m[1].toUpperCase() : '';
  }

  // El separador decimal es el ÚLTIMO que aparece. Vale para 1.234,56 y para 1,264.69.
  function importeDe(txt) {
    const limpio = String(txt).replace(/eur/i, '').replace(/[|\s]/g, '');
    const ultimoPunto = limpio.lastIndexOf('.');
    const ultimaComa  = limpio.lastIndexOf(',');
    let n;
    if (ultimoPunto < 0 && ultimaComa < 0) n = parseFloat(limpio);
    else if (ultimaComa > ultimoPunto) n = parseFloat(limpio.replace(/\./g, '').replace(',', '.'));
    else n = parseFloat(limpio.replace(/,/g, ''));
    return Number.isFinite(n) ? n : null;
  }

  // ═══ LISTA PEGADA ═════════════════════════════════════════════════════════════════
  // Pegar una columna de Excel es cómodo y traicionero a partes iguales. Excel entrega
  // «7,00427E+09» si la celda es numérica y estrecha, se come el cero final si alguien
  // la formateó como número, y un rango filtrado copia TAMBIÉN las filas ocultas.
  // Ninguna de esas cosas avisa: dan números que PARECEN RFx. Así que aquí no se
  // descarta nada en silencio: todo lo que no sea un 7 + 9 cifras se devuelve con su
  // motivo para enseñárselo al gestor.
  function parsearLista(texto) {
    const numeros = [], vistos = new Set(), duplicados = [], descartados = [];
    const trozos = String(texto || '')
      .replace(/\u00a0/g, ' ')                    // espacio duro que pega Excel
      // «7,00427E+09» lleva la coma como separador DECIMAL, no como separador de celdas.
      // Si se parte por ahí salen dos trozos raros y dos avisos confusos en vez de uno
      // claro. Se normaliza a punto antes de trocear para que llegue entero al examen.
      .replace(/(\d)[,](\d*\s*[eE])/g, '$1.$2')
      .split(/[\s,;|]+/)
      .map(t => t.replace(/^["'\u201c\u201d]+|["'\u201c\u201d]+$/g, '').trim())
      .filter(Boolean);

    for (const crudo of trozos) {
      const t = crudo.replace(/\.$/, '');
      let motivo = null;
      if (/e\s*\+?\s*\d+/i.test(t))            motivo = 'Excel lo ha convertido a notación científica; formatea la columna como Texto y vuelve a copiar';
      else if (/[.,]\d/.test(t))                 motivo = 'lleva decimales';
      else if (/[^0-9]/.test(t))                 motivo = 'tiene caracteres que no son cifras';
      else if (t.length !== 10)                  motivo = `tiene ${t.length} cifras y una RFx tiene 10`;
      else if (t[0] !== '7')                     motivo = 'no empieza por 7';
      if (motivo) { descartados.push({ crudo, motivo }); continue; }
      if (vistos.has(t)) { duplicados.push(t); continue; }
      vistos.add(t); numeros.push(t);
    }
    return { numeros, duplicados, descartados, pegados: trozos.length };
  }

  function decidir(rfx) {
    const op = operadorDe(rfx.ref);
    const val = importeDe(rfx.valor);
    if (op === '?' || val === null) return { d: 'wait', motivo: 'operador/importe no reconocido' };
    const clave = op + '#' + val.toFixed(2);
    if (REGLAS.no_aceptar[clave]) return { d: 'stop', motivo: 'regla: no aceptar', srv: REGLAS.no_aceptar[clave].srv };
    // La marcha atrás del gestor va DESPUÉS del veto de coordinador (ése no se toca) y
    // ANTES de la regla de aceptar. No bloquea: devuelve el importe a «revisar», que es
    // lo que significa sacarlo de la automática — se retira el automatismo, no la
    // posibilidad de aceptarlo mirándolo. Y por eso mismo se puede deshacer.
    const ret = S.retiradas && S.retiradas[clave];
    if (ret && REGLAS.aceptar[clave])
      return { d: 'wait', motivo: 'retirada de la automática por el gestor', srv: REGLAS.aceptar[clave].srv, retirada: true };
    if (REGLAS.aceptar[clave])    return { d: 'go',   motivo: 'regla: aceptar',    srv: REGLAS.aceptar[clave].srv };
    return { d: 'wait', motivo: `sin regla para ${op} ${val.toFixed(2)}€` };
  }


  // `D` es el documento donde vive el panel: la pestaña del portal, o la ventana
  // emergente si el usuario la ha sacado a otro monitor.
  function descargar(texto, nombre, D = document) {
    const V = D.defaultView || window;
    const blob = new V.Blob(['﻿' + texto], { type: 'text/plain;charset=utf-8;' });
    const url = V.URL.createObjectURL(blob);
    const a = Object.assign(D.createElement('a'), { href: url, download: nombre });
    D.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => V.URL.revokeObjectURL(url), 3000);
  }

  // Copiar al portapapeles. La API moderna necesita contexto seguro (lo hay: https) y
  // un clic humano detrás (lo hay). Aun así puede rechazar si la ventana pierde el foco
  // en el peor momento, así que queda el método viejo de respaldo.
  async function copiar(texto, D = document) {
    const V = D.defaultView || window;
    try {
      if (V.navigator && V.navigator.clipboard && V.isSecureContext) {
        await V.navigator.clipboard.writeText(texto);
        return true;
      }
    } catch (e) { /* caemos al plan B */ }
    try {
      const ta = D.createElement('textarea');
      ta.value = texto;
      ta.setAttribute('readonly', '');
      ta.style.cssText = 'position:fixed;top:0;left:-9999px;opacity:0';
      D.body.appendChild(ta);
      ta.select();
      ta.setSelectionRange(0, texto.length);
      const ok = D.execCommand('copy');
      ta.remove();
      return ok;
    } catch (e) { return false; }
  }

  const ICONO_COPIAR =
    '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" ' +
    'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<rect x="9" y="9" width="11" height="11" rx="2"></rect>' +
    '<path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>';
  const ICONO_ABRIR =
    '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" ' +
    'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M14 3h7v7"></path><path d="M10 14 21 3"></path>' +
    '<path d="M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5"></path></svg>';
  const ICONO_HECHO =
    '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" ' +
    'stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M20 6 9 17l-5-5"></path></svg>';

  const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const hoy = () => iso(new Date());
  const haceDias = n => { const d = new Date(); d.setDate(d.getDate() - n); return iso(d); };
  const deIso = t => { const [a, m, d] = t.split('-').map(Number); return new Date(a, m - 1, d); };
  const diasEntre = (a, b) => Math.round((deIso(b) - deIso(a)) / 86400000);
  const sumarDias = (t, n) => { const d = deIso(t); d.setDate(d.getDate() + n); return iso(d); };
  const mitadEntre = (a, b) => sumarDias(a, Math.floor(diasEntre(a, b) / 2));

  // ═══ MOTOR ════════════════════════════════════════════════════════════════════════
  // Todo el trabajo ocurre dentro de un iframe oculto del propio portal.
  // No se pueden replicar peticiones (__OSVSTATE cifrado): hay que conducir el DOM.
  const LISTA = '/ConnectedSupplier_Requests/OpenRequests_List.aspx';

  const M = {
    frame: null,
    get doc() { return M.frame?.contentDocument || null; },
    get win() { return M.frame?.contentWindow || null; },

    destruir() {
      document.querySelectorAll('iframe[data-aat-rfx]').forEach(f => f.remove());
      M.frame = null;
    },

    esperarCarga: () => new Promise(res => {
      let hecho = false;
      M.frame.onload = () => { if (!hecho) { hecho = true; res(); } };
      setTimeout(() => { if (!hecho) { hecho = true; res(); } }, ESPERA_CARGA);
    }),

    enLista() {
      try {
        return M.doc?.readyState === 'complete'
          && !!M.doc.querySelector('input[id$="wtbtnSearch"]')
          && !!M.doc.querySelector('input[id$="wtRequestNumber"]');
      } catch (e) { return false; }
    },

    // Las cuatro condiciones que hacen seguro pulsar Accept. No se relajan.
    enFicha(num) {
      try {
        const d = M.doc; if (!d) return false;
        if (d.title.indexOf('Open Request Detail') < 0) return false;
        if (num != null && d.title.indexOf(String(num)) < 0) return false;
        if (d.querySelector('table[id$="wtRequestTable"]')) return false;
        if (d.querySelector('input[id$="wtRejectButtonPopUp"]')) return false;
        const b = [...d.querySelectorAll('input[id$="wtbtnAccept"]')];
        return b.length === 1 && (b[0].value || '').trim() === 'Accept';
      } catch (e) { return false; }
    },

    // El botón Approve de la LISTA está expuesto por error por el cliente.
    // Pulsarlo causa un problema grave. Esta guarda no se toca jamás.
    clicSeguro(el, quien) {
      const id = el.id || '';
      if (M.enLista() && (/wtbtnAccept$/.test(id) || /wtRejectButtonPopUp$/.test(id)))
        throw new Error('BLOQUEADO: intento de pulsar Approve/Reject en la lista (' + quien + ')');
      el.click();
      return true;
    },

    // ── Huella de la rejilla ────────────────────────────────────────────────────────
    // NUEVO. El fallo de la v14 era dar por buena una búsqueda «porque hay una tabla»,
    // aunque fuese la del resultado anterior. Ahora comparamos una huella concreta.
    huella() {
      try {
        const d = M.doc; if (!d) return 'sin-doc';
        const tab = M.tabla();
        let primera = '';
        if (tab) {
          const a = [...tab.querySelectorAll('a')].find(x => /^7\d{9}$/.test(x.innerText.trim()));
          primera = a ? a.innerText.trim() : '';
        }
        const rec = (d.body.innerText.match(/of\s+[\d.,]+\s+records?/i)
                  || d.body.innerText.match(/[\d.,]+\s+records?/i) || [''])[0];
        const filas = tab ? tab.querySelectorAll('tr').length : 0;
        return `${M.pagActual() ?? '-'}|${rec}|${primera}|${filas}`;
      } catch (e) { return 'error:' + e.message; }
    },

    // Marca las filas actuales. Tras un postback OutSystems reconstruye los <tr>,
    // así que si ya no queda ninguna marcada es que la rejilla es NUEVA — aunque
    // los datos sean idénticos a los de antes. Es la señal fiable; la huella es el respaldo.
    marcarRejilla() {
      const tab = M.tabla();
      if (!tab) return false;
      let n = 0;
      for (const tr of tab.querySelectorAll('tr')) { tr.dataset.aatM = '1'; n++; }
      return n > 0;
    },
    quedanMarcadas() {
      const tab = M.tabla();
      return !!tab && !!tab.querySelector('tr[data-aat-m]');
    },

    // Espera a que la rejilla CAMBIE y además se quede quieta. Sin esto,
    // se lee la rejilla a medio repintar y el paginador cambia bajo los pies.
    // Ya no hace falta la «ventana de estabilidad» de la primera versión: con las marcas
    // y el número de página tenemos una señal exacta de que la rejilla es la nueva, así
    // que no hay que adivinar por quietud (que era además lo que peor aguantaba el
    // frenado de temporizadores de Chrome).
    async esperarCambioEstable(previa, ms = ESPERA_BUSQUEDA, habiaMarcas = false, destino = null) {
      return await esperar(() => {
        const h = M.huella();
        if (/^sin-doc|^error:/.test(h)) return false;
        const renovada = habiaMarcas ? !M.quedanMarcadas() : (h !== previa);
        if (!renovada) return false;
        if (!M.tabla()) return h;                                  // 0 resultados: rejilla nueva y vacía
        if (destino != null && M.pagActual() !== destino) return false;
        if (h.split('|')[2] === '') return false;                  // pintada a medias: aún sin filas
        return h;
      }, ms);
    },

    // Los filtros PERSISTEN en la sesión del servidor. Reset antes de cada operación.
    async resetFiltros(log) {
      for (let i = 1; i <= 3; i++) {
        const b = [...M.doc.querySelectorAll('input,button')]
          .find(e => (e.value || e.innerText || '').trim() === 'Reset Filters');
        if (!b) { await dormir(800); continue; }
        b.click();
        await dormir(1400);
        await esperar(() => M.enLista(), 15000);
        const campo = M.campoNumero();
        if (campo && !campo.value.trim()) return true;
        log && log(`  el reset no limpió del todo (intento ${i})`, 'w');
        await dormir(1000);
      }
      log && log('  aviso: no he podido confirmar la limpieza de filtros', 'w');
      return false;
    },

    async iniciar(log) {
      M.destruir();
      const f = document.createElement('iframe');
      f.dataset.aatRfx = '1';
      f.style.cssText = 'position:fixed;left:-10000px;top:0;width:1400px;height:900px;border:0';
      document.body.appendChild(f);
      M.frame = f;
      for (let i = 1; i <= 4; i++) {
        f.src = LISTA + (i > 1 ? '?_r=' + Date.now() : '');
        await M.esperarCarga();
        if (await esperar(() => M.enLista(), 20000)) {
          log && log('Motor listo.' + (i > 1 ? ` (intento ${i})` : ''));
          await M.resetFiltros(log);
          return true;
        }
        let donde = '¿?';
        try { donde = M.doc.location.pathname + ' · ' + M.doc.title; } catch (e) {}
        log && log(`  intento ${i}: cayó en ${donde}`, 'w');
        await dormir(1500);
      }
      throw new Error('El iframe no llegó a Open Requests tras 4 intentos.');
    },

    async volverALista(log, resetear) {
      for (let i = 1; i <= 3; i++) {
        if (!M.enLista()) {
          M.frame.src = LISTA + (i > 1 ? '?_r=' + Date.now() : '');
          await M.esperarCarga();
          await esperar(() => M.enLista(), 20000);
        }
        if (M.enLista()) {
          if (resetear) await M.resetFiltros(log);
          return true;
        }
        await dormir(1200);
      }
      throw new Error('No consigo volver a la lista de Open Requests.');
    },

    // Los ids de fecha son autogenerados: hay que anclarse a la etiqueta.
    campoFecha(etiqueta) {
      const et = [...M.doc.querySelectorAll('div,label,span')]
        .filter(e => e.children.length === 0 && e.innerText.trim().toLowerCase() === etiqueta.toLowerCase())[0];
      if (!et) return null;
      let p = et.parentElement;
      for (let i = 0; i < 5 && p; i++) {
        const inp = p.querySelector('input[placeholder="YYYY-MM-DD"]');
        if (inp) return inp;
        p = p.parentElement;
      }
      return null;
    },

    escribir(input, valor) {
      Object.getOwnPropertyDescriptor(M.win.HTMLInputElement.prototype, 'value').set.call(input, valor);
      for (const ev of ['input', 'change', 'blur'])
        input.dispatchEvent(new M.win.Event(ev, { bubbles: true }));
    },

    async fijarFechas(desde, hasta, log) {
      for (let i = 1; i <= 3; i++) {
        const a = M.campoFecha('Creation Date From');
        const b = M.campoFecha('Creation Date To');
        if (!a || !b) { await dormir(1000); continue; }
        M.escribir(a, desde); M.escribir(b, hasta);
        await dormir(500);
        const a2 = M.campoFecha('Creation Date From');
        const b2 = M.campoFecha('Creation Date To');
        if (a2?.value === desde && b2?.value === hasta) return true;
        log && log(`  fechas no cuajaron (intento ${i}): ${a2?.value} / ${b2?.value}`, 'w');
        await dormir(1200);
      }
      throw new Error('No consigo fijar el rango de fechas.');
    },

    // OJO: en la lista real hay DOS inputs cuyo id acaba en wtRequestNumber.
    // El bueno es el visible («Search by request number»); el otro es un buscador
    // de palabra clave que está oculto. Escribir en el que no es dejaría el filtro
    // sin aplicar y la lista devolvería otra cosa.
    campoNumero() {
      const todos = [...M.doc.querySelectorAll('input[id$="wtRequestNumber"]')];
      return todos.find(i => i.offsetParent !== null && i.offsetWidth > 0) || todos[0] || null;
    },

    async filtrarPorNumero(num) {
      const campo = M.campoNumero();
      if (!campo) throw new Error('sin campo Request Number');
      M.escribir(campo, String(num));
      await dormir(400);
      return M.buscar();
    },

    // REESCRITO. Antes salía de la espera en cuanto existía UNA tabla, aunque fuese
    // la del resultado anterior: de ahí el atasco de la segunda búsqueda.
    async buscar(log) {
      const btn = M.doc.querySelector('input[id$="wtbtnSearch"]');
      if (!btn) throw new Error('sin botón Search');
      const previa = M.huella();
      const habiaMarcas = M.marcarRejilla();
      M.clicSeguro(btn, 'buscar');
      const h = await M.esperarCambioEstable(previa, ESPERA_BUSQUEDA, habiaMarcas);
      if (!h) {
        // Puede ser legítimo: el resultado nuevo es idéntico al anterior.
        if (M.tabla() || /records?/i.test(M.doc.body.innerText)) {
          log && log('  la rejilla no cambió tras buscar; sigo con lo que hay', 'w');
          return true;
        }
        throw new Error('la búsqueda no respondió en ' + (ESPERA_BUSQUEDA / 1000) + ' s');
      }
      return true;
    },

    tabla:  () => M.doc?.querySelector('table[id$="wtRequestTable"]'),
    liPag:  () => M.doc?.querySelector('li.ListNavigation_CurrentPageNumber'),

    pagActual() {
      const n = parseInt((M.liPag()?.innerText || '').trim(), 10);
      return Number.isFinite(n) ? n : null;
    },

    // La verdad es «of N records», NO el número más alto del paginador:
    // con muchas páginas el paginador es una ventana deslizante.
    totalRegistros() {
      const t = M.doc?.body.innerText || '';
      const m = t.match(/of\s+([\d.,]+)\s+records?/i) || t.match(/\b([\d.,]+)\s+records?/i);
      if (!m) return null;
      const n = parseInt(m[1].replace(/[.,]/g, ''), 10);
      return Number.isFinite(n) ? n : null;
    },

    // El tamaño de página se mide UNA vez, en la primera página completa.
    // Medirlo en la última (que va a medias) inflaba el total de páginas.
    porPaginaFijo: null,
    medirPorPagina() {
      const n = M.extraerPagina().length;
      if (n > 0 && (M.porPaginaFijo == null || n > M.porPaginaFijo)) M.porPaginaFijo = n;
      return M.porPaginaFijo || 15;
    },

    pagTotal() {
      const total = M.totalRegistros();
      if (total != null) return Math.max(1, Math.ceil(total / M.medirPorPagina()));
      const ul = M.liPag()?.parentElement;
      if (!ul) return 1;
      const nums = [...ul.children].map(li => parseInt(li.innerText.trim(), 10)).filter(Number.isFinite);
      return nums.length ? Math.max(...nums) : 1;
    },

    // REESCRITO. Avanza de una en una, con la flecha «siguiente» como plan B cuando
    // la ventana deslizante no muestra el número, y espera cambio estable, no 45 s a ciegas.
    async irPagina(destino, log) {
      const MAX_CLICS = 45;
      let reintentos = 0;
      for (let paso = 0; paso < MAX_CLICS; paso++) {
        const actual = M.pagActual();
        if (actual === destino) return true;
        if (actual != null && destino < actual) {
          log && log(`  no sé retroceder de la ${actual} a la ${destino}; hace falta rehacer la búsqueda`, 'w');
          return false;
        }
        const ul = M.liPag()?.parentElement;
        if (!ul) { await dormir(800); continue; }

        // MEDIDO EN EL PORTAL: el paginador es una ventana deslizante —«1 2 3 4 5 … 15»
        // en la página 1, «1 … 6 7 8 … 15» en la 7—, así que la mayoría de los números
        // NO son pulsables desde donde estás y hay que ir con la flecha «siguiente».
        // Y ahí estaba el fallo: se esperaba llegar a `destino` después de UN clic. Con
        // destino lejano —lo que pasa justo tras el refresco preventivo, que deja el
        // motor en la 1 y pide la 13— ese clic llevaba a la 2, la espera exigía la 13,
        // y se agotaban los 45 s tres veces seguidas. El portal no tenía la culpa:
        // andando de una en una se llega a la 13 en un par de segundos por página.
        // Hay que esperar la página a la que ESE clic lleva, no la del final del viaje.
        let enlace = null, esperado = destino;
        for (const li of ul.children)
          if (li.innerText.trim() === String(destino)) { enlace = li.querySelector('a'); break; }
        if (!enlace) {
          const fuera = [...ul.parentElement.querySelectorAll('a')].filter(a => !ul.contains(a));
          if (fuera.length) {
            enlace = fuera[fuera.length - 1];                  // flecha «siguiente»
            esperado = actual != null ? actual + 1 : null;     // un paso, no el destino
          }
        }
        if (!enlace) { log && log(`  no encuentro cómo llegar a la página ${destino}`, 'w'); return false; }
        const previa = M.huella();
        const habiaMarcas = M.marcarRejilla();
        enlace.click();
        if (!await M.esperarCambioEstable(previa, ESPERA_PAGINA, habiaMarcas, esperado)) {
          if (reintentos < REINTENTOS_PAGINA) {
            reintentos++;
            log && log(`  la página ${esperado} no respondió en ${ESPERA_PAGINA / 1000} s; reintento ${reintentos}/${REINTENTOS_PAGINA}`, 'w');
            await dormir(3000);
            continue;
          }
          log && log(`  la página ${esperado} no responde tras ${REINTENTOS_PAGINA} reintentos (iba camino de la ${destino})`, 'w');
          return false;
        }
        reintentos = 0;
      }
      return M.pagActual() === destino;
    },

    // Cada registro sale en DOS <tr> (una es la variante móvil oculta): deduplicar por número.
    // Los índices son relativos al enlace, nunca absolutos.
    extraerPagina() {
      const tab = M.tabla();
      if (!tab) return [];
      const filas = new Map();
      const RE_REF = /([A-Z0-9ÑÁÉÍÓÚ/.\-]+(?:_[A-Z0-9ÑÁÉÍÓÚ/.\-]+)*_P-\d+)/i;
      for (const tr of tab.querySelectorAll('tr')) {
        const tds = [...tr.querySelectorAll('td')];
        if (!tds.length) continue;
        let idx = -1, enlace = null;
        for (let i = tds.length - 1; i >= 0; i--) {
          const a = [...tds[i].querySelectorAll('a')].find(x => /^7\d{9}$/.test(x.innerText.trim()));
          if (a) { idx = i; enlace = a; break; }
        }
        if (idx < 0) continue;
        const txt = i => (tds[i]?.innerText || '').replace(/\s*\n\s*/g, ' | ').replace(/\s+/g, ' ').trim();
        const num = enlace.innerText.trim();
        const refs = [];
        for (const td of tds) {
          const m = (td.innerText || '').replace(/\s+/g, ' ').match(RE_REF);
          if (m) refs.push(m[1]);
        }
        const ref = refs.find(r => /^(ORES|ORANES|VODAES|VODA)_/i.test(r))
                 || refs[0]
                 || (tr.innerText.replace(/\s+/g, ' ').match(RE_REF) || [])[1] || '';
        const fila = {
          num,
          site: txt(idx - 1),
          estado: txt(idx + 1),
          deadline: txt(idx + 2),
          creado: txt(idx + 3),
          valor: txt(idx + 4),
          ref,
          proyecto: proyectoDe(ref)
        };
        const previo = filas.get(num);
        if (!(previo && /^\d{4}-\d{2}-\d{2}$/.test(previo.creado))) filas.set(num, fila);
      }
      return [...filas.values()];
    },

    // Vuelve a dejar el motor en la página `destino` desde cero.
    // Es el Ctrl+F5 que documentamos como única cura del atasco de la plataforma.
    async rehidratar(rango, destino, log) {
      try {
        await M.iniciar(log);
        if (rango) await M.fijarFechas(rango.desde, rango.hasta, log);
        await M.buscar(log);
        if (destino > 1) return await M.irPagina(destino, log);
        return true;
      } catch (e) {
        log && log('  el refresco falló: ' + e.message, 'e');
        return false;
      }
    },

    // REESCRITO. Recalcula el total de páginas en CADA vuelta (antes lo fijaba una vez,
    // y si lo calculaba sobre la rejilla anterior se quedaba clavado a mitad).
    // Refresca el motor cada PAGS_POR_REFRESCO páginas y sabe reanudar.
    async recogerTodo(rango, log, diagnostico, acumulado = new Map()) {
      M.porPaginaFijo = null;
      // OJO: `acumulado` puede venir compartido entre tramos. El criterio de «ya están
      // todas» tiene que contar las de ESTE tramo, no el total acumulado, o el segundo
      // tramo se daría por terminado nada más empezar.
      const deEsteTramo = new Set();
      if (!M.tabla()) return { filas: [], completo: true, motivo: 'sin resultados' };
      if (M.liPag() && M.pagActual() !== 1) {
        if (!await M.rehidratar(rango, 1, log))
          return { filas: [], completo: false, ultima: 0, motivo: 'no arranca en la página 1' };
      }
      let pagina = M.pagActual() || 1;
      let desdeRefresco = 0;

      for (;;) {
        if (S.abortar) return { filas: [...acumulado.values()], completo: false, ultima: pagina, motivo: 'abortado' };
        for (const f of M.extraerPagina()) { acumulado.set(f.num, f); deEsteTramo.add(f.num); }
        const total = M.totalRegistros();
        const totalPag = M.liPag() ? M.pagTotal() : 1;
        log && log(`Página ${pagina}/${totalPag} · ${deEsteTramo.size}${total ? '/' + total : ''} RFx`);

        if (total && deEsteTramo.size >= total) break;
        if (pagina >= totalPag) break;

        const siguiente = pagina + 1;

        if (++desdeRefresco >= PAGS_POR_REFRESCO) {
          log && log(`↻ Refrescando el motor tras ${desdeRefresco} páginas…`, 'w');
          if (await M.rehidratar(rango, siguiente, log)) { desdeRefresco = 0; pagina = siguiente; continue; }
          log && log('  el refresco preventivo no llegó; sigo sin él', 'w');
          desdeRefresco = 0;
        }

        if (!await M.irPagina(siguiente, log)) {
          log && log(`↻ La página ${siguiente} no llegó. Refresco el motor y lo reintento…`, 'w');
          if (!await M.rehidratar(rango, siguiente, log)) {
            const d = M.diagnostico();
            diagnostico && diagnostico(`corte al pasar a la página ${siguiente}`, d);
            log && log(`✗ Recogida incompleta: me quedé en la página ${pagina} con ${acumulado.size} RFx.`, 'e');
            log && log('  Pulsa «Registro» para descargar el diagnóstico.', 'w');
            return { filas: [...acumulado.values()], completo: false, ultima: pagina, motivo: 'paginación cortada' };
          }
          desdeRefresco = 0;
        }
        pagina = siguiente;
        await dormir(PAUSA_ENTRE_PAGINAS);
      }
      return { filas: [...acumulado.values()], completo: true, ultima: pagina };
    },

    // ── Recogida por tramos de fecha ────────────────────────────────────────────────
    // Ericsson NO ofrece control de «registros por página»: son 15 fijos. Un rango de
    // dos meses son ~37 páginas, y cuando hay que refrescar el motor a mitad hay que
    // volver a la página N andando, clic a clic, porque el paginador no deja saltar.
    // Ahí es donde la plataforma se atraganta. La salida es no llegar nunca tan lejos:
    // se lee el «of N records» que el portal da gratis y, si son demasiadas, se parte
    // el rango de fechas por la mitad y cada trozo va por separado, con motor nuevo
    // y empezando en la página 1.
    async recogerPorTramos(desde, hasta, log, diagnostico) {
      const acumulado = new Map();
      const avisos = [];
      await M.tramo(desde, hasta, log, diagnostico, acumulado, avisos, 0);
      return { filas: [...acumulado.values()], completo: avisos.length === 0, avisos };
    },

    // Igual que recogerPorTramos, pero la fuente es la lista del coordinador en vez de
    // un rango de fechas. Se busca RFx a RFx: son pocas y así cada una queda verificada
    // contra el portal antes de que nadie piense en aceptarla.
    async recogerPorNumeros(nums, log, avance) {
      const filas = [];
      const noEstan = [];
      await M.iniciar(log);
      let desdeRefresco = 0;
      for (let i = 0; i < nums.length; i++) {
        if (S.abortar) { log('■ Abortado.', 'w'); break; }
        const num = nums[i];
        avance && avance(i + 1, nums.length);

        if (desdeRefresco >= RFX_POR_REFRESCO) {
          log(`↻ Refrescando el motor tras ${RFX_POR_REFRESCO} RFx…`, 'w');
          try { await M.iniciar(log); desdeRefresco = 0; await dormir(800); }
          catch (e) { log('  el refresco falló, sigo…', 'w'); }
        }
        try {
          // Sin fechas: la lista manda, y puede traer RFx más viejas que cualquier rango.
          await M.volverALista(log, true);
          await M.filtrarPorNumero(num);
          const fila = M.extraerPagina().find(f => f.num === num);
          if (fila) { filas.push(fila); log(`  ${i + 1}/${nums.length} ${num} · ${fila.proyecto || 'sin proyecto'} · ${fila.valor}`); }
          else { noEstan.push({ num, motivo: 'no aparece en Open Requests' }); log(`  ${i + 1}/${nums.length} ${num} · no está en Open Requests`, 'w'); }
        } catch (e) {
          noEstan.push({ num, motivo: e.message });
          log(`  ${i + 1}/${nums.length} ${num} · ${e.message}`, 'e');
        }
        desdeRefresco++;
        await dormir(400);
      }
      return { filas, noEstan };
    },

    async tramo(desde, hasta, log, diagnostico, acumulado, avisos, prof) {
      if (S.abortar) return;
      await M.iniciar(log);
      await M.fijarFechas(desde, hasta, log);
      await M.buscar(log);
      const total = M.totalRegistros();
      const paginas = M.liPag() ? M.pagTotal() : 1;
      const dias = diasEntre(desde, hasta);

      // Dos varas de medir, porque no todas las pantallas dan el total de registros.
      // Si lo hay, manda él; si no, mandan las páginas. Antes solo existía la primera,
      // y en «Open Requests», que no da el total, el tramo no se partía nunca.
      const demasiado = total != null ? total > MAX_POR_TRAMO : paginas > MAX_PAGINAS_TRAMO;
      const cuanto = total != null ? `${total} RFx` : `${paginas} páginas`;

      if (demasiado && dias >= 1 && prof < MAX_PROFUNDIDAD) {
        const medio = mitadEntre(desde, hasta);
        log && log(`✂ ${desde} → ${hasta}: ${cuanto}, demasiadas de una tacada. Lo parto por ${medio}.`);
        await M.tramo(desde, medio, log, diagnostico, acumulado, avisos, prof + 1);
        await M.tramo(sumarDias(medio, 1), hasta, log, diagnostico, acumulado, avisos, prof + 1);
        return;
      }
      if (demasiado)
        log && log(`⚠ ${desde} → ${hasta}: ${cuanto} y ya no puedo partir más. Voy por paginación; puede atascarse.`, 'w');

      log && log(`▸ Tramo ${desde} → ${hasta} · ${total != null ? total + ' RFx' : paginas + ' págs.'}`);
      const r = await M.recogerTodo({ desde, hasta }, log, diagnostico, acumulado);
      if (!r.completo && r.motivo !== 'sin resultados')
        avisos.push(`${desde}→${hasta}: ${r.motivo}`);
    },

    // NUEVO. Si vuelve a atascarse, esto nos dice EXACTAMENTE dónde se quedó.
    diagnostico() {
      const d = {};
      try {
        const doc = M.doc;
        const ul = M.liPag()?.parentElement;
        d.momento = new Date().toISOString();
        d.titulo = doc?.title || '?';
        try { d.ruta = doc.location.pathname; } catch (e) { d.ruta = '(sin acceso)'; }
        d.enLista = M.enLista();
        d.hayTabla = !!M.tabla();
        d.paginaActual = M.pagActual();
        d.paginadorVisible = ul ? [...ul.children].map(li => li.innerText.trim()).filter(Boolean).join(' ') : '(sin paginador)';
        d.textoRecords = (doc?.body.innerText.match(/[\d.,]+\s+records?/i) || ['(no aparece)'])[0];
        d.totalRegistros = M.totalRegistros();
        d.porPaginaMedido = M.porPaginaFijo;
        d.filasEnPagina = M.extraerPagina().length;
        d.huella = M.huella();
      } catch (e) { d.error = e.message; }
      return d;
    },

    async abrirFicha(num) {
      const tab = M.tabla();
      if (!tab) return { ok: false, motivo: 'sin resultados en la lista' };
      const todos = [...tab.querySelectorAll('a')].filter(a => a.innerText.trim() === String(num));
      if (!todos.length) return { ok: false, motivo: 'no aparece en la lista' };
      const visibles = todos.filter(a => {
        if (a.offsetParent === null) return false;
        const r = a.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      });
      const candidatos = visibles.length ? visibles : todos;

      let abierta = false;
      for (const a of candidatos) {
        a.click();
        abierta = await esperar(() => M.doc && M.doc.title.indexOf('Open Request Detail') >= 0, 15000);
        if (abierta) break;
        try {
          const m = (a.getAttribute('href') || '').match(/__doPostBack\('([^']*)','([^']*)'\)/);
          if (m && typeof M.win.__doPostBack === 'function') {
            M.win.__doPostBack(m[1], m[2]);
            abierta = await esperar(() => M.doc && M.doc.title.indexOf('Open Request Detail') >= 0, 15000);
          }
        } catch (e) {}
        if (abierta) break;
      }
      if (!abierta) {
        let t = '¿?'; try { t = M.doc.title; } catch (e) {}
        return { ok: false, motivo: `la ficha no abrió · título: ${t}` };
      }
      if (M.doc.title.indexOf(String(num)) < 0)
        return { ok: false, motivo: 'IDENTIDAD NO COINCIDE · título: ' + M.doc.title };
      if (!await esperar(() => M.enFicha(num), 15000)) {
        const d = M.doc;
        return { ok: false, motivo: `contexto no seguro · lista=${!!d.querySelector('table[id$="wtRequestTable"]')} nAccept=${d.querySelectorAll('input[id$="wtbtnAccept"]').length}` };
      }
      return { ok: true };
    },

    // El confirm() nativo congela la pestaña: se neutraliza solo durante el clic
    // y se restaura siempre, pase lo que pase.
    async aceptar(num) {
      if (!M.enFicha(num)) return { ok: false, motivo: 'contexto no seguro para aceptar' };
      const botones = [...M.doc.querySelectorAll('input[id$="wtbtnAccept"]')];
      if (botones.length !== 1) return { ok: false, motivo: 'hay ' + botones.length + ' botones Accept' };
      const b = botones[0];
      if ((b.value || '').trim() !== 'Accept') return { ok: false, motivo: 'el botón dice «' + b.value + '», no «Accept»' };

      const confirmOriginal = M.win.confirm;
      M.win.confirm = () => true;
      const tituloAntes = M.doc.title;
      const t0 = Date.now();
      try {
        b.click();
        const ok = await esperar(() =>
          M.doc.title !== tituloAntes
          || !M.doc.querySelector('input[id$="wtbtnAccept"]')
          || !!M.doc.querySelector('input[id$="wtbtnSearch"]'), 90000);
        const ms = Date.now() - t0;
        return ok ? { ok: true, ms } : { ok: false, incierto: true, ms, motivo: 'sin respuesta; verificar' };
      } finally {
        try { M.win.confirm = confirmOriginal; } catch (e) {}
      }
    }
  };

  // ═══ ESTADO ═══════════════════════════════════════════════════════════════════════
  const S = {
    rfx: [],
    sel: new Set(),
    res: [],
    rango: null,
    diag: [],
    lineas: [],
    abortar: false,
    corriendo: false,
    buscando: false,
    filtro: { op: '', srv: '', txt: '', sel: '' },   // sel: '' todas · 'si' marcadas · 'no' sin marcar
    candidatas: {},         // clave OP#importe → propuesta para la tabla de la verdad
    clasificaciones: {},    // clave OP#importe (o rfx:NNN si el importe es ambiguo)
    apartadas: {},          // clasificaciones viejas que dejaron de ser válidas
    retiradas: {},          // clave OP#importe → sacada de la aceptación automática por el gestor
    gestor: '',             // quién lo pide, para que Pepe sepa a quién preguntar
    correoMant: ''          // a quién se le manda el aviso, si se quiere otro distinto
  };

  // Las candidatas son trabajo del gestor, no un ajuste: sobreviven a cerrar la ventana.
  const ALMACEN = 'aat_rfx_candidatas';
  const ALMACEN_CLAS = 'aat_rfx_clasificaciones';
  const ALMACEN_APAR = 'aat_rfx_apartadas';
  const ALMACEN_RET  = 'aat_rfx_retiradas';
  const ALMACEN_QUIEN = 'aat_rfx_gestor';
  const ALMACEN_CORREO = 'aat_rfx_correo_mant';
  function cargarCandidatas() {
    try {
      const crudo = localStorage.getItem(ALMACEN);
      if (crudo) S.candidatas = JSON.parse(crudo) || {};
    } catch (e) { S.candidatas = {}; }
    try {
      const crudo = localStorage.getItem(ALMACEN_CLAS);
      if (crudo) S.clasificaciones = JSON.parse(crudo) || {};
    } catch (e) { S.clasificaciones = {}; }
    try {
      S.gestor = localStorage.getItem(ALMACEN_QUIEN) || '';
      S.correoMant = localStorage.getItem(ALMACEN_CORREO) || '';
      const crudo0 = localStorage.getItem(ALMACEN_RET);
      if (crudo0) S.retiradas = JSON.parse(crudo0) || {};
    } catch (e) {}
    try {
      const crudo = localStorage.getItem(ALMACEN_APAR);
      if (crudo) S.apartadas = JSON.parse(crudo) || {};
    } catch (e) { S.apartadas = {}; }
  }
  function guardarCandidatas() {
    try { localStorage.setItem(ALMACEN, JSON.stringify(S.candidatas)); } catch (e) {}
    try { localStorage.setItem(ALMACEN_CLAS, JSON.stringify(S.clasificaciones)); } catch (e) {}
    try { localStorage.setItem(ALMACEN_APAR, JSON.stringify(S.apartadas)); } catch (e) {}
    try { localStorage.setItem(ALMACEN_RET, JSON.stringify(S.retiradas)); } catch (e) {}
    try { localStorage.setItem(ALMACEN_QUIEN, S.gestor || ''); } catch (e) {}
    try { localStorage.setItem(ALMACEN_CORREO, S.correoMant || ''); } catch (e) {}
  }
  const nCandidatas = () => Object.keys(S.candidatas).length;

  // Al pasar a la v19 los importes ambiguos cambiaron de alcance: antes se clasificaban
  // por importe, ahora RFx a RFx. Las clasificaciones viejas de esos importes quedaron
  // huérfanas: seguían guardadas, seguían contando, y ya no se aplicaban a nada.
  // Ni se borran (es trabajo del gestor) ni se aplican en silencio (se hicieron mirando
  // UNA RFx y en un importe ambiguo no valen para las demás): se apartan y se avisa.
  function apartarHuerfanas() {
    const sueltas = Object.keys(S.clasificaciones)
      .filter(k => !k.startsWith('rfx:') && AMBIGUAS[k]);
    if (!sueltas.length) return [];
    for (const k of sueltas) {
      S.apartadas[k] = { ...S.clasificaciones[k], motivo: 'importe ambiguo: hay que rehacerla sobre una RFx concreta' };
      delete S.clasificaciones[k];
    }
    guardarCandidatas();
    return sueltas;
  }
  const nAportes = () => Object.keys(S.candidatas).length + Object.keys(S.clasificaciones).length
                       + Object.keys(S.apartadas || {}).length + Object.keys(S.retiradas || {}).length;

  // El filtro afecta SOLO a lo que se ve. La selección es global y no se toca al
  // filtrar: si se vaciara, cambiar de vista borraría trabajo hecho. La contrapartida
  // es que puede haber RFx marcadas fuera de la vista, y eso hay que cantarlo bien
  // alto — en el contador y en la confirmación de aceptar.
  // UN SOLO criterio de filtrado, con la posibilidad de saltarse una dimensión. Eso
  // último es lo que permite contar «en cascada»: los números de un grupo se cuentan
  // sobre lo que dejan pasar LOS DEMÁS filtros, nunca sobre el total. Si no, la
  // pantalla miente: con Orange (18) puesto, el grupo Servicio decía «Diseño 20»,
  // que es imposible y hace dudar de todo lo demás.
  // Ojo al mantenerlo: este criterio y el de los contadores tienen que ser el MISMO.
  // Tenerlos por duplicado es cómo se acaba con una tabla que no cuadra con su título.
  function pasaFiltro(r, omitir) {
    const f = S.filtro;
    if (omitir !== 'sel') {
      if (f.sel === 'si' && !S.sel.has(r.num)) return false;
      if (f.sel === 'no' && S.sel.has(r.num))  return false;
    }
    if (omitir !== 'op' && f.op && operadorDe(r.ref) !== f.op) return false;
    if (omitir !== 'srv' && f.srv) {
      const srv = servicioDe(r);
      if (f.srv === '-' ? srv !== '' : srv !== f.srv) return false;
    }
    const txt = f.txt.trim().toLowerCase();
    if (txt) {
      // La caja de texto busca también por decisión y por servicio. Así, aunque los
      // botones de decisión ya no estén, escribir «revisar» sigue funcionando.
      const dec = { go: 'aceptar', stop: 'vetada no aceptar', wait: 'revisar' }[(r.regla || {}).d] || '';
      const paja = `${r.num} ${r.proyecto} ${r.site} ${r.ref} ${r.valor} ${dec} ${nombreServicio(servicioDe(r))}`.toLowerCase();
      if (!paja.includes(txt)) return false;
    }
    return true;
  }

  function visibles() { return S.rfx.filter(r => pasaFiltro(r, null)); }

  // La decisión se calcula UNA vez, al recoger, y se guarda en la fila. Así que cuando
  // el gestor retira un importe de la automática hay que volver a preguntársela a todas
  // las filas: si no, la tabla sigue enseñando «aceptar» y —peor— la RFx sigue marcada,
  // que era justo lo que se quería deshacer. Se repasan todas porque una retirada afecta
  // a todas las de ese operador e importe, no solo a la que tenías abierta.
  //   · Al retirar   → esas filas se DESMARCAN: ya no son cola de aceptación.
  //   · Al devolverla → vuelven a marcarse las que la regla aprueba, como tras buscar.
  // Devuelve cuántas cambiaron de estado, para poder contarlo en el registro.
  function reevaluar(claveTocada) {
    let desmarcadas = 0, marcadas = 0;
    for (const f of S.rfx) {
      const antes = (f.regla || {}).d;
      f.regla = decidir(f);
      if (claveTocada && claveDe(f) !== claveTocada) continue;
      if (f.regla.d !== 'go' && S.sel.has(f.num)) { S.sel.delete(f.num); desmarcadas++; }
      else if (f.regla.d === 'go' && antes && antes !== 'go' && !S.sel.has(f.num)) { S.sel.add(f.num); marcadas++; }
    }
    return { desmarcadas, marcadas };
  }

  const hayFiltro = () => !!(S.filtro.op || S.filtro.srv || S.filtro.sel || S.filtro.txt.trim());
  const ocultasMarcadas = () => {
    if (!hayFiltro()) return [];
    const aLaVista = new Set(visibles().map(r => r.num));
    return [...S.sel].filter(n => !aLaVista.has(n));
  };

  // La vista puede cambiar en caliente: el usuario cierra la ventana emergente y la
  // vuelve a abrir mientras el motor sigue trabajando. Por eso nada escribe en un
  // documento capturado en una clausura: todo pasa por estos despachadores, que
  // siempre apuntan a la vista viva.
  let ui = null;

  const emitir = (txt, clase = '') => {
    S.lineas.push({ txt, clase });
    if (S.lineas.length > 900) S.lineas.shift();
    try { ui && ui.escribir(txt, clase); } catch (e) {}
  };
  const repintar = () => { try { ui && ui.pintar(); } catch (e) {} };

  // El estado de los botones se deduce SIEMPRE de S, nunca de lo que hubiera antes en
  // pantalla. Así, si la ventana se cierra y se reabre a media tanda, los botones de la
  // ventana nueva salen como toca.
  const sincronizarBotones = () => {
    try {
      if (!ui) return;
      const q = id => ui.panel.querySelector('#' + id);
      const ocupado = S.corriendo || S.buscando;
      q('qStop').style.display = ocupado ? '' : 'none';
      q('qBuscar').disabled = ocupado;
      q('qPegar').disabled  = ocupado;
      q('qSinFechas').disabled = ocupado;
      q('qSoloVisible').disabled = ocupado || !S.rfx.length;
      q('qNone').disabled   = ocupado || !S.rfx.length;
      q('qRun').disabled    = ocupado || !S.sel.size;
      q('qSim').disabled    = ocupado || !S.sel.size;
      q('qVer').disabled    = ocupado || !(S.res.length || S.sel.size);
      q('qLog').disabled    = !(S.rfx.length || S.res.length || S.diag.length);
      q('qCand').textContent = `Aportaciones${nAportes() ? ' (' + nAportes() + ')' : ''}`;
    } catch (e) {}
  };
  const reiniciarLog = txt => {
    S.lineas = [{ txt, clase: '' }];
    try { ui && ui.limpiar(txt); } catch (e) {}
  };

  // ═══ PANEL ════════════════════════════════════════════════════════════════════════
  // Tamaño de letra: TODO cuelga de --fs. Sube o baja ese único número y el panel
  // entero escala con él. v15 va al doble de la v14 (13px → 26px) a petición de los
  // coordinadores: se prefiere hacer scroll a forzar la vista.
  const CSS = `
.axb{position:fixed;inset:0;background:rgba(12,18,26,.55);z-index:2147483646}
.axp{--fs:26px;position:fixed;top:2vh;left:50%;transform:translateX(-50%);
 width:min(1600px,97vw);height:96vh;background:#fff;border-radius:10px;
 box-shadow:0 20px 60px rgba(0,0,0,.35);z-index:2147483647;display:flex;flex-direction:column;
 font:var(--fs)/1.4 system-ui,-apple-system,Segoe UI,sans-serif;color:#16191d}
.axp *{box-sizing:border-box}
.axp .h{display:flex;align-items:center;gap:.55em;padding:.45em .7em;background:#0f1720;color:#fff;border-radius:10px 10px 0 0}
.axp .h .logo{height:1.5em;width:auto;display:block;flex:0 0 auto;opacity:.95}
.axp .h b{font-size:1.1em;flex:1;font-weight:600;letter-spacing:.2px}
.axp .h .ver{opacity:.6;font-size:.62em;font-weight:400}
.axp .h .x{cursor:pointer;font-size:1.3em;opacity:.75;padding:0 .2em}
.axp .h .x:hover{opacity:1}
.axp .warn{background:#fff4e5;border-bottom:1px solid #f0d9b5;padding:.4em .7em;font-size:.72em;color:#7a4b00}
.axp .bar{display:flex;flex-wrap:wrap;gap:.45em;align-items:flex-end;padding:.5em .7em;border-bottom:1px solid #e3e8ed;background:#f8fafc}
.axp .bar label{font-size:.62em;color:#5a646e;display:block;margin-bottom:.25em}
.axp .paso{font-size:.66em;font-weight:700;letter-spacing:.03em;text-transform:uppercase;color:#5a646e;background:#eceff2;border-radius:4px;padding:.25em .55em;align-self:center;white-space:nowrap}
.axp .pista{font-size:.68em;color:#5a646e;background:#f8fafc;border-bottom:1px solid #e3e8ed;padding:.3em .8em}
.axp .pista b{color:#16191d}
.axp .bar input[type=text]{padding:.28em .4em;border:1px solid #c6ccd3;border-radius:5px;font:inherit;width:7.2em}
.axp .bar input[type=text]:disabled{background:#eceff2;color:#9aa4ae}
.axp .bar select{padding:.28em .4em;border:1px solid #c6ccd3;border-radius:5px;font:inherit;background:#fff;color:#16191d}
.axp .bar .tg[aria-pressed="true"]{border-color:#1668dc;background:#eaf3ff;color:#0f56b8;font-weight:600}
.axp .ch:disabled{opacity:.38;cursor:default}
.axp .cand.fuera{border-color:#c98a00;background:#fff4e5;color:#7a4b00}
.axp .b{padding:.34em .62em;border:0;border-radius:5px;cursor:pointer;font:inherit;font-weight:600}
.axp .b.p{background:#1668dc;color:#fff}.axp .b.p:hover{background:#0f56b8}
.axp .b.g{background:#e6eaee;color:#22282e}.axp .b.g:hover{background:#d6dce2}
.axp .b.r{background:#c0392b;color:#fff}
.axp .b:disabled{background:#aeb6be!important;color:#fff!important;cursor:default}
.axp .wrap{flex:1;overflow:auto;padding:0 .7em}
.axp table{width:100%;min-width:52em;border-collapse:collapse;font-size:.88em}
.axp th{position:sticky;top:0;background:#eef2f6;text-align:left;padding:.45em .5em;border-bottom:2px solid #d3dae1;z-index:1;white-space:nowrap}
.axp td{padding:.4em .5em;border-bottom:1px solid #eef1f4;vertical-align:middle}
.axp td.num{font-variant-numeric:tabular-nums;white-space:nowrap}
.axp tr.on{background:#eaf3ff}.axp tr.ok{background:#eaf7ec}.axp tr.ko{background:#fdecea}
.axp tr.veto{background:#fdecea;opacity:.75;cursor:not-allowed}
.axp .foot{border-top:1px solid #e3e8ed;padding:.5em .7em;background:#f8fafc;display:flex;gap:.45em;align-items:center;flex-wrap:wrap}
.axp .pr{flex:1;min-width:8em;height:.35em;background:#dfe5eb;border-radius:4px;overflow:hidden}
.axp .pr i{display:block;height:100%;width:0;background:#1668dc;transition:width .25s}
.axp .log{height:7em;overflow:auto;border-top:1px solid #e3e8ed;padding:.4em .7em;background:#fbfcfd;
 font:.66em/1.5 ui-monospace,Consolas,monospace;white-space:pre-wrap;color:#39424b}
.axp .log .e{color:#c0392b}.axp .log .o{color:#1e7d32}.axp .log .w{color:#b26a00}
.axp .ck{display:inline-block!important;width:1em;height:1em;line-height:.85em;text-align:center;
 border:2px solid #7c8792;border-radius:3px;background:#fff;color:#fff;font-size:1em;font-weight:900;
 cursor:pointer;vertical-align:middle;user-select:none;box-sizing:border-box}
.axp .ck.on{background:#1668dc;border-color:#1668dc}
.axp .ck.veto{border-color:#c0392b;background:#fdecea;color:#c0392b;cursor:not-allowed}
.axp tbody tr{cursor:pointer}
.axp tbody tr:hover{background:#f2f6fa}
.axp tbody tr.on:hover{background:#dcebff}
.axp tbody tr.veto:hover{background:#fdecea}
/* Cuando el panel vive en su propia ventana no hay modal que valga: ocupa todo. */
.axp.ventana{position:fixed;top:0;left:0;right:0;bottom:0;transform:none;
 width:100%;height:100%;max-width:none;border-radius:0;box-shadow:none}
.axp.ventana .h{border-radius:0}
.axp.ventana .h .x{display:none}
html.aat-ventana,body.aat-ventana{margin:0!important;padding:0!important;height:100%!important;
 overflow:hidden!important;background:#fff!important}
.axp .desg{display:block;margin-top:.15em;font-size:.72em;color:#5a646e;line-height:1.35}
.axp .pesoDesg{display:inline-block;min-width:3.4em;color:#8a949e;font-variant-numeric:tabular-nums}
.axp .avisoAmb{display:inline-block;margin-left:.4em;padding:0 .45em;border-radius:1em;
 background:#fff4e5;color:#8a5a00;border:1px solid #f0d9b5;font-size:.7em;font-weight:600}
.axp .veces{display:inline-block;margin-left:.4em;padding:0 .45em;border-radius:1em;
 background:#eef2f6;color:#5a646e;font-size:.7em;font-weight:600}
.axp .cand{display:inline-flex;align-items:center;gap:.3em;margin-top:.25em;padding:.15em .55em;
 border:1px dashed #b26a00;border-radius:1em;background:#fffaf2;color:#8a5a00;cursor:pointer;
 font:inherit;font-size:.68em;font-weight:600}
.axp .cand:hover{background:#fff2dd}
.axp .cand.puesta{border-style:solid;border-color:#1e7d32;background:#e6f4e8;color:#1e7d32}
/* OJO CON LOS NOMBRES DE CLASE: este panel vive DENTRO de la página de Ericsson, con
   su hoja de estilos cargada. La v18.2.0 llamó «modal» a este diálogo y no se veía:
   un nombre así lo define cualquier tema. Todo lo del diálogo va con prefijo axDlg,
   y encima se blindan las propiedades que sirven para esconder algo — que son las que
   yo no declaraba y se colaban desde fuera. */
.axp .axDlgCapa{position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(12,18,26,.5);
 z-index:2147483000;display:flex!important;align-items:center;justify-content:center;padding:1em;
 visibility:visible!important;opacity:1!important;pointer-events:auto!important;transform:none!important}
.axp .axDlgCaja{background:#fff;border-radius:10px;box-shadow:0 20px 50px rgba(0,0,0,.35);
 width:min(34em,100%);max-height:90%;overflow:auto;padding:1em 1.1em;
 visibility:visible!important;opacity:1!important}
.axp .axDlgCapa h3{margin:0 0 .2em;font-size:1em;color:#16191d}
.axp .axDlgSub{color:#5a646e;font-size:.78em;margin-bottom:.7em}
.axp .axDlgNota{background:#fff4e5;border:1px solid #f0d9b5;color:#7a4b00;border-radius:6px;
 padding:.45em .6em;font-size:.72em;margin:.5em 0}
/* Nada de <input type=checkbox>: el tema del portal esconde las casillas nativas para
   pintar las suyas, y la nuestra salía invisible (v18.2.0/18.2.1). Se dibuja a mano con
   el mismo componente que ya funciona en las filas de la tabla. */
.axp .axDlgPregunta{margin:.9em 0 .2em;font-size:.82em;color:#16191d}
.axp .axDlgTick{display:flex!important;align-items:center;gap:.55em;margin:.45em 0 .3em;
 padding:.45em .7em;border:1px solid #c6ccd3;border-radius:6px;background:#fff;cursor:pointer;
 font:inherit;font-size:.8em;color:#22282e;visibility:visible!important;opacity:1!important}
.axp .axDlgTick:hover{border-color:#9aa4ae;background:#f6f8fa}
.axp .axDlgTick[aria-checked="true"]{border-color:#1668dc;background:#eaf3ff;color:#0f56b8;font-weight:600}
.axp .axDlgAyuda{font-size:.72em;color:#5a646e;line-height:1.4}
.axp .axDlgCampo{width:100%;padding:.35em .5em;border:1px solid #c6ccd3;border-radius:5px;
 font:inherit;font-size:.8em;margin-top:.2em}
.axp .axDlgPie{display:flex;gap:.4em;justify-content:flex-end;margin-top:.9em}
.axp .man{display:inline-block;margin-left:.3em;color:#1668dc;font-size:.72em;font-weight:700}
.axp .caja{border:1px solid #c6ccd3;border-radius:6px;padding:.6em;margin:.6em 0;background:#f8fafc}
.axp .caja h4{margin:0 0 .4em;font-size:.85em}
.axp .caja table{min-width:0}
.axp .caja .quita{border:0;background:none;color:#c0392b;cursor:pointer;font:inherit;font-size:.8em}
.axp .filtros{display:flex;flex-wrap:wrap;gap:.4em;align-items:center;padding:.45em .7em;
 border-bottom:1px solid #e3e8ed;background:#fdfefe}
.axp .filtros .gr{display:flex;flex-wrap:wrap;gap:.25em;align-items:center}
.axp .filtros .et{font-size:.62em;color:#5a646e;text-transform:uppercase;letter-spacing:.06em;margin-right:.15em}
.axp .ch{display:inline-flex;align-items:center;gap:.3em;padding:.25em .6em;border:1px solid #ccd3da;
 border-radius:1em;background:#fff;color:#3a444e;cursor:pointer;font:inherit;font-size:.72em;font-weight:600}
.axp .ch:hover{border-color:#9aa4ae;background:#f3f6f9}
.axp .ch[aria-pressed="true"]{background:#0f1720;border-color:#0f1720;color:#fff}
.axp .ch .pt{width:.62em;height:.62em;border-radius:50%;display:inline-block;flex:0 0 auto}
.axp .ch .n{opacity:.65;font-weight:400}
.axp .filtros input[type=text]{padding:.25em .5em;border:1px solid #c6ccd3;border-radius:5px;font:inherit;
 font-size:.72em;width:12em}
.axp .filtros .vista{margin-left:auto;font-size:.68em;color:#5a646e}
.axp .avisoOcultas{color:#b26a00;font-weight:600}
.axp .abrir{display:inline-flex;align-items:center;justify-content:center;padding:.25em;border:1px solid #d3dae1;
 background:#fff;color:#5a646e;border-radius:5px;cursor:pointer;line-height:0;font-size:.9em}
.axp .abrir:hover{border-color:#1668dc;color:#1668dc;background:#f2f7fe}
.axp .cp{display:inline-flex;align-items:center;justify-content:center;vertical-align:middle;
 margin-left:.35em;padding:.15em;border:0;background:none;color:#9aa4ae;cursor:pointer;
 border-radius:4px;line-height:0;font-size:.85em}
.axp .cp:hover{color:#1668dc;background:#e8f0fb}
.axp .cp:focus-visible{outline:2px solid #1668dc;outline-offset:1px}
.axp .cp.ok{color:#1e7d32;background:#e6f4e8}
.axp .cp.mal{color:#c0392b;background:#fdecea}
.axp .pill{display:inline-block;padding:.05em .5em;border-radius:1em;font-size:.8em;font-weight:600;white-space:nowrap}
`;

  const OPERADORES = {
    OSP: ['Orange',     '#f5a623', '#000'],
    VDF: ['Vodafone',   '#e60000', '#fff'],
    TME: ['Telefónica', '#0066b3', '#fff'],
    '?': ['—',          '#c8ced4', '#333']
  };

  // `D` es el documento destino. Si es el de una ventana emergente, el panel se
  // dibuja a pantalla completa dentro de ella y no hay fondo oscuro ni aspa.
  function construir(D = document, enVentana = false) {
    const estilo = D.createElement('style');
    estilo.textContent = CSS;
    D.head.appendChild(estilo);

    let fondo = null;
    if (!enVentana) {
      fondo = D.createElement('div');
      fondo.className = 'axb';
    } else {
      D.documentElement.classList.add('aat-ventana');
      D.body.classList.add('aat-ventana');
    }

    const panel = D.createElement('div');
    panel.className = 'axp' + (enVentana ? ' ventana' : '');
    panel.innerHTML = `
  <div class="h">
    <img class="logo" src="${LOGO_AAT}"
         alt="AAT" onerror="this.style.display='none'">
    <b>Gestionar RFx · Open Requests <span class="ver">v${VERSION}</span></b><span class="x">&times;</span></div>
  <div class="warn">Nunca se marcan casillas en la lista ni se pulsa «Approve». La aceptación se hace en la ficha individual.</div>
  <div class="bar">
    <span class="paso">1 · Buscar en el portal</span>
    <div><label>Creación desde</label><input type="text" id="qD" value="${haceDias(7)}"></div>
    <div><label>Creación hasta</label><input type="text" id="qH" value="${hoy()}"></div>
    <button class="b g tg" id="qSinFechas" type="button" aria-pressed="false"
      title="Barre TODAS las pendientes, sin mirar la fecha de creación. Son unas 33 páginas: tarda.">Sin fechas</button>
    <button class="b p" id="qBuscar">Buscar pendientes</button>
    <button class="b g" id="qPegar">Pegar lista…</button>
    <span style="flex:1"></span>
    <button class="b g" id="qNone" disabled>Desmarcar todo</button>
  </div>
  <div class="filtros" id="qPaso2">
    <span class="paso">2 · Elegir dentro de lo encontrado</span>
    <div class="gr" id="qFOp"><span class="et">Operador</span></div>
    <div class="gr" id="qFSrv"><span class="et">Servicio</span></div>
    <div class="gr" id="qFSel"><span class="et">Ver</span></div>
    <input type="text" id="qFTxt" placeholder="RFx, proyecto, site, «revisar»…" autocomplete="off">
    <button class="b g" id="qFLimpiar" style="font-size:.72em;padding:.25em .6em">Quitar filtros</button>
    <button class="b g" id="qSoloVisible" style="font-size:.72em;padding:.25em .6em"
      title="Deja marcadas SOLO las que estás viendo (y que la regla aprueba). Elegir no marca nada por su cuenta.">Marcar solo lo que veo</button>
    <span class="vista" id="qVista"></span>
  </div>
  <div class="pista" id="qPista">Elegir aquí <b>solo cambia lo que ves</b>: no marca ni desmarca nada.
    Lo que se acepta es lo que esté marcado, se vea o no.</div>
  <div class="wrap">
    <div id="qCandBox" class="caja oculto"></div>
    <table><thead><tr>
      <th style="width:2.2em"></th><th style="width:2em"></th><th>Request</th><th>Proyecto</th><th>Operador</th>
      <th>Site</th><th>Valor</th><th>Decisión</th><th>Resultado</th>
    </tr></thead><tbody id="qBody"></tbody></table>
  </div>
  <div class="foot">
    <span id="qCnt" style="font-weight:600">0 seleccionadas</span>
    <div class="pr"><i id="qBar"></i></div>
    <button class="b g" id="qSim" disabled>Simular</button>
    <button class="b p" id="qRun" disabled>Aceptar seleccionadas</button>
    <button class="b r" id="qStop" style="display:none">Abortar</button>
    <button class="b g" id="qVer" disabled>Verificar</button>
    <button class="b g" id="qCand">Aportaciones</button>
    <button class="b g" id="qLog" disabled>Registro</button>
  </div>
  <div class="log" id="qLogBox">Listo. Elige el rango de creación y pulsa «Buscar pendientes».</div>`;

    if (fondo) D.body.append(fondo, panel); else D.body.append(panel);

    const V = D.defaultView || window;
    const $ = id => panel.querySelector('#' + id);
    const caja = $('qLogBox');
    const escribir = (txt, clase = '') => {
      caja.innerHTML += `\n<span class="${clase}">${txt}</span>`;
      caja.scrollTop = caja.scrollHeight;
    };
    const limpiar = txt => { caja.innerHTML = txt; };
    const log = (txt, clase = '') => emitir(txt, clase);
    const barra = (n, total) => $('qBar').style.width = total ? (n / total * 100) + '%' : '0';
    const apuntarDiag = (donde, d) => S.diag.push({ donde, ...d });

    // ── Filtros ──────────────────────────────────────────────────────────────────────
    const SERVICIOS = [['', 'Todos'], ['PIM', 'PIM'], ['EMR', 'EMR'], ['DIS', 'Diseño'], ['-', 'Pendiente']];

    function pintarFiltros() {
      // CASCADA. Cada grupo cuenta sobre lo que dejan pasar los OTROS filtros, nunca
      // sobre el total. Es lo que hace que los números cuadren entre sí: con Orange
      // puesto, la suma de los servicios da 18, no 254. Un grupo no se cuenta a sí
      // mismo, para poder seguir cambiando de opción dentro de él.
      const baseSel = S.rfx.filter(r => pasaFiltro(r, 'sel'));
      const baseOp  = S.rfx.filter(r => pasaFiltro(r, 'op'));
      const baseSrv = S.rfx.filter(r => pasaFiltro(r, 'srv'));

      const grupo = (cont, opciones, valorActual, alElegir) => {
        [...cont.querySelectorAll('.ch')].forEach(b => b.remove());
        for (const o of opciones) {
          const b = D.createElement('button');
          b.type = 'button';
          b.className = 'ch';
          const elegida = valorActual === o.valor;
          // Una opción sin nada detrás se deja a la vista pero apagada: si se quitara,
          // los botones bailarían de sitio a cada clic y se pulsaría el que no es.
          b.disabled = o.n === 0 && !elegida;
          b.setAttribute('aria-pressed', String(elegida));
          b.innerHTML = (o.color ? `<span class="pt" style="background:${o.color}"></span>` : '')
            + o.texto + (o.n != null ? ` <span class="n">${o.n}</span>` : '');
          b.onclick = () => { alElegir(elegida && o.valor ? '' : o.valor); };
          cont.appendChild(b);
        }
      };

      const ops = [{ valor: '', texto: 'Todos', n: baseOp.length }];
      for (const clave of ['OSP', 'TME', 'VDF', '?']) {
        // El REPERTORIO de botones sale del resultado entero, para que no aparezcan y
        // desaparezcan al filtrar; lo que cambia es el número que llevan dentro.
        if (!S.rfx.some(r => operadorDe(r.ref) === clave)) continue;
        ops.push({ valor: clave, texto: OPERADORES[clave][0], color: OPERADORES[clave][1],
                   n: baseOp.filter(r => operadorDe(r.ref) === clave).length });
      }
      grupo($('qFOp'), ops, S.filtro.op, v => { S.filtro.op = v; repintar(); });

      const coincideSrv = (r, v) => v === '-' ? servicioDe(r) === '' : servicioDe(r) === v;
      const srvs = [{ valor: '', texto: 'Todos', n: baseSrv.length }];
      for (const [v, t] of SERVICIOS.slice(1)) {
        if (!S.rfx.some(r => coincideSrv(r, v))) continue;
        srvs.push({ valor: v, texto: t, n: baseSrv.filter(r => coincideSrv(r, v)).length });
      }
      grupo($('qFSrv'), srvs, S.filtro.srv, v => { S.filtro.srv = v; repintar(); });

      // «Marcadas» también cuenta dentro de lo acotado: si dijera el total de la
      // selección, volveríamos al problema de antes —un número que no cuadra con lo
      // que hay delante—. El total de verdad, el que manda al aceptar, está en el pie.
      const sels = [
        { valor: '',   texto: 'Todas',      n: baseSel.length },
        { valor: 'si', texto: 'Marcadas',   n: baseSel.filter(r => S.sel.has(r.num)).length, color: '#1668dc' },
        { valor: 'no', texto: 'Sin marcar', n: baseSel.filter(r => !S.sel.has(r.num)).length }
      ];
      grupo($('qFSel'), sels, S.filtro.sel, v => { S.filtro.sel = v; repintar(); });
    }

    // ── Tabla ────────────────────────────────────────────────────────────────────────
    function pintar() {
      pintarFiltros();
      const vecesPorClave = {};
      for (const r of S.rfx) { const k = claveDe(r); if (k) vecesPorClave[k] = (vecesPorClave[k] || 0) + 1; }
      const alaVista = visibles();
      const cuerpo = $('qBody');
      cuerpo.innerHTML = '';
      for (const r of alaVista) {
        const res = S.res.find(x => x.num === r.num);
        const marcada = S.sel.has(r.num);
        const regla = r.regla || { d: 'wait', motivo: '' };
        const vetada = regla.d === 'stop';

        const tr = D.createElement('tr');
        tr.className = res ? (res.estado === 'OK' ? 'ok' : 'ko')
                    : vetada ? 'veto'
                    : marcada ? 'on' : '';

        const decision = regla.d === 'go'
          ? '<span style="color:#1e7d32;font-weight:600">&#10003; aceptar</span>'
          : vetada
          ? '<span style="color:#c0392b;font-weight:600">&#10007; NO aceptar</span>'
          : '<span style="color:#b26a00">revisar</span>';

        const desg = desgloseDe(r);
        const clave = claveDe(r);
        const etiqueta = etiquetaServicio(r);
        const manual = servicioEsManual(r);
        const srv = etiqueta
          ? ` <span style="color:#8a949e">${etiqueta}</span>`
            + (manual ? '<span class="man" title="Servicio clasificado a mano">✎</span>' : '')
          : '';

        // Cuántas veces se repite este mismo importe en la búsqueda actual: es la señal
        // de que merece la pena proponerlo para la tabla de la verdad.
        const veces = clave ? vecesPorClave[clave] || 0 : 0;
        const insignia = (veces > 1 ? `<span class="veces" title="Este mismo importe aparece ${veces} veces en esta búsqueda">×${veces}</span>` : '')
          + (esAmbiguo(clave) ? '<span class="avisoAmb" title="Este importe tiene más de una composición real: lo que clasifiques vale solo para esta RFx">importe ambiguo</span>' : '');

        let lineaDesg;
        if (desg && desg.ambiguo) {
          // No se afirma una composición que solo acierta en parte de las RFx.
          lineaDesg = `<span class="desg"><b>${desg.opciones.length} desgloses posibles</b>`
            + desg.opciones.map(o =>
                `<br><span class="pesoDesg">${o.pct}%</span> ${firmaLegible(o.f)}`).join('')
            + '</span>';
        } else if (desg) {
          lineaDesg = `<span class="desg">${firmaLegible(desg.firma)}`
            + (desg.origen === 'manual' ? '<span class="man" title="Desglose anotado a mano">✎</span>' : '')
            + '</span>';
        } else {
          lineaDesg = (regla.d === 'wait' ? '<span class="desg" style="color:#b0b8c0">sin desglose conocido</span>' : '');
        }

        // Un solo botón, y ahora en TODAS las filas con clave, no solo en las de revisar:
        // los gestores necesitan poder dar marcha atrás sobre una que hoy se acepta sola,
        // y para eso hay que poder abrir el diálogo desde ella.
        const kClas = claveClasif(r);
        const retirada = !!(clave && S.retiradas[clave]);
        const aportada = clave && (!!S.candidatas[clave] || !!S.clasificaciones[kClas]);
        const etiquetaCand = retirada ? '&#8634; retirada'
                           : aportada ? '&#10003; clasificada'
                           : 'clasificar';
        const botonCand = clave
          ? `<button class="cand${retirada ? ' fuera' : (aportada ? ' puesta' : '')}" type="button" `
            + `data-clave="${clave}" data-num="${r.num}">${etiquetaCand}</button>`
          : '';

        const op = OPERADORES[operadorDe(r.ref)] || OPERADORES['?'];
        const pill = `<span class="pill" style="background:${op[1]};color:${op[2]}">${op[0]}</span>`;

        const casilla = vetada
          ? '<span class="ck veto" title="Vetada por regla: no se puede seleccionar">&#10007;</span>'
          : `<span class="ck${marcada ? ' on' : ''}">${marcada ? '&#10003;' : ''}</span>`;

        const btnCopiar = (valor, que) => valor
          ? `<button class="cp" type="button" data-copiar="${valor}" data-que="${que}" `
            + `title="Copiar ${que} ${valor}" aria-label="Copiar ${que} ${valor}">${ICONO_COPIAR}</button>`
          : '';

        tr.innerHTML = `<td><button class="abrir" type="button" data-ir="${r.num}"
            title="Abrir la request ${r.num} en el portal"
            aria-label="Abrir la request ${r.num} en el portal">${ICONO_ABRIR}</button></td>
        <td>${casilla}</td>
        <td class="num">${r.num}${btnCopiar(r.num, 'la RFx')}</td>
        <td class="num">${r.proyecto
            ? r.proyecto + btnCopiar(r.proyecto, 'el proyecto')
            : '<span style="color:#b0b8c0">—</span>'}</td>
        <td>${pill}</td>
        <td>${r.site}</td>
        <td class="num">${r.valor}</td>
        <td>${decision}${srv}${insignia}${lineaDesg}${botonCand}</td>
        <td>${res ? res.estado + (res.motivo ? ' · ' + res.motivo : '') : ''}</td>`;

        const ba = tr.querySelector('.abrir');
        if (ba) ba.onclick = ev => {
          ev.stopPropagation(); ev.preventDefault();
          // No hay URL directa a una request: el portal las abre por postback. Lo que
          // se puede hacer es abrir la lista con esa RFx ya buscada.
          try {
            const w = window.open(LISTA + '#aat-ir=' + encodeURIComponent(ba.dataset.ir), '_blank');
            if (!w) log('✗ El navegador ha bloqueado la pestaña nueva.', 'e');
          } catch (e) { log('✗ No he podido abrir la pestaña: ' + e.message, 'e'); }
        };

        const bc = tr.querySelector('.cand');
        if (bc) bc.onclick = ev => {
          ev.stopPropagation(); ev.preventDefault();
          abrirClasificar(r, vecesPorClave[bc.dataset.clave] || 1);
        };

        // El botón de copiar no debe marcar ni desmarcar la fila: se para aquí.
        for (const b of tr.querySelectorAll('.cp')) {
          b.onclick = async ev => {
            ev.stopPropagation();
            ev.preventDefault();
            const valor = b.dataset.copiar;
            const bien = await copiar(valor, D);
            b.innerHTML = bien ? ICONO_HECHO : ICONO_COPIAR;
            b.classList.remove('ok', 'mal');
            b.classList.add(bien ? 'ok' : 'mal');
            b.title = bien ? `Copiado: ${valor}` : 'No he podido copiar';
            if (!bien) log(`✗ No he podido copiar ${valor} al portapapeles.`, 'e');
            setTimeout(() => {
              try {
                b.innerHTML = ICONO_COPIAR;
                b.classList.remove('ok', 'mal');
                b.title = `Copiar ${b.dataset.que} ${valor}`;
              } catch (e) {}
            }, 1400);
          };
        }

        // Las vetadas por regla NO se pueden seleccionar, ni a mano ni en masa.
        tr.onclick = () => {
          if (vetada) {
            log(`  ${r.num} está vetada por regla («no aceptar»). Si hay que aceptarla, se cambia la regla, no la casilla.`, 'w');
            return;
          }
          S.sel.has(r.num) ? S.sel.delete(r.num) : S.sel.add(r.num);
          repintar();
        };
        cuerpo.appendChild(tr);
      }
      if (!alaVista.length && S.rfx.length) {
        const tr = D.createElement('tr');
        tr.innerHTML = '<td colspan="9" style="padding:1.2em;color:#8a949e">'
          + 'Ninguna RFx cumple el filtro. Pulsa «Quitar filtros» para verlas todas.</td>';
        tr.onclick = null;
        cuerpo.appendChild(tr);
      }

      const vetadas = S.rfx.filter(r => (r.regla || {}).d === 'stop').length;
      const ocultas = ocultasMarcadas().length;

      // El contador dice SIEMPRE la verdad global, no lo que se ve. Si el filtro está
      // escondiendo RFx marcadas, se avisa aquí en naranja.
      $('qCnt').innerHTML = `${S.sel.size} seleccionadas de ${S.rfx.length}`
        + (vetadas ? ` · ${vetadas} vetadas` : '')
        + (ocultas ? ` · <span class="avisoOcultas">${ocultas} marcadas fuera del filtro</span>` : '');

      $('qVista').textContent = hayFiltro()
        ? `Mostrando ${alaVista.length} de ${S.rfx.length}`
        : (S.rfx.length ? `${S.rfx.length} RFx` : '');

      sincronizarBotones();
      try { pintarCandidatas(); } catch (e) {}
    }

    // ── Candidatas a la tabla de la verdad ──────────────────────────────────────────
    // La tabla de la verdad se queda DENTRO del script, como debe ser: es la decisión
    // de los coordinadores y no la toca nadie desde el navegador. Lo que hace el panel
    // es fabricar la propuesta con todo lo que hace falta para incorporarla.
    // Diálogo de clasificación. Clasificar es un HECHO comprobado en la ficha y actúa
    // al momento; proponer para aceptación automática es una DECISIÓN de los
    // coordinadores y aquí solo se anota. Van juntos porque el gestor ya está mirando
    // esa RFx, pero no son lo mismo y el diálogo lo dice.
    // ── Lista pegada por el gestor ───────────────────────────────────────────────────
    function abrirPegarLista() {
      const capa = D.createElement('div');
      capa.className = 'axDlgCapa';
      capa.innerHTML = `<div class="axDlgCaja">
        <h3>Pegar lista de RFx</h3>
        <div class="axDlgSub">La columna de números que te ha pasado el coordinador. Uno por línea,
          o tal cual salga de Excel.</div>
        <div class="axDlgNota"><b>Esto no acepta nada.</b> Busca cada RFx en el portal y te las
          enseña en la tabla para que las revises. Aceptar sigue siendo un paso aparte.</div>
        <textarea id="dLista" class="axDlgCampo" spellcheck="false"
          style="height:9.5em;resize:vertical;font-family:ui-monospace,Consolas,monospace"
          placeholder="7004232081&#10;7004232045&#10;7004232064"></textarea>
        <div class="axDlgAyuda">Si Excel te las ha convertido en <b>7,00427E+09</b>, formatea la
          columna como <b>Texto</b> y vuelve a copiar. El script detecta ese destrozo y te lo canta,
          pero más vale traerlas bien.</div>
        <div class="axDlgPie">
          <button class="b g" id="dCancelar">Cancelar</button>
          <button class="b p" id="dLeer">Buscar estas RFx</button>
        </div></div>`;
      panel.appendChild(capa);
      const q = id => capa.querySelector('#' + id);
      const cerrar = () => capa.remove();
      q('dCancelar').onclick = cerrar;
      capa.onclick = e => { if (e.target === capa) cerrar(); };
      try { q('dLista').focus(); } catch (e) {}
      q('dLeer').onclick = () => { const t = q('dLista').value; cerrar(); cargarDesdeLista(t); };
    }

    async function cargarDesdeLista(texto) {
      const r = parsearLista(texto);
      S.buscando = true; S.abortar = false;
      sincronizarBotones();
      reiniciarLog('▶ Lista pegada');
      log(`Pegados ${r.pegados} elementos · ${r.numeros.length} RFx con formato bueno`);
      if (r.duplicados.length)
        log(`⚠ ${r.duplicados.length} repetidas en la lista; las busco una vez: ${r.duplicados.join(', ')}`, 'w');
      for (const d of r.descartados) log(`✗ «${d.crudo}» se queda fuera: ${d.motivo}`, 'e');
      if (!r.numeros.length) {
        log('No hay ninguna RFx que buscar.', 'e');
        S.buscando = false; sincronizarBotones();
        return;
      }
      try {
        S.rango = null;            // la lista manda: nada de filtrar por fechas después
        const res = await M.recogerPorNumeros(r.numeros, log, barra);
        S.rfx = res.filas; S.sel.clear(); S.res = [];
        S.filtro = { op: '', srv: '', txt: '', sel: '' };
        try { $('qFTxt').value = ''; } catch (e) {}

        let go = 0, stop = 0, wait = 0;
        for (const f of S.rfx) {
          f.regla = decidir(f);
          f.deLista = true;
          // La lista viene aprobada por un coordinador, así que se preselecciona lo que
          // trae. Las vetadas NO: ésas salen desmarcadas a propósito.
          if (f.regla.d === 'stop') stop++;
          else { S.sel.add(f.num); if (f.regla.d === 'go') go++; else wait++; }
        }

        log(`✓ ${S.rfx.length} de ${r.numeros.length} localizadas en Open Requests`,
            res.noEstan.length ? 'w' : 'o');
        if (res.noEstan.length) {
          log(`⚠ ${res.noEstan.length} no aparecen en Open Requests (¿ya aceptadas, rechazadas o de otro sitio?):`, 'e');
          for (const n of res.noEstan) log(`   · ${n.num} — ${n.motivo}`, 'e');
        }
        if (go || wait)
          log(`Preseleccionadas ${go + wait}: ${go} respaldadas por el recetario, ${wait} sin regla conocida.`, 'w');
        if (stop)
          log(`⛔ ${stop} están VETADAS por regla de coordinador: salen desmarcadas y la herramienta `
            + `NO las acepta aunque las marques. Si hay que aceptarlas, habladlo entre coordinadores.`, 'e');
        log('Repasa la tabla. Nada se acepta sin que tú lo confirmes.', 'w');
        repintar(); sincronizarBotones();
      } catch (e) {
        apuntarDiag('fallo leyendo la lista', M.diagnostico());
        log('✗ ' + e.message, 'e');
        $('qLog').disabled = false;
      } finally {
        S.buscando = false;
        barra(0, 1);
        sincronizarBotones();
      }
    }

    function abrirClasificar(r, veces) {
      const clave = claveDe(r);
      if (!clave) return;
      const ambiguo = esAmbiguo(clave);
      const kGuardar = claveClasif(r);           // por importe, o por RFx si es ambiguo
      const yaClas = S.clasificaciones[kGuardar] || null;
      const yaCand = !!S.candidatas[clave];
      // «Sacar de la automática» solo tiene sentido donde HAY automática que quitar.
      const seAceptaSola = !!REGLAS.aceptar[clave];
      const yaRet = !!S.retiradas[clave];
      const auto = servicioAutomatico(r);
      const dAuto = desgloseAutomatico(r);
      const d = desgloseDe(r);
      const opNombre = (OPERADORES[operadorDe(r.ref)] || OPERADORES['?'])[0];
      const importe = importeDe(r.valor).toFixed(2);

      const capa = D.createElement('div');
      capa.className = 'axDlgCapa';
      const opciones = [['PIM', 'PIM'], ['EMR', 'EMR'], ['DIS', 'Diseño']];
      let elegido = (yaClas && yaClas.servicio) || auto || '';

      const chips = () => opciones.map(([v, t]) =>
        `<button class="ch" type="button" data-srv="${v}" aria-pressed="${elegido === v}">${t}</button>`).join('');

      capa.innerHTML = `<div class="axDlgCaja">
        <h3>Clasificar ${clave}</h3>
        <div class="axDlgSub">${opNombre} · ${importe} € · RFx ${r.num}${r.proyecto ? ' · ' + r.proyecto : ''}
          ${veces > 1 ? ' · <b>aparece ' + veces + ' veces</b> en esta búsqueda' : ''}</div>
        ${ambiguo ? `<div class="axDlgNota"><b>Este importe no identifica lo que se compró.</b>
          En el histórico conviven ${AMBIGUAS[clave].length} composiciones distintas:
          ${AMBIGUAS[clave].map(o => `<br>&nbsp;&nbsp;· ${o.pct}% (${o.n} RFx) — ${firmaLegible(o.f)}`
              + (subtipoDeFirma(o.f).length ? ` → ${subtipoDeFirma(o.f).join('/')}` : '')).join('')}
          <br><br>Por eso lo que pongas aquí vale <b>solo para la RFx ${r.num}</b>, no para las demás
          de ${importe} €.</div>` : ''}
        ${dAuto && !dAuto.ambiguo ? `<div class="axDlgSub">Desglose según el recetario: ${firmaLegible(dAuto.firma)}</div>` : ''}
        ${auto && (!yaClas || yaClas.servicio === auto)
          ? `<div class="axDlgNota">El recetario ya dice que esto es <b>${nombreServicio(auto)}</b>.
             Si eliges otro, mandará el tuyo.</div>` : ''}
        <div style="font-size:.72em;color:#5a646e;text-transform:uppercase;letter-spacing:.06em">Servicio</div>
        <div class="gr" id="dSrv" style="display:flex;gap:.25em;flex-wrap:wrap;margin:.3em 0 .2em">${chips()}</div>
        <div style="font-size:.72em;color:#5a646e;margin-top:.7em">Desglose visto en la ficha (opcional)</div>
        <input type="text" class="axDlgCampo" id="dDesg" placeholder="p. ej. ER_015:2"
               value="${yaClas && yaClas.desglose ? yaClas.desglose : (dAuto && !dAuto.ambiguo ? dAuto.firma : '')}">
        ${seAceptaSola ? `
        <div class="axDlgPregunta">Hoy <b>${clave} se acepta sola</b> por regla de coordinador.
          ¿Sacarla de la aceptación automática?</div>
        <button type="button" id="dRet" class="axDlgTick" role="checkbox"
                aria-checked="${yaRet ? 'true' : 'false'}">
          <span class="ck${yaRet ? ' on' : ''}">${yaRet ? '&#10003;' : ''}</span>
          <span>Sí, que pase a «revisar»</span></button>
        <div style="font-size:.72em;color:#5a646e;margin-top:.5em">¿Por qué? (va en el aviso)</div>
        <input type="text" class="axDlgCampo" id="dRetMot" placeholder="p. ej. el importe ya no corresponde a este alcance"
               value="${yaRet && S.retiradas[clave].motivo ? String(S.retiradas[clave].motivo).replace(/"/g, '&quot;') : ''}">
        <div style="font-size:.72em;color:#5a646e;margin-top:.5em">Tu nombre, para que sepan quién lo pide</div>
        <input type="text" class="axDlgCampo" id="dQuien" placeholder="p. ej. Marta G."
               value="${(S.gestor || '').replace(/"/g, '&quot;')}">
        <div class="axDlgAyuda">Deja de marcarse sola <b>en tu ordenador y desde ya</b>, y afecta a
          <b>todas las de ${opNombre} · ${importe} €</b>. Seguirás pudiendo aceptarlas a mano.
          Para que el cambio llegue a los demás hay que pasarnos la aportación: la tabla vive
          dentro del script y solo cambia publicando una versión nueva.</div>
        ` : ''}
        <div class="axDlgPregunta">¿Proponerla además como
          <b>candidata a aceptación automática</b>?</div>
        <button type="button" id="dCand" class="axDlgTick" role="checkbox"
                aria-checked="${yaCand ? 'true' : 'false'}">
          <span class="ck${yaCand ? ' on' : ''}">${yaCand ? '&#10003;' : ''}</span>
          <span>Sí, proponerla</span></button>
        <div class="axDlgAyuda">Marcar esto <b>no acepta nada</b>: queda anotado para que
          lo aprueben los coordinadores.</div>
        <div class="axDlgPie">
          ${(yaClas || yaCand || yaRet) ? '<button class="b g" id="dBorrar">Quitar aportación</button>' : ''}
          <button class="b g" id="dCancelar">Cancelar</button>
          ${seAceptaSola ? '<button class="b g" id="dGuardarAviso">Guardar y copiar</button>'
                          + '<button class="b p" id="dGuardarCorreo">Guardar y enviar aviso</button>' : ''}
          <button class="b ${seAceptaSola ? 'g' : 'p'}" id="dGuardar">Guardar</button>
        </div></div>`;

      panel.appendChild(capa);
      // Deja rastro: si esta línea aparece en el registro y el diálogo no se ve,
      // el problema es de estilos, no de lógica. Nos ahorra media hora de adivinar.
      log(`Clasificando ${clave}…`);
      const q = id => capa.querySelector('#' + id);
      const refrescarChips = () => {
        for (const b of q('dSrv').querySelectorAll('.ch'))
          b.setAttribute('aria-pressed', String(b.dataset.srv === elegido));
      };
      // Pulsar un servicio SIEMPRE lo elige. Nada de alternar: si al abrir el diálogo
      // ya venía uno preseleccionado, pulsarlo lo apagaba y el guardado se iba en vano.
      for (const b of q('dSrv').querySelectorAll('.ch'))
        b.onclick = () => { elegido = b.dataset.srv; refrescarChips(); };

      // Casillas dibujadas a mano: el estado vive en aria-checked, no en un input.
      // (Los checkbox nativos los esconde el tema de OutSystems; esto ya nos pasó.)
      const conmutar = el => {
        const marcado = () => el.getAttribute('aria-checked') === 'true';
        el.onclick = () => {
          const nuevo = !marcado();
          el.setAttribute('aria-checked', String(nuevo));
          const caja = el.querySelector('.ck');
          caja.className = 'ck' + (nuevo ? ' on' : '');
          caja.innerHTML = nuevo ? '&#10003;' : '';
        };
        return marcado;
      };
      const marcado = conmutar(q('dCand'));
      const marcadoRet = q('dRet') ? conmutar(q('dRet')) : () => false;

      // El botón del aviso solo tiene sentido si de verdad se está retirando algo.
      // Apagado dice más que escondido: se ve que existe y por qué no se puede usar.
      const sincronizarAviso = () => {
        for (const [id, siMarcado] of [['dGuardarAviso', 'Guarda y te deja el aviso en el portapapeles'],
                                       ['dGuardarCorreo', 'Guarda y abre tu correo con el aviso ya escrito']]) {
          const b = q(id);
          if (!b) continue;
          b.disabled = !marcadoRet();
          b.title = marcadoRet() ? siMarcado : 'Marca antes «Sí, que pase a revisar»';
        }
      };
      if (q('dRet')) {
        const alPulsar = q('dRet').onclick;
        q('dRet').onclick = () => { alPulsar(); sincronizarAviso(); };
      }
      sincronizarAviso();

      const cerrar = () => capa.remove();
      capa.onclick = ev => { if (ev.target === capa) cerrar(); };
      q('dCancelar').onclick = cerrar;
      if (q('dBorrar')) q('dBorrar').onclick = () => {
        delete S.clasificaciones[kGuardar]; delete S.candidatas[clave]; delete S.retiradas[clave];
        reevaluar(clave);
        guardarCandidatas(); cerrar(); repintar(); pintarCandidatas();
        log(`Retirada la aportación sobre ${clave}, y ${clave} vuelve a su decisión de fábrica.`);
      };

      const guardar = async (conAviso) => {
        const desglose = q('dDesg').value.trim();
        const base = {
          clave,
          alcance: ambiguo ? ('solo la RFx ' + r.num) : 'todas las de ese importe',
          ambiguo,
          operador: opNombre,
          importe,
          servicio: elegido,
          desglose,
          veces,
          ejemplo: r.num,
          proyecto: r.proyecto || '',
          fecha: hoy()
        };

        // Vale con una de las dos cosas: puedes saber el desglose y no el servicio,
        // o al revés. Antes, sin servicio, lo escrito se tiraba a la basura.
        if (elegido || desglose) {
          S.clasificaciones[kGuardar] = base;
          const partes = [];
          if (elegido) partes.push(`servicio ${nombreServicio(elegido)}`);
          if (desglose) partes.push(`desglose ${firmaLegible(desglose)}`);
          log(`✎ ${clave}: ${partes.join(' · ')}`
            + (elegido && auto && auto !== elegido ? ` (el recetario decía ${nombreServicio(auto)})` : '')
            + (ambiguo ? ` · solo para la RFx ${r.num} (importe ambiguo)`
                        : (veces > 1 ? ` · afecta a ${veces} RFx de esta búsqueda` : '')), 'o');
        } else if (S.clasificaciones[kGuardar]) {
          delete S.clasificaciones[kGuardar];
          log(`Retirada la clasificación de ${clave}.`);
        }

        if (marcado()) {
          S.candidatas[clave] = base;
          log(`✚ ${clave} propuesta como candidata a aceptación automática. No se acepta nada por esto.`
            + (ambiguo ? ' ⚠ Es un importe AMBIGUO: la propuesta lo dice.' : ''), ambiguo ? 'w' : 'o');
        } else if (S.candidatas[clave]) {
          delete S.candidatas[clave];
          log(`Retirada la candidata ${clave}.`);
        }

        // Marcha atrás sobre la aceptación automática. Surte efecto ya, aquí, y además
        // queda anotada para que llegue al script por la vía de las aportaciones.
        if (seAceptaSola) {
          const motivo = q('dRetMot') ? q('dRetMot').value.trim() : '';
          if (q('dQuien')) S.gestor = q('dQuien').value.trim() || S.gestor;
          if (marcadoRet()) {
            S.retiradas[clave] = Object.assign({}, base, { motivo, retiradaEl: hoy(), reglaSrv: REGLAS.aceptar[clave].srv });
            const c = reevaluar(clave);
            log(`↩ ${clave} sale de la aceptación automática: pasa a «revisar»`
              + (veces > 1 ? ` · afecta a ${veces} RFx de esta búsqueda` : '')
              + (motivo ? ` · «${motivo}»` : '')
              + (c.desmarcadas ? ` · ${c.desmarcadas} ${c.desmarcadas === 1 ? 'queda desmarcada' : 'quedan desmarcadas'}` : '')
              + '. Seguirán pudiendo aceptarse a mano, marcándolas tú.', 'w');
          } else if (S.retiradas[clave]) {
            delete S.retiradas[clave];
            const c = reevaluar(clave);
            log(`↪ ${clave} vuelve a la aceptación automática`
              + (c.marcadas ? ` · ${c.marcadas} vuelven a quedar marcadas` : '') + '.', 'o');
          }
        }

        guardarCandidatas(); cerrar(); repintar(); pintarCandidatas();

        if (conAviso && S.retiradas[clave]) {
          if (conAviso === 'correo') {
            await redactarCorreo(S.retiradas[clave]);
          } else {
            const bien = await copiar(avisoRetirada(S.retiradas[clave]), D);
            log(bien
              ? `✓ Aviso de ${clave} copiado. Pégalo en el correo o el chat: lleva la línea exacta que hay que borrar del script.`
              : '✗ No he podido copiar. Ábrelo en «Aportaciones» y descárgalo.', bien ? 'o' : 'e');
          }
        }
      };

      q('dGuardar').onclick = () => guardar(null);
      if (q('dGuardarAviso'))  q('dGuardarAviso').onclick  = () => guardar('copiar');
      if (q('dGuardarCorreo')) q('dGuardarCorreo').onclick = () => guardar('correo');
    }

    // ── Aviso para quien mantiene el script ──────────────────────────────────────────
    // La gracia está en la línea literal: Pepe no tiene que buscar nada ni interpretar
    // nada, solo borrar exactamente eso. Y va con un bloque en JSON al final para que
    // una herramienta pueda aplicarlo sola el día que la montemos.
    function lineaDeRegla(clave) {
      const r = REGLAS.aceptar[clave];
      if (!r) return null;
      return `      "${clave}": { firma: "${r.firma}", srv: "${r.srv}" },`;
    }

    // `breve` es la misma información con menos texto, para el cuerpo del correo: un
    // mailto largo lo trunca Outlook sin avisar, y un aviso cortado a media línea es
    // peor que no mandarlo. Un solo generador para las dos: la línea literal, que es lo
    // que de verdad importa, sale del mismo sitio en ambos casos.
    function avisoRetirada(cs, breve) {
      const lista = Array.isArray(cs) ? cs : [cs];
      const vivas = lista.filter(c => REGLAS.aceptar[c.clave]);
      if (breve) {
        const B = [];
        B.push('Hola:');
        B.push('');
        if (!vivas.length) { B.push('No hay nada pendiente: esas reglas ya no están en el script.'); return B.join('\r\n'); }
        B.push(`Hay que quitar ${vivas.length} ${vivas.length === 1 ? 'regla' : 'reglas'} de la aceptación`
             + ` automática en aat_rfx.user.js (visto con la v${VERSION}).`);
        B.push('');
        for (const c of vivas) {
          B.push(`${c.clave} — ${c.operador} · ${c.importe} €`);
          B.push(`Motivo: ${c.motivo || '(no indicado)'}`);
          B.push(`Visto en: RFx ${c.ejemplo}${c.proyecto ? ' (' + c.proyecto + ')' : ''}`
               + `${c.veces > 1 ? ', ' + c.veces + ' RFx en esa búsqueda' : ''}`);
          B.push('');
          B.push('Línea a borrar en REGLAS -> aceptar:');
          B.push(lineaDeRegla(c.clave).trim());
          B.push('');
        }
        B.push('No tocar no_aceptar. Subir @version y VERSION. Pasar node test_release.js.');
        B.push('');
        B.push(S.gestor || '');
        return B.join('\r\n');
      }
      const L = [];
      L.push('AAT · Gestionar RFx — RETIRAR DE LA ACEPTACIÓN AUTOMÁTICA');
      L.push(`Lo pide : ${S.gestor || '(sin nombre)'}`);
      L.push(`Fecha   : ${hoy()}`);
      L.push(`Script  : v${VERSION}`);
      L.push('');
      if (!vivas.length) {
        L.push('No hay nada pendiente: las retiradas que tenía ya no están en el script.');
        return L.join('\r\n');
      }
      L.push(vivas.length === 1
        ? 'Hay 1 regla que hoy acepta sola y no debería:'
        : `Hay ${vivas.length} reglas que hoy aceptan solas y no deberían:`);
      L.push('');
      for (const c of vivas) {
        L.push(`  ${c.clave}   ${c.operador} · ${c.importe} €`);
        L.push(`     motivo  : ${c.motivo || '(no lo dijo)'}`);
        L.push(`     visto en: RFx ${c.ejemplo}${c.proyecto ? ' (' + c.proyecto + ')' : ''}`
             + `${c.veces > 1 ? ' · ' + c.veces + ' RFx en esa búsqueda' : ''}`);
        L.push('');
      }
      L.push('QUÉ HAY QUE HACER EN aat_rfx.user.js');
      L.push('');
      L.push(`  1. En «const REGLAS = {` + `» → «aceptar:», borrar ${vivas.length === 1 ? 'esta línea' : 'estas líneas'}:`);
      L.push('');
      for (const c of vivas) L.push(lineaDeRegla(c.clave));
      L.push('');
      L.push('  2. NO tocar «no_aceptar»: ésas son los vetos de los coordinadores.');
      L.push('  3. No hace falta tocar RECETAS: el servicio se sigue sabiendo por ahí.');
      L.push('  4. Subir LAS DOS versiones: «// @version» y «const VERSION».');
      L.push('  5. Ejecutar «node test_release.js» antes de publicar.');
      L.push('');
      L.push('--- AAT-APORTACION v1 · no borres esto, lo lee la herramienta ---');
      L.push(JSON.stringify({
        tipo: 'retiradas', version: VERSION, gestor: S.gestor || '', fecha: hoy(),
        claves: vivas.map(c => ({ clave: c.clave, motivo: c.motivo || '', ejemplo: c.ejemplo,
                                  veces: c.veces, linea: lineaDeRegla(c.clave).trim() }))
      }));
      L.push('--- fin ---');
      return L.join('\r\n');
    }

    // Abre el correo del gestor con el aviso ya redactado. Se hace con un <a> temporal
    // y NO cambiando location: el panel puede estar en una ventana aparte, y navegar
    // ahí lo mataría. Si el mailto sale demasiado largo, Outlook lo corta en silencio,
    // así que en ese caso ni se intenta: se copia y se dice.
    const TOPE_MAILTO = 1900;
    async function redactarCorreo(cs) {
      const lista = (Array.isArray(cs) ? cs : [cs]).filter(c => REGLAS.aceptar[c.clave]);
      if (!lista.length) {
        log('No hay nada pendiente que avisar: esas reglas ya no están en el script.', 'w');
        return;
      }
      const asunto = lista.length === 1
        ? `AAT · Retirar de la aceptación automática: ${lista[0].clave}`
        : `AAT · Retirar ${lista.length} reglas de la aceptación automática`;
      const cuerpo = avisoRetirada(lista, true);
      const destino = S.correoMant || CORREO_MANTENIMIENTO || '';
      const url = `mailto:${encodeURIComponent(destino)}`
        + `?subject=${encodeURIComponent(asunto)}&body=${encodeURIComponent(cuerpo)}`;

      if (url.length > TOPE_MAILTO) {
        const bien = await copiar(avisoRetirada(lista), D);
        log(`El aviso es largo (${lista.length} reglas) y el correo lo cortaría a medias. `
          + (bien ? 'Te lo he copiado entero: pégalo en un correo nuevo.'
                  : 'No he podido copiarlo; usa «Descargar .txt» en Aportaciones.'), bien ? 'w' : 'e');
        return;
      }
      try {
        const a = D.createElement('a');
        a.href = url;
        a.style.display = 'none';
        D.body.appendChild(a);
        a.click();
        setTimeout(() => { try { a.remove(); } catch (e) {} }, 2000);
        log('✉ Correo abierto con el aviso ya escrito. Repásalo y envíalo.'
          + (destino ? '' : ' Ponle tú el destinatario: no hay ninguno configurado.'), 'o');
      } catch (e) {
        const bien = await copiar(avisoRetirada(lista), D);
        log('No he podido abrir el correo. ' + (bien ? 'Te he copiado el aviso.' : ''), 'w');
      }
    }

    function textoCandidatas() {
      const L = [];
      L.push(`AAT · Aportaciones del panel v${VERSION} · ${hoy()}`);
      L.push('');
      L.push('== CLASIFICACIONES DE SERVICIO ==========================');
      L.push('Hechos comprobados en la ficha. Van al recetario del script.');
      L.push('');
      const clas = Object.values(S.clasificaciones).sort((a, b) => b.veces - a.veces);
      if (!clas.length) L.push('(ninguna)');
      for (const c of clas) {
        L.push(`${c.clave}   ${c.operador} · ${c.importe} €   →   ${c.servicio}`);
        if (c.desglose) L.push(`    desglose : ${c.desglose}`);
        if (c.alcance)  L.push(`    alcance  : ${c.alcance}`);
        L.push(`    veces    : ${c.veces}   ejemplo: ${c.ejemplo}${c.proyecto ? ' (' + c.proyecto + ')' : ''}`);
        L.push(`    fecha    : ${c.fecha}`);
        L.push('');
      }
      L.push('== CANDIDATAS A ACEPTACIÓN AUTOMÁTICA ===================');
      L.push('PROPUESTAS, no reglas. NO están activas: tienen que aprobarlas los');
      L.push('coordinadores y entrar en la tabla de la verdad del script.');
      L.push('');
      const filas = Object.values(S.candidatas).sort((a, b) => b.veces - a.veces);
      if (!filas.length) L.push('(ninguna)');
      for (const c of filas) {
        L.push(`${c.clave}   ${c.operador} · ${c.importe} €`);
        L.push(`    desglose : ${c.desglose ? firmaLegible(c.desglose) : '(desconocido)'}`);
        L.push(`    firma    : ${c.desglose || '-'}`);
        L.push(`    servicio : ${c.servicio || '-'}`);
        L.push(`    veces    : ${c.veces}   ejemplo: ${c.ejemplo}${c.proyecto ? ' (' + c.proyecto + ')' : ''}`);
        if (c.ambiguo) {
          L.push('    ¡OJO!   : IMPORTE AMBIGUO. En el histórico conviven varias composiciones');
          L.push('              con este mismo total, así que aceptar por importe no garantiza');
          L.push('              qué se está aceptando. Decidir sabiendo esto.');
        }
        L.push(`    propuesta: ${c.fecha}`);
        L.push('');
      }
      L.push('== RETIRADAS DE LA ACEPTACIÓN AUTOMÁTICA ================');
      L.push('El gestor ha dado marcha atrás: hoy el script las acepta solas y él dice');
      L.push('que no debería. En SU panel ya pasan a «revisar». Para que valga para');
      L.push('todos hay que quitar la regla del script y publicar versión nueva.');
      L.push('');
      const rets = Object.values(S.retiradas);
      if (!rets.length) L.push('(ninguna)');
      for (const c of rets) {
        const viva = !!REGLAS.aceptar[c.clave];
        L.push(`${c.clave}   ${c.operador} · ${c.importe} €`);
        L.push(`    motivo   : ${c.motivo || '(no lo dijo)'}`);
        L.push(`    regla    : ${viva ? 'SIGUE ACTIVA en el script — hay que quitarla'
                                      : 'ya no está en el script: esta retirada sobra'}`);
        L.push(`    servicio : ${c.reglaSrv || '-'}`);
        L.push(`    veces    : ${c.veces}   ejemplo: ${c.ejemplo}${c.proyecto ? ' (' + c.proyecto + ')' : ''}`);
        L.push(`    retirada : ${c.retiradaEl || c.fecha}`);
        L.push('');
      }
      return L.join('\r\n');
    }

    function pintarCandidatas() {
      const caja = $('qCandBox');
      const clas  = Object.values(S.clasificaciones).sort((a, b) => b.veces - a.veces);
      const apar  = Object.values(S.apartadas || {});
      const rets  = Object.values(S.retiradas || {});
      const filas = Object.values(S.candidatas).sort((a, b) => b.veces - a.veces);
      $('qCand').textContent = `Aportaciones${nAportes() ? ' (' + nAportes() + ')' : ''}`;
      if (caja.classList.contains('oculto')) return;

      if (!clas.length && !filas.length && !apar.length && !rets.length) {
        caja.innerHTML = '<h4>Tus aportaciones</h4>'
          + '<div style="color:#8a949e">Todavía no hay ninguna. En las RFx que ponen «revisar», '
          + 'pulsa «clasificar» para decir de qué servicio son.</div>'
          + '<div style="margin-top:.5em"><button class="b g" id="qCandCerrar">Cerrar</button></div>';
      } else {
        const tabla = (titulo, aviso, datos, columnaExtra) => datos.length ? `
          <h4 style="margin-top:.8em">${titulo} (${datos.length})</h4>
          <div style="font-size:.78em;color:#5a646e;margin-bottom:.4em">${aviso}</div>
          <table><thead><tr><th>Clave</th><th>Operador</th><th>Importe</th>
            <th>${columnaExtra}</th><th>Veces</th><th></th></tr></thead><tbody>${
            datos.map(c => `<tr>
              <td class="num">${c.clave}</td><td>${c.operador}</td><td class="num">${c.importe} €</td>
              <td>${columnaExtra === 'Servicio'
                    ? nombreServicio(c.servicio)
                    : (c.desglose ? firmaLegible(c.desglose) : '<span style="color:#b0b8c0">sin desglose</span>')}</td>
              <td class="num">×${c.veces}</td>
              <td><button class="quita" type="button" data-quita="${c.clave}" data-tipo="${columnaExtra === 'Servicio' ? 'clas' : 'cand'}">quitar</button></td>
            </tr>`).join('')}</tbody></table>` : '';

        caja.innerHTML = '<h4>Tus aportaciones</h4>'
          + `<div style="font-size:.78em;color:#5a646e;margin:-.2em 0 .6em">
              Tu nombre, para que quien mantiene el script sepa a quién preguntar:
              <input type="text" id="qQuien" placeholder="p. ej. Marta G." autocomplete="off"
                value="${(S.gestor || '').replace(/"/g, '&quot;')}"
                style="padding:.2em .4em;border:1px solid #c6ccd3;border-radius:4px;font:inherit;width:11em">
              ${rets.length ? `&nbsp;&nbsp;Enviar los avisos a:
              <input type="text" id="qCorreoMant" placeholder="correo de quien mantiene el script" autocomplete="off"
                value="${(S.correoMant || CORREO_MANTENIMIENTO || '').replace(/"/g, '&quot;')}"
                style="padding:.2em .4em;border:1px solid #c6ccd3;border-radius:4px;font:inherit;width:15em">` : ''}
            </div>`
          + tabla('Clasificaciones de servicio',
                  'Hechos que has comprobado en la ficha. <b>Ya están actuando en tu panel</b> y se incorporarán al recetario del script.',
                  clas, 'Servicio')
          + (apar.length ? `
            <h4 style="margin-top:.8em">Apartadas (${apar.length})</h4>
            <div style="font-size:.78em;color:#5a646e;margin-bottom:.4em">
              Clasificaciones que hiciste por importe y que dejaron de valer al descubrir que
              ese importe tiene varias composiciones. <b>No están actuando.</b> Vuelve a hacerlas
              sobre la RFx concreta que miraste.</div>
            <table><thead><tr><th>Clave</th><th>Operador</th><th>Importe</th><th>Servicio</th><th>Motivo</th><th></th></tr></thead>
            <tbody>${apar.map(c => `<tr>
              <td class="num">${c.clave}</td><td>${c.operador}</td><td class="num">${c.importe} €</td>
              <td>${nombreServicio(c.servicio)}</td><td style="font-size:.85em">${c.motivo || ''}</td>
              <td><button class="quita" type="button" data-quita="${c.clave}" data-tipo="apar">quitar</button></td>
            </tr>`).join('')}</tbody></table>` : '')
          + tabla('Candidatas a aceptación automática',
                  'Propuestas, no reglas: <b>no se acepta nada por estar aquí</b>. Tienen que aprobarlas los coordinadores.',
                  filas, 'Desglose')
          + (rets.length ? `
            <h4 style="margin-top:.8em">Retiradas de la aceptación automática (${rets.length})</h4>
            <div style="font-size:.78em;color:#5a646e;margin-bottom:.4em">
              Marcha atrás sobre reglas que hoy aceptan solas. <b>Ya están actuando en tu panel</b>:
              esas RFx pasan a «revisar» y puedes aceptarlas a mano. Para que valga para todos hay
              que quitar la regla del script y publicar versión nueva, así que <b>pásanos esto</b>.</div>
            <table><thead><tr><th>Clave</th><th>Operador</th><th>Importe</th><th>Motivo</th><th>Regla</th><th></th></tr></thead>
            <tbody>${rets.map(c => `<tr>
              <td class="num">${c.clave}</td><td>${c.operador}</td><td class="num">${c.importe} €</td>
              <td style="font-size:.85em">${c.motivo ? String(c.motivo).replace(/</g, '&lt;') : '<span style="color:#b0b8c0">sin motivo</span>'}</td>
              <td style="font-size:.85em">${REGLAS.aceptar[c.clave]
                    ? '<b style="color:#7a4b00">sigue en el script</b>'
                    : '<span style="color:#8a949e">ya recogida: esto sobra</span>'}</td>
              <td><button class="quita" type="button" data-correo="${c.clave}">correo</button>
                  <button class="quita" type="button" data-aviso="${c.clave}">copiar</button>
                  <button class="quita" type="button" data-quita="${c.clave}" data-tipo="ret">quitar</button></td>
            </tr>`).join('')}</tbody></table>` : '')
          + `<div style="margin-top:.6em;display:flex;gap:.4em;flex-wrap:wrap;align-items:center">
            ${rets.length ? '<button class="b p" id="qRetCorreo">Enviar aviso por correo</button>'
                           + '<button class="b g" id="qRetAviso">Copiar aviso</button>' : ''}
            <button class="b g" id="qCandCopiar">Copiar todas las aportaciones</button>
            <button class="b g" id="qCandBajar">Descargar .txt</button>
            <button class="b g" id="qCandVaciar">Vaciar todo</button>
            <button class="b g" id="qCandCerrar">Cerrar</button>
          </div>`;
      }

      const on = (id, fn) => { const b = $(id); if (b) b.onclick = fn; };
      on('qCandCerrar', () => { caja.classList.add('oculto'); });

      const campoQuien = $('qQuien');
      if (campoQuien) campoQuien.oninput = () => { S.gestor = campoQuien.value.trim(); guardarCandidatas(); };
      const campoCorreo = $('qCorreoMant');
      if (campoCorreo) campoCorreo.oninput = () => { S.correoMant = campoCorreo.value.trim(); guardarCandidatas(); };

      on('qRetCorreo', () => redactarCorreo(rets));
      on('qRetAviso', async () => {
        const texto = avisoRetirada(rets);
        const bien = await copiar(texto, D);
        log(bien
          ? '✓ Aviso copiado. Pégalo tal cual en el correo o el chat: lleva la línea exacta que hay que borrar.'
          : '✗ No he podido copiar. Usa «Descargar .txt».', bien ? 'o' : 'e');
        if (bien && !S.gestor)
          log('  Ponle tu nombre arriba y vuelve a copiarlo, para que Pepe sepa quién lo pide.', 'w');
      });

      for (const b of caja.querySelectorAll('[data-correo]'))
        b.onclick = () => { const c = S.retiradas[b.dataset.correo]; if (c) redactarCorreo(c); };

      for (const b of caja.querySelectorAll('[data-aviso]'))
        b.onclick = async () => {
          const c = S.retiradas[b.dataset.aviso];
          if (!c) return;
          const bien = await copiar(avisoRetirada(c), D);
          log(bien ? `✓ Aviso de ${c.clave} copiado, listo para enviárselo a Pepe.`
                   : '✗ No he podido copiar.', bien ? 'o' : 'e');
        };
      on('qCandCopiar', async () => {
        const bien = await copiar(textoCandidatas(), D);
        log(bien ? '✓ Aportaciones copiadas al portapapeles.' : '✗ No he podido copiar.', bien ? 'o' : 'e');
      });
      on('qCandBajar', () => descargar(textoCandidatas(), `aportaciones_rfx_${hoy()}.txt`, D));
      on('qCandVaciar', () => {
        if (!V.confirm('¿Vaciar todas tus aportaciones?\n\nSe pierden las clasificaciones, las candidatas '
          + 'y las retiradas de la aceptación automática. Los importes que hubieras sacado de la automática '
          + 'volverán a aceptarse solos.')) return;
        S.candidatas = {}; S.clasificaciones = {}; S.apartadas = {}; S.retiradas = {};
        reevaluar(null);
        guardarCandidatas(); pintarCandidatas(); repintar();
      });
      for (const b of caja.querySelectorAll('[data-quita]'))
        b.onclick = () => {
          if (b.dataset.tipo === 'clas') delete S.clasificaciones[b.dataset.quita];
          else if (b.dataset.tipo === 'apar') delete S.apartadas[b.dataset.quita];
          else if (b.dataset.tipo === 'ret')  delete S.retiradas[b.dataset.quita];
          else delete S.candidatas[b.dataset.quita];
          if (b.dataset.tipo === 'ret') reevaluar(b.dataset.quita);
          guardarCandidatas(); pintarCandidatas(); repintar();
        };
    }

    // ── Aceptación / simulación ──────────────────────────────────────────────────────
    async function ejecutar(simular) {
      const lista = [...S.sel];
      if (!lista.length) return;

      // Última red: aunque algo se colara en la selección, una vetada no se acepta.
      const vetadas = lista.filter(n => (S.rfx.find(r => r.num === n)?.regla || {}).d === 'stop');
      const cola = lista.filter(n => !vetadas.includes(n));
      if (vetadas.length) log(`⚠ ${vetadas.length} vetadas por regla quedan fuera: ${vetadas.join(', ')}`, 'w');
      if (!cola.length) { log('No queda nada que procesar.', 'w'); return; }
      const fuera = ocultasMarcadas().length;
      if (fuera) log(`Nota: ${fuera} de las seleccionadas no estaban a la vista por el filtro. Van igual.`, 'w');

      S.corriendo = true; S.abortar = false;
      S.res = S.res.filter(r => !cola.includes(r.num));
      sincronizarBotones();
      reiniciarLog(simular ? '▶ SIMULACIÓN (no se pulsa nada)' : '▶ ACEPTANDO');

      let hechas = 0, bien = 0, mal = 0, dudosas = 0, desdeRefresco = 0;
      try {
        await M.iniciar(log);
        for (const num of cola) {
          if (S.abortar) { log('■ Abortado.', 'w'); break; }
          hechas++; barra(hechas, cola.length);

          if (desdeRefresco >= RFX_POR_REFRESCO) {
            log(`↻ Refrescando el motor tras ${RFX_POR_REFRESCO} RFx…`, 'w');
            try { await M.iniciar(log); desdeRefresco = 0; await dormir(800); }
            catch (e) {
              log('  el refresco falló, reintento…', 'w'); await dormir(3000);
              try { await M.iniciar(log); desdeRefresco = 0; }
              catch (e2) { log('✗ No consigo reactivar el motor. Me detengo; lo aceptado está a salvo.', 'e'); break; }
            }
          }

          try {
            await M.volverALista(log, true);
            if (S.rango) await M.fijarFechas(S.rango.desde, S.rango.hasta, log);
            await M.filtrarPorNumero(num);
            const abierta = await M.abrirFicha(num);
            if (!abierta.ok) throw new Error(abierta.motivo);

            if (simular) {
              bien++;
              S.res.push({ num, estado: 'SIMULADO', motivo: 'ficha correcta' });
              log(`${hechas}/${cola.length} ${num} · listo`);
            } else {
              const r = await M.aceptar(num);
              if (r.ok) {
                bien++; S.res.push({ num, estado: 'OK', ms: r.ms });
                log(`${hechas}/${cola.length} ${num} · aceptada (${(r.ms / 1000).toFixed(1)}s)`, 'o');
              } else if (r.incierto) {
                dudosas++; S.res.push({ num, estado: 'DUDOSO', motivo: r.motivo });
                log(`${hechas}/${cola.length} ${num} · SIN CONFIRMAR`, 'w');
              } else {
                mal++; S.res.push({ num, estado: 'ERROR', motivo: r.motivo });
                log(`${hechas}/${cola.length} ${num} · ${r.motivo}`, 'e');
              }
            }
          } catch (e) {
            mal++;
            S.res.push({ num, estado: 'ERROR', motivo: e.message });
            apuntarDiag(`fallo con ${num}`, M.diagnostico());
            log(`${hechas}/${cola.length} ${num} · ${e.message}`, 'e');
          }
          desdeRefresco++; repintar(); await dormir(1200);
        }
      } catch (e) {
        apuntarDiag('fallo general', M.diagnostico());
        log('✗ Fallo general: ' + e.message, 'e');
      }

      S.corriendo = false;
      sincronizarBotones();
      repintar();
      log(`── ${bien} correctas · ${dudosas} dudosas · ${mal} con error ──`, (mal || dudosas) ? 'w' : 'o');
      if (!simular) log('Pulsa «Verificar»: este resumen no prueba nada.', 'w');
    }

    // ── Botones ──────────────────────────────────────────────────────────────────────
    panel.querySelector('.x').onclick = () => {
      if (S.corriendo && !V.confirm('Hay un proceso en marcha. ¿Cerrar igualmente?')) return;
      S.abortar = true; M.destruir();
      panel.remove(); if (fondo) fondo.remove(); estilo.remove();
      if (enVentana) { try { V.close(); } catch (e) {} }
    };

    // El interruptor de fechas: al encenderlo, los dos campos se apagan para que quede
    // claro que no pintan nada. No es un <input type=checkbox> a propósito: el tema de
    // OutSystems los esconde y ya nos costó un rato descubrirlo la otra vez.
    const sinFechas = () => $('qSinFechas').getAttribute('aria-pressed') === 'true';
    $('qSinFechas').onclick = () => {
      const nuevo = !sinFechas();
      $('qSinFechas').setAttribute('aria-pressed', String(nuevo));
      $('qD').disabled = nuevo; $('qH').disabled = nuevo;
    };

    $('qBuscar').onclick = async () => {
      const todas = sinFechas();
      let desde = $('qD').value.trim(), hasta = $('qH').value.trim();
      if (todas) {
        // Un rango absurdamente ancho equivale a «sin fechas» y reaprovecha el troceado
        // por mitades, que está rodado. Escribir un barrido nuevo sin fechas sería
        // código nuevo sin probar justo en el sitio donde menos conviene.
        desde = '2015-01-01'; hasta = hoy();
      } else if (!/^\d{4}-\d{2}-\d{2}$/.test(desde) || !/^\d{4}-\d{2}-\d{2}$/.test(hasta)) {
        return log('✗ Formato de fecha incorrecto (YYYY-MM-DD).', 'e');
      }

      if (todas && !V.confirm(
        'Vas a barrer TODAS las pendientes, sin filtro de fecha.\n\n'
        + 'En la última comprobación eran unas 990 RFx (33 páginas) y tarda un par de '
        + 'minutos.\n\nSi lo que quieres es lo de estos días, cancela y usa el rango.\n\n¿Seguimos?'))
        return;

      S.buscando = true; S.abortar = false;
      sincronizarBotones();
      reiniciarLog('▶ Buscando pendientes…');
      try {
        S.rango = { desde, hasta };
        log(todas ? 'Sin filtro de fechas: todas las pendientes.' : `Rango de creación ${desde} → ${hasta}`);
        const r = await M.recogerPorTramos(desde, hasta, log, apuntarDiag);
        S.rfx = r.filas; S.sel.clear(); S.res = [];
        S.filtro = { op: '', srv: '', txt: '', sel: '' };
        try { $('qFTxt').value = ''; } catch (e) {}

        let go = 0, stop = 0, wait = 0;
        for (const f of S.rfx) {
          f.regla = decidir(f);
          if (f.regla.d === 'go') { S.sel.add(f.num); go++; }
          else if (f.regla.d === 'stop') stop++;
          else wait++;
        }
        log(`✓ ${S.rfx.length} RFx · reglas: ${go} preseleccionadas, ${stop} vetadas, ${wait} a revisar`, r.completo ? 'o' : 'w');
        if (!r.completo) {
          log('⚠ La lista está INCOMPLETA. No aceptes con esto sin repetir la búsqueda:', 'e');
          for (const a of r.avisos) log('   · ' + a, 'e');
        }
        if (go) log('Ahora acota por operador o servicio si quieres, y revisa antes de aceptar.', 'w');
        repintar();
        sincronizarBotones();
      } catch (e) {
        apuntarDiag('fallo en la búsqueda', M.diagnostico());
        log('✗ ' + e.message, 'e');
        log('  Pulsa «Registro» para descargar el diagnóstico.', 'w');
        $('qLog').disabled = false;
      } finally {
        S.buscando = false;
        sincronizarBotones();
      }
    };

    $('qPegar').onclick = () => abrirPegarLista();

    // El único sitio donde «elegir» toca la selección, y porque lo pides tú a mano.
    // Respeta la regla: no marca vetadas ni las que están a revisar.
    $('qSoloVisible').onclick = () => {
      const aLaVista = visibles();
      const marcables = aLaVista.filter(r => (r.regla || {}).d === 'go');
      const antes = S.sel.size;
      S.sel = new Set(marcables.map(r => r.num));
      log(`Marcadas ${S.sel.size} de las ${aLaVista.length} que estás viendo `
        + `(antes había ${antes} marcadas en total). Las vetadas y las de revisar no se marcan solas.`, 'w');
      repintar();
    };

    $('qFTxt').oninput = () => { S.filtro.txt = $('qFTxt').value; repintar(); };
    $('qFLimpiar').onclick = () => {
      S.filtro = { op: '', srv: '', txt: '', sel: '' };
      $('qFTxt').value = '';
      repintar();
    };

    // La caja de aportaciones está ARRIBA del listado y dentro del mismo contenedor que
    // hace scroll. Si estabas a media tabla, se abría fuera de la vista y parecía que el
    // botón no hacía nada. Al abrirla se sube; al cerrarla NO se toca el scroll, para no
    // perderte la fila que estabas mirando.
    $('qCand').onclick = () => {
      const caja = $('qCandBox');
      caja.classList.toggle('oculto');
      pintarCandidatas();
      if (caja.classList.contains('oculto')) return;
      const wrap = caja.parentElement;
      try { wrap.scrollTo({ top: 0, behavior: 'smooth' }); }
      catch (e) { wrap.scrollTop = 0; }
    };

    $('qNone').onclick = () => { S.sel.clear(); repintar(); };
    $('qSim').onclick = () => ejecutar(true);
    // La confirmación desglosa por operador y canta las que el filtro está escondiendo.
    // Sin esto, filtrar por Orange y pulsar Aceptar parecería aceptar solo Orange,
    // cuando en realidad se acepta todo lo marcado, se vea o no.
    $('qRun').onclick = () => {
      const sel = [...S.sel].map(n => S.rfx.find(r => r.num === n)).filter(Boolean);
      const porOp = {};
      for (const r of sel) { const o = operadorDe(r.ref); porOp[o] = (porOp[o] || 0) + 1; }
      const desglose = Object.entries(porOp)
        .map(([o, n]) => `  · ${(OPERADORES[o] || OPERADORES['?'])[0]}: ${n}`).join('\n');
      const ocultas = ocultasMarcadas();

      let msg = `Se van a ACEPTAR ${S.sel.size} RFx.\n\n${desglose}\n`;
      if (ocultas.length)
        msg += `\n⚠ OJO: ${ocultas.length} de ellas NO están a la vista ahora mismo, `
             + `porque tienes un filtro puesto. Se aceptarán igual.\n`;
      msg += `\nEsto no se puede deshacer.\n\n¿Continuar?`;

      if (V.confirm(msg)) ejecutar(false);
    };
    $('qStop').onclick = () => { S.abortar = true; log('Abortando…', 'w'); };

    $('qVer').onclick = async () => {
      const lista = S.res.length ? S.res.map(r => r.num) : [...S.sel];
      if (!lista.length) return log('Nada que verificar.', 'w');
      S.buscando = true;
      sincronizarBotones();
      reiniciarLog('▶ VERIFICANDO contra el sistema');
      try {
        await M.iniciar(log);
        const siguenPendientes = new Set();
        let n = 0, desdeRefresco = 0;
        log(`Comprobando ${lista.length} RFx contra Open Requests…`);
        for (const num of lista) {
          n++; barra(n, lista.length);
          if (desdeRefresco >= RFX_POR_REFRESCO_VER) {
            log(`↻ Refrescando el motor… (${n}/${lista.length})`, 'w');
            try { await M.iniciar(null); desdeRefresco = 0; await dormir(800); } catch (e) {}
          }
          await M.volverALista(null, true);
          if (S.rango) await M.fijarFechas(S.rango.desde, S.rango.hasta, null);
          await M.filtrarPorNumero(num);
          if (M.extraerPagina().some(f => f.num === num)) siguenPendientes.add(num);
          if (n % 10 === 0 || n === lista.length)
            log(`  verificadas ${n}/${lista.length} · ${siguenPendientes.size} siguen pendientes`);
          desdeRefresco++; await dormir(400);
        }
        let confirmadas = 0; const fallidas = [];
        for (const num of lista) {
          const r = S.res.find(x => x.num === num);
          if (siguenPendientes.has(num)) {
            fallidas.push(num);
            if (r) { r.estado = 'NO ACEPTADA'; r.motivo = 'sigue en Open Requests'; }
          } else {
            confirmadas++;
            if (r) { r.estado = 'OK'; r.motivo = 'ya no está pendiente'; }
          }
        }
        repintar();
        log(`✓ Confirmadas: ${confirmadas}`, 'o');
        if (fallidas.length) {
          log(`✗ Siguen pendientes: ${fallidas.length} → ${fallidas.join(', ')}`, 'e');
          S.sel = new Set(fallidas); repintar();
          log('Quedan marcadas para reintentar.', 'w');
        }
      } catch (e) {
        apuntarDiag('fallo al verificar', M.diagnostico());
        log('✗ ' + e.message, 'e');
      } finally {
        S.buscando = false;
        sincronizarBotones();
      }
    };

    // Registro en texto plano: se lee en cualquier sitio y no hay Excel de por medio
    // que convierta los números de RFx a notación científica.
    $('qLog').onclick = () => {
      const L = [];
      L.push(`AAT · Gestionar RFx · registro v${VERSION}`);
      L.push(`Generado: ${new Date().toISOString()}`);
      L.push(`Rango: ${S.rango ? S.rango.desde + ' → ' + S.rango.hasta : '(sin búsqueda)'}`);
      L.push(`RFx en pantalla: ${S.rfx.length} · seleccionadas: ${S.sel.size}`);
      L.push('');
      L.push('── RESULTADOS ─────────────────────────────────────────');
      if (!S.res.length) L.push('(sin resultados todavía)');
      for (const r of S.res) {
        const f = S.rfx.find(x => x.num === r.num) || {};
        L.push(`${r.num}  ${(f.proyecto || '—').padEnd(10)} ${String(r.estado).padEnd(12)} ${r.motivo || ''}${r.ms ? ' (' + (r.ms / 1000).toFixed(1) + 's)' : ''}`);
      }
      L.push('');
      L.push('── DIAGNÓSTICO ────────────────────────────────────────');
      if (!S.diag.length) L.push('(sin incidencias registradas)');
      for (const d of S.diag) {
        L.push(`· ${d.donde}`);
        for (const [k, v] of Object.entries(d)) if (k !== 'donde') L.push(`    ${k}: ${v}`);
      }
      descargar(L.join('\r\n'), `registro_rfx_${hoy()}.txt`, D);
      log('Registro descargado.');
    };

    return { D, panel, fondo, estilo, pintar, escribir, limpiar, log, enVentana, avisoRetirada };
  }

  // ═══ ARRANQUE ═════════════════════════════════════════════════════════════════════
  let ventana = null;

  const panelVivo = () => {
    try { return !!(ui && ui.D && ui.D.body && ui.D.body.contains(ui.panel)); }
    catch (e) { return false; }
  };

  // Ventana propia, para sacarla al segundo monitor y dejar el portal libre.
  //
  // La v16 la abría en blanco y la dibujaba desde la pestaña. Error: el panel estaba
  // en la ventana pero el cerebro seguía en la pestaña, así que en cuanto el usuario
  // navegaba por el portal la ventana se quedaba hueca. Ahora la ventana se abre en la
  // PROPIA página de Open Requests con la marca #aat-panel: Tampermonkey inyecta el
  // script también ahí, y esa ventana pasa a tener su motor, su estado y su vida.
  // A partir de ese momento la pestaña de origen es irrelevante: se puede navegar,
  // recargar o cerrar sin que la ventana se entere.
  function abrirVentana() {
    let v = null;
    try {
      // Con url vacía NO se navega: si la ventana ya existe, la devuelve tal cual.
      v = window.open('', 'AAT_RFX_PANEL',
        'popup=yes,width=1280,height=920,left=60,top=40,resizable=yes,scrollbars=yes');
    } catch (e) { return null; }
    if (!v || v.closed) return null;
    // Si la ventana ya está montada no se renavega: perderíamos lo que hubiera dentro.
    let montada = false;
    try { montada = !!v.__AAT_PANEL_LISTO; } catch (e) { montada = false; }
    if (!montada) {
      try { v.location.replace(LISTA + '#aat-panel'); }
      catch (e) { return null; }
    }
    return v;
  }

  // Repone lo que ya había: registro, tabla y rango. Así cerrar la ventana por error
  // en mitad de una tanda no pierde nada — el motor sigue en la pestaña del portal.
  function restaurar() {
    if (!ui) return;
    try {
      if (S.lineas.length)
        ui.limpiar(S.lineas.map(l => `<span class="${l.clase}">${l.txt}</span>`).join('\n'));
      if (S.rango) {
        ui.panel.querySelector('#qD').value = S.rango.desde;
        ui.panel.querySelector('#qH').value = S.rango.hasta;
      }
      ui.panel.querySelector('#qFTxt').value = S.filtro.txt || '';
      if (S.rfx.length) ui.pintar();
      sincronizarBotones();
    } catch (e) {}
  }

  function abrir() {
    // Modo panel: este documento YA es la ventana. Nada que abrir.
    if (MODO_PANEL) {
      if (!panelVivo()) { ui = construir(document, true); restaurar(); }
      return;
    }
    // Panel dentro de la página (solo si el navegador bloqueó la ventana).
    if (panelVivo() && ui && !ui.enVentana) {
      ui.panel.style.display = ''; if (ui.fondo) ui.fondo.style.display = '';
      return;
    }

    const v = abrirVentana();
    if (v) { ventana = v; try { v.focus(); } catch (e) {} return; }

    ventana = null;
    ui = construir(document, false);
    restaurar();
    emitir('El navegador ha bloqueado la ventana aparte, así que abro el panel aquí dentro. Para permitirla: icono de la barra de direcciones → «Permitir ventanas emergentes».', 'w');
  }

  function lanzador() {
    if (document.getElementById('aatRfxLauncher')) return;
    const b = document.createElement('button');
    b.id = 'aatRfxLauncher';
    b.type = 'button';
    b.title = 'Abrir el panel de gestión de RFx de AAT';
    b.innerHTML =
      '<img src="' + LOGO_AAT + '" alt="AAT" ' +
      'style="height:20px;width:auto;display:block;flex:0 0 auto" ' +
      'onerror="this.style.display=\'none\'">' +
      '<span style="width:1px;height:18px;background:rgba(255,255,255,.35);flex:0 0 auto"></span>' +
      '<span>Gestionar RFx</span>';
    b.style.cssText = 'position:fixed;right:20px;bottom:20px;z-index:2147483645;' +
      'display:flex;align-items:center;gap:10px;padding:10px 18px 10px 14px;' +
      'background:#003A5C;color:#fff;border:0;border-radius:26px;cursor:pointer;' +
      'font:600 15px/1 system-ui,-apple-system,Segoe UI,sans-serif;letter-spacing:.2px;' +
      'box-shadow:0 6px 18px rgba(0,58,92,.35);transition:transform .15s,box-shadow .15s';
    b.onmouseenter = () => {
      b.style.transform = 'translateY(-2px)';
      b.style.boxShadow = '0 10px 24px rgba(0,58,92,.45)';
    };
    b.onmouseleave = () => {
      b.style.transform = '';
      b.style.boxShadow = '0 6px 18px rgba(0,58,92,.35)';
    };
    b.onclick = abrir;
    document.body.appendChild(b);
  }

  // En modo panel se ocultan los restos de la página del portal que hay debajo.
  // No se borran: el motor no los usa, pero destruir el DOM de OutSystems por gusto
  // es pedir problemas.
  function taparPortal() {
    for (const el of [...document.body.children]) {
      if (el.classList && (el.classList.contains('axp') || el.id === 'aatRfxLauncher')) continue;
      if (el.tagName === 'IFRAME' && el.dataset && el.dataset.aatRfx) continue;
      try { el.style.display = 'none'; } catch (e) {}
    }
    document.title = 'Gestionar RFx · AAT';
  }

  // Rellena el filtro «Request Number» de ESTA página y busca. No abre la ficha:
  // eso son postbacks y prefiero no meter la mano ahí desde aquí.
  async function irARequest(num) {
    const aviso = document.createElement('div');
    aviso.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:2147483645;padding:10px 16px;' +
      'background:#003A5C;color:#fff;font:600 15px/1.3 system-ui,Segoe UI,sans-serif;box-shadow:0 2px 8px rgba(0,0,0,.25)';
    aviso.textContent = `Buscando la request ${num}…`;
    document.body.appendChild(aviso);
    const quitar = txt => { aviso.textContent = txt; setTimeout(() => aviso.remove(), 4000); };

    const campoNumero = () => {
      const todos = [...document.querySelectorAll('input[id$="wtRequestNumber"]')];
      return todos.find(i => i.offsetParent !== null && i.offsetWidth > 0) || todos[0] || null;
    };
    const listo = () => !!document.querySelector('input[id$="wtbtnSearch"]') && !!campoNumero();

    const limite = Date.now() + 30000;
    while (Date.now() < limite && !listo()) await dormir(300);
    if (!listo()) return quitar('No he podido preparar la búsqueda de ' + num + '.');

    try {
      const campo = campoNumero();
      Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(campo, num);
      for (const ev of ['input', 'change', 'blur']) campo.dispatchEvent(new Event(ev, { bubbles: true }));
      await dormir(400);
      document.querySelector('input[id$="wtbtnSearch"]').click();
      quitar(`Request ${num} buscada. Pulsa su número en la lista para abrir la ficha.`);
    } catch (e) {
      quitar('No he podido buscar ' + num + ': ' + e.message);
    }
    try { history.replaceState(null, '', location.pathname + location.search); } catch (e) {}
  }

  function arrancar() {
    cargarCandidatas();
    const huerfanas = apartarHuerfanas();
    if (IR_A && !MODO_PANEL) { lanzador(); irARequest(IR_A); return; }
    if (MODO_PANEL) {
      taparPortal();
      abrir();
      if (huerfanas.length) {
        emitir(`⚠ ${huerfanas.length} clasificación(es) tuya(s) han quedado apartadas: ${huerfanas.join(', ')}.`, 'w');
        emitir('  Las hiciste cuando el panel clasificaba por importe, y ahora sabemos que ese', 'w');
        emitir('  importe tiene más de una composición. Vuelve a clasificarlas sobre la RFx concreta', 'w');
        emitir('  que miraste. Las tienes guardadas en «Aportaciones» por si quieres consultarlas.', 'w');
      }
      // Con una tanda viva, que el navegador pregunte antes de cerrar o navegar.
      // Hasta ahora se podía tirar una tanda de 300 aceptaciones sin un solo aviso.
      window.addEventListener('beforeunload', e => {
        if (S.corriendo || S.buscando) { e.preventDefault(); e.returnValue = ''; return ''; }
      });
    } else {
      lanzador();
    }
  }

  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', arrancar);
  else arrancar();

  // Se exponen también las funciones puras: sirven para depurar desde la consola
  // sin tener que abrir el panel (p. ej. __AAT_RFX.decidir({ref,valor})).
  window.__AAT_RFX = { abrir, M, S, VERSION, MODO_PANEL, decidir, aviso: (...a) => ui && ui.avisoRetirada(...a), parsearLista, pasaFiltro, visibles, servicioDe, REGLAS, proyectoDe, importeDe, operadorDe,
                       get ui() { return ui; }, get ventana() { return ventana; } };
})();
