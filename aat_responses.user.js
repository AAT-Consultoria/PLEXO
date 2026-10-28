// ==UserScript==
// @updateURL    https://raw.githubusercontent.com/AAT-Consultoria/PLEXO/main/aat_responses.user.js
// @downloadURL  https://raw.githubusercontent.com/AAT-Consultoria/PLEXO/main/aat_responses.user.js
// @name         AAT · Listar respuestas (Connected Supplier)
// @namespace    https://aatconsultoria.com/
// @version      1.11.0
// @description  Saca a CSV todas las Submitted Responses de un periodo, con su RFx, su PO y su importe, leyéndolas del propio portal. No hace falta el Power BI.
// @author       AAT CONSULTORIA DE PROYECTOS SL
// @match        https://appcodeplatform.ericsson.net/ConnectedSupplier*
// @match        https://aat-consultoria.github.io/PLEXO/*
// @grant        none
// @run-at       document-idle
// @noframes
// ==/UserScript==
//
// Esta herramienta SOLO LEE. No pulsa Accept, no acepta nada, no cambia nada en el
// portal. Busca, pagina y copia lo que ve.
//
// De dónde saca cada dato, que es lo que costó averiguar:
//   · «Submitted Responses» tiene la FECHA DE CREACIÓN y el CM Scope ID, pero NO trae
//     ni el número de RFx ni el de PO.
//   · «Request, Response and PO» (búsqueda avanzada, con Document type = Response) sí
//     trae RFx, Response y PO juntos, pero NO trae la fecha.
// Así que recorre las dos y las cruza por el número de Response. Ninguna de las dos
// sola da lo que hace falta.
//
// 1.3.0 · El filtro «Document number», medido campo a campo en el portal:
//   · Vacío es un <input> de texto (maxlength 550) y admite los números por comas.
//     En cuanto tiene algo, el portal lo cambia por un widget de fichas cuyo valor real
//     es un JSON con maxlength 255. Cada número ocupa 13 caracteres ahí, así que a
//     partir de 19 el JSON se corta a medias y contesta «invalid value». De 15 en 15.
//   · Ese widget ya no se puede escribir. Antes eso tiraba el lote entero; ahora se
//     vuelve a pulsar «Reset Filters» hasta que el campo es normal otra vez.
//   · El filtro de números SOLO se aplica si «Document type» está puesto. Sin él el
//     portal devuelve el catálogo completo —4.486 registros— sin avisar de nada. Ahora
//     se comprueba: si vienen más filas que números pedidos, la búsqueda no vale.
//   · El aviso de error del portal no repinta la rejilla, así que el script esperaba
//     una tabla que no iba a llegar. Ahora lo lee, corta al momento y dice el motivo.
//   · Si un lote se cae, se parte en dos y el tamaño baja para el resto de la pasada.
//
// 1.11.0 · Se juzga el RESULTADO, no los filtros. El 28-oct la pasada 2 volvió a salir
//   sin fechas y trajo 1.858 filas donde la pasada 1 había encontrado 102, paginando
//   hasta la página 118. La guardia de 1.5.1 no podía cazarlo: compara un tramo con el
//   tramo del que sale, y con un rango de UN DÍA no hay partición posible, así que
//   nunca hay con qué comparar — y un día es justo lo que más se pide.
//   Ahora la búsqueda entra DENTRO del bucle de preparación y se mira lo que devuelve:
//   si no cabe en el rango pedido, se rehace la preparación entera, hasta tres veces.
//   Comprobar los filtros en pantalla nunca bastó —el DOM estaba impecable mientras el
//   servidor buscaba sin fechas—; lo único que no se puede falsear es el resultado.
//
// 1.10.1 · Dos arreglos tras medir la 1.10.0:
//   · El paralelismo NO sirve: 45 fichas tardan 417 s de una en una y 397 s de tres en
//     tres. El portal atiende la sesión en fila, así que tres iframes solo hacen cola.
//     Queda en 1, con el reparto montado por si algún día cambia.
//   · REGRESIÓN MÍA de la 1.9.2: puse «sin respuesta» delante de todo y se tragó el
//     servicio de las filas sin respuesta que el recetario SÍ conocía. Pasó de 11 a 31,
//     comiéndose PIM y Diseño enteros. Ahora solo cambia la etiqueta cuando además no
//     se sabe el servicio.
//
// 1.10.0 · La pasada 4 eran 417 de los 562 s de la pasada entera: 9 s por ficha. Dos
//   causas, y la primera no la vi hasta leer el código con calma:
//   · La espera de la ficha usaba `esperar()`, que observa SIEMPRE el iframe del motor
//     de búsqueda. Para una ficha eso no sirve de nada: se quedaba apoyada solo en el
//     sondeo cada 250 ms, y Chrome frena los temporizadores de las pestañas ocultas —la
//     trampa más vieja de este proyecto, y caí otra vez—. Ahora observa el documento de
//     la ficha y vuelve en cuanto aparece la tabla.
//   · Y se leen TRES a la vez. Son páginas de solo lectura: no tocan filtros ni el
//     estado del buscador, que es lo único delicado de esta sesión.
//
// 1.9.2 · Dos cosas vistas en la pasada del 27-oct (120 respuestas, 44 de 45 fichas
//   resueltas):
//   · De los 12 que quedaban «sin servicio», ONCE eran RFx sin respuesta todavía:
//     salen por la búsqueda avanzada y no hay ficha que mirar. Ahora dicen «sin
//     respuesta», que es la verdad, en vez de «Pendiente», que insinúa que fallamos.
//   · La ficha que no llegó a tiempo se reintenta una vez. Era un tropiezo suelto del
//     portal, no un problema de esa respuesta.
//
// 1.9.1 · El extractor del código cogía la barra equivocada. En «GNA2024359/19000 /
//   INGNOCAT-SER …» hay dos: la primera va pegada, dentro de la referencia de Ericsson;
//   la que separa el código lleva espacios. Cogía «19000», que no existe en el
//   preciario, así que la pasada 4 abría las 45 fichas para decir 45 veces «sigue sin
//   identificar». Al menos no se inventó un servicio: eso funcionó como debía.
//
// 1.9.0 · PASADA 4: los que el recetario no sabe, leídos de su ficha.
//   El 27-oct, el 40% de las respuestas de un día salía «Pendiente», TODAS de
//   Telefónica. Probé a resolver los importes contra el preciario y el resultado
//   desaconsejó ese camino: de 12 importes, 7 tenían combinación única, uno tenía 133,
//   y el más repetido —999,00 €, once veces— devolvía «EMR/PIM» cuando la ficha dice
//   INGNOCAT-SER, «ítem no catalogado para ING», o sea Diseño. Un precio pactado a mano
//   no se puede interpretar: el importe no significa nada y adivinarlo es acertar por
//   casualidad o equivocarse con confianza.
//   Así que para esos se lee la ficha, que trae el CÓDIGO del ítem, que es el dato de
//   verdad. Solo la de los pendientes —pocos— y con un iframe aparte, sin tocar el
//   motor de búsqueda ni sus filtros. De regalo salen el subtipo (PSC/PTT) y el
//   desglose, que antes no teníamos.
//   El enlace a la ficha se guarda al pasar por la fila: ahí es gratis, y después
//   costaría volver a buscar la respuesta por número solo para encontrarlo.
//
// 1.8.0 · Cabecera más limpia: Hoy / 1 semana / 2 semanas / «Rango de fechas…», que
//   abre un cuadrito con los dos campos. Las semanas 3 y 4 se van: para eso está el
//   rango a medida, y además son pasadas largas que conviene pensar un segundo.
//   OJO a quien lo toque: esconder los campos NO puede esconder el rango. El rótulo
//   «26 oct → 27 oct · 2 días» va siempre a la vista y en color cuando se pasa, porque
//   es lo único que queda entre el gestor y arrancar un mes sin enterarse — que es
//   exactamente lo que pasó el 27-oct. Los campos rD/rH siguen en el DOM, ocultos: el
//   motor los lee tal cual y así este cambio no toca nada de la lógica de la pasada.
//
// 1.7.1 · Más margen para que el servidor registre el Document type. Con 2.500 ms iban
//   bien todos los tramos menos EL PRIMERO —el que abre la pantalla en frío—, que
//   seguía buscando sin fechas y forzaba una partición inútil. 4.000 ms y a correr.
//
// 1.7.0 · LA CAUSA, por fin, y medida. Poner «Document type = Response» cambia el
//   rótulo al instante, pero el postback que lo fija en el SERVIDOR llega después. El
//   script escribía las fechas en ese hueco: el servidor se quedaba sin ellas y buscaba
//   las 2.750 Responses del histórico, mientras la pantalla enseñaba tan contenta las
//   fechas que habíamos puesto. Por eso ninguna comprobación lo cazaba — el DOM estaba
//   impecable; el que no se había enterado era el servidor.
//   Medido el 27-oct con los mismos pasos y el mismo iframe: dejando asentar el
//   postback, 40 registros; sin dejarlo, 2.750. Esperar a que el DOM calle no basta,
//   porque calla antes de que el servidor tome nota.
//
// 1.6.2 · Dos cosas que salieron al probar la 1.6.1 de punta a punta (124 respuestas,
//   187 s: pasada 1 32 s, pasada 2 39 s, pasada 3 116 s).
//   · Los lotes del rescate vuelven a 15. En la 1.4.0 los subí a 19 calculando sobre el
//     maxlength del JSON; el portal los rechaza. Gana el portal, no la aritmética. Eso
//     se llevaba una búsqueda tirada y una partición en cada lote, en la pasada que más
//     tiempo consume con diferencia.
//   · La PRIMERA búsqueda de la pasada 2 salía sin fechas —2.750 registros— porque
//     entre la comprobación y el clic aterrizaba un postback pendiente que las borraba.
//     Ahora se miran otra vez justo antes de pulsar, y si se han caído se reponen.
//
// 1.6.1 · La comprobación de fechas que añadí en 1.6.0 era demasiado estricta para la
//   pasada 3: ahí mandan los números y la fecha va abierta a propósito, pero escribir
//   los números dispara un postback que se lleva las fechas. La pasada 3 se quedaba
//   repitiendo «no consigo dejar los filtros puestos» por algo que daba igual. Ahora
//   las fechas solo se exigen cuando son el filtro de verdad, es decir, sin números.
//
// 1.6.0 · LA CAUSA DEL 2.742, y era mía. En la 1.3.2 añadí un arreglo para recolocar
//   el «Document type» cuando las fechas se lo llevaban por delante. Pero recolocar el
//   tipo dispara OTRO postback, y ése se lleva LAS FECHAS — y detrás no las volvía a
//   poner. Resultado: se buscaba SIN fechas, o sea las 2.742 Responses del histórico,
//   creyendo que se pedía un día. El log lo cantaba desde el principio: «Document type
//   = Response» dos veces seguidas antes de cada tramo.
//   Comprobado en el portal: con Document type = Response y 26→27 de octubre la
//   pantalla devuelve 32 registros, no 2.742. El portal filtraba bien; el que no ponía
//   las fechas era el script.
//   Dos arreglos: si se recoloca el tipo, las fechas se vuelven a poner; y la
//   comprobación previa a buscar ahora mira TAMBIÉN las fechas. Estaban fuera de esa
//   lista, y por eso el fallo pasó inadvertido: el tipo estaba bien, los números no
//   hacían falta, y nadie miraba las fechas.
//   La guardia de la 1.5.1 tampoco saltaba: pedía dos particiones y con dos días solo
//   cabe una. Ahora basta con que un tramo más corto devuelva lo mismo que el anterior.
//
// 1.5.1 · Guardia del filtro de fechas. El 27-oct la búsqueda avanzada del portal dejó
//   de aplicar las fechas: devolvía los mismos 2.742 registros para el mes, la semana y
//   un día suelto. El script se fió de ese número —que era el de la búsqueda anterior,
//   no el de la suya— y se puso a paginar 183 páginas hasta que el portal cortó con un
//   401. Ahora, si tras partir el rango dos veces el total no se ha movido ni un
//   registro y sigue siendo grande, se corta y se dice por qué. El fallo era del portal;
//   lo nuestro era creernos un contador que no se había actualizado.
//
// 1.5.0 · Atajos de rango y red contra el error de dedo.
//   Un gestor quiso pedir UN día —del 26 al 27 de octubre— y tecleó 26 de SEPTIEMBRE.
//   Un mes son ~6.000 filas y media hora de portal, y nada en la pantalla lo avisaba.
//   Tres cosas, por orden de utilidad:
//     · El panel venía con 30 días puestos de fábrica. Ahora vienen 7.
//     · Botones Hoy / 1 / 2 / 3 / 4 semanas: lo normal se pide sin teclear nada.
//     · Contador de días al lado de las fechas, en ámbar pasando de 14 y en rojo
//       pasando de 31, y aviso con estimación antes de arrancar si el rango es largo.
//   Los botones solos no habrían evitado aquel fallo —se puede teclear mal igual—,
//   por eso están también el contador y el aviso.
//
// 1.4.0 · Columna SERVICIO y afinado de tiempos.
//   · El servicio (PIM / EMR / Diseño) sale del recetario, que vive en «Gestionar RFx».
//     Se consulta en caliente por window.__AAT_RFX en vez de copiar las tablas aquí:
//     el recetario lo mantiene una sola persona, y duplicarlo es la manera segura de
//     que algún día las dos copias digan cosas distintas. Sin ese script, la columna
//     va vacía y se avisa una vez; lo demás funciona igual.
//   · Medido en el portal el 26-oct: las dos pantallas YA se leen enteras. Submitted
//     Responses tiene 6 columnas y Request/Response/PO tiene 9 (solo nos dejamos
//     «Supplier», que siempre dice AAT). Cualquier dato más —deadline, desglose— está
//     en la ficha de cada respuesta: una página por fila, inviable para la lista.
//   · Tiempos: trocear de más sale caro (un tramo nuevo son ~12 s de arranque; pasar
//     de página, 1-2 s), así que MAX_POR_TRAMO sube de 150 a 225. Los lotes del
//     rescate pasan de 15 a 19, que es el techo real medido. Pausas más cortas.
//   · El registro dice ahora cuánto tardó cada pasada, para no volver a afinar a ojo.
//
// 1.3.1 · El portal lo dijo él solito: «invalid for search by document type 'Request'».
//   El «Reset Filters» devuelve el Document type a «Request», y en 1.3.0 se reseteaba
//   para recuperar el campo de números —perdiendo el tipo por el camino—. Sin tipo, el
//   portal ignora los números y devuelve el catálogo entero. Ahora preparar los filtros
//   es una sola operación verificada: reset → tipo → fechas → esperar a que la barra
//   deje de repintarse → números (los últimos, que son los que se pierden) → comprobar
//   que tipo y números siguen puestos. Si algo no cuadra, se repite entera.
//
// 1.3.2 · Las fechas también tiran el Document type. Antes eso obligaba a repetir la
//   secuencia completa —un reset y una búsqueda de más cada vez—; ahora se recoloca el
//   tipo en el sitio y se sigue. La repetición entera queda como último recurso.

(() => {
  'use strict';

  const VERSION = '1.11.0';

  // Fuera del portal, este script no hace NADA salvo decir que existe.
  // Lo usa la pagina de instalacion para comprobar DE VERDAD que esta puesto,
  // en lugar de fiarse de que el usuario haya seguido bien los pasos.
  // Va lo primero a proposito: asi no se crea el boton flotante ni se toca nada.
  if (location.hostname !== 'appcodeplatform.ericsson.net') {
    document.documentElement.setAttribute('data-aat-resp', VERSION);
    return;
  }
  const LOGO_AAT = 'https://aatconsultoria.com/wp-content/uploads/2021/07/AAT_Logo_White.png';

  const ESPERA_CARGA  = 45000;
  const ESPERA_BUSCAR = 60000;
  const ESPERA_PAGINA = 45000;
  const PAUSA_PAGINA  = 250;      // antes 400. Con ~50 saltos por pasada, son segundos.
  // MEDIDO: cada tramo nuevo cuesta un arranque completo —iframe, reset, tipo, fechas,
  // búsqueda— del orden de 12 s, mientras que pasar de página son 1-2 s. Así que
  // trocear de más sale CARO. Con 150 (10 páginas), un rango de una semana —354
  // respuestas el 26-oct— se partía en cuatro tramos; con 225 se queda en dos.
  // El tope no es el portal: paginar aguanta de sobra, eso quedó comprobado en
  // «Gestionar RFx», donde el atasco de la página 13 resultó ser un fallo nuestro.
  const MAX_POR_TRAMO = 225;      // 15 páginas de 15
  const MAX_PROF      = 7;
  // Tope de cordura, no una previsión: ~105 respuestas/día medidas el 27-oct, con
  // margen de sobra. Solo sirve para detectar que una búsqueda salió SIN filtro.
  const RESP_POR_DIA_TOPE = 400;

  const dormir = ms => new Promise(r => setTimeout(r, ms));

  // Chrome frena los temporizadores de las pestañas ocultas (medido: 200 ms servidos a
  // 1.000). Sondear a ciegas no vale. Se escucha el DOM, que no está sujeto a ese freno.
  function esperar(cond, ms = ESPERA_CARGA) {
    return new Promise(resolve => {
      const limite = Date.now() + ms;
      let hecho = false, obs = null, iv = null, to = null, visto = null;
      const fin = v => {
        if (hecho) return;
        hecho = true;
        try { obs && obs.disconnect(); } catch (e) {}
        clearInterval(iv); clearTimeout(to); resolve(v);
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
          if (!d || !d.body || d === visto) return;
          try { obs && obs.disconnect(); } catch (e) {}
          obs = new ((M.win && M.win.MutationObserver) || window.MutationObserver)(probar);
          obs.observe(d.body, { childList: true, subtree: true, characterData: true });
          visto = d;
        } catch (e) {}
      };
      observar();
      iv = setInterval(() => { observar(); probar(); }, 250);
      to = setTimeout(() => fin(null), ms + 2000);
      probar();
    });
  }

  const iso = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  const hoy = () => iso(new Date());
  const haceDias = n => { const d = new Date(); d.setDate(d.getDate() - n); return iso(d); };
  const deIso = t => { const [a,m,d] = t.split('-').map(Number); return new Date(a, m-1, d); };
  const diasEntre = (a,b) => Math.round((deIso(b) - deIso(a)) / 86400000);
  const sumarDias = (t,n) => { const d = deIso(t); d.setDate(d.getDate()+n); return iso(d); };
  const mitad = (a,b) => sumarDias(a, Math.floor(diasEntre(a,b)/2));

  function operador(nombre) {
    const t = String(nombre || '').toUpperCase();
    if (t.startsWith('ORES') || t.startsWith('ORANES') || t.startsWith('XFE')) return 'Orange';
    if (t.startsWith('VODAES') || t.startsWith('VODA')) return 'Vodafone';
    if (/_P-\d/.test(t) || /^\d/.test(t)) return 'Telefónica';
    return '';
  }
  const proyecto = n => { const m = String(n||'').match(/(P-\d+)/i); return m ? m[1].toUpperCase() : ''; };

  // ── Qué es cada código de ítem ────────────────────────────────────────────────────
  // Sale de preciario_maestro.json, que es la lista de precios con su servicio y su
  // subtipo: la fuente autorizada, no algo aprendido. Se copia aquí porque es pequeña
  // y porque sin ella no se puede leer una ficha. Para regenerarla: mismo formato,
  // CODIGO=SERVICIO~SUBTIPO separados por «;».
  const ITEMS = (
    'DDEEPLAN-L-SER=DIS~Diseños Especiales;DDEEPLAN-M-SER=DIS~Diseños;' +
    'Especiales;DDEEPLAN-S-SER=DIS~Diseños Especiales;DDEEPLAN-XS-SER=DIS~Diseños;' +
    'Especiales;DDEEREP-L-SER=DIS~Diseños Especiales;DDEEREP-M-SER=DIS~Diseños;' +
    'Especiales;DDEEREP-S-SER=DIS~Diseños Especiales;DDEEREP-XS-SER=DIS~Diseños;' +
    'Especiales;DISADIC-01-SER=DIS~Propuesta solucion;DISORG-01-SER=DIS~Propuesta;' +
    'solucion;DISTEL-01-SER=DIS~Propuesta solucion;DISTEL-02-SER=DIS~Propuesta;' +
    'solucion;DISTVOD-01-SER=DIS~Propuesta;' +
    'solucion;ER_001=EMR~PTT;ER_001A=EMR~PTT;ER_001B=EMR~PTT;ER_002=EMR~PTT;ER_002A=EMR~PTT;ER_002B=EMR~PTT;ER_003=EMR~PTT;ER_003A=EMR~PTT;ER_003B=EMR~PTT;ER_004=EMR~PTT;ER_004A=EMR~PTT;ER_005=EMR~PTT;ER_005A=EMR~PTT;ER_006=EMR~PSC;ER_006A=EMR~PSC;ER_006B=EMR~PSC;ER_007=EMR~PSC;ER_007A=EMR~PSC;ER_007B=EMR~PSC;ER_009=EMR;ER_010=EMR;ER_011=EMR;ER_012=EMR;ER_012A=EMR;ER_013=EMR;ER_014=EMR;ER_015=EMR~PLL;ER_015A=EMR~PLL;ER_017=EMR;ER_018=EMR~PSC;ER_018A=EMR~PSC;ER_019=EMR;ER_019A=EMR;ER_020=EMR;ER_021=EMR;ER_022=EMR;ER_023=EMR;ER_024=EMR;ER_025=EMR;ER_026=EMR;INGCAL-02-SER=DIS~Viabilidad;' +
    'estructural;INGCFO-01-SER=DIS~Actividades para legalización;INGCVE-01-SER=DIS~Viabilidad;' +
    'estructural;INGCVE-02-SER=DIS~Viabilidad estructural;INGCVE-03-SER=DIS~Viabilidad;' +
    'estructural;INGDOC-01-SER=DIS~Otras actividades;INGLEG_01-SER=DIS~Actividades para;' +
    'legalización;INGMODPLAN-01-SER=DIS~Planos;INGNOCAT-SER=DIS~NOCAT;INGORG-01-SER=DIS~Otras;' +
    'actividades;INGORG-02-SER=DIS~Otras;' +
    'actividades;INGPLAN-01-SER=DIS~Planos;INGPLAN-02-SER=DIS~Planos;INGPLL-01-SER=DIS~Otras;' +
    'actividades;INGPRO-01-SER=DIS~Actividades para legalización;INGPRO-02-SER=DIS~Actividades;' +
    'para legalización;INGREV01-SER=DIS~Propuesta solucion;INGREV02-SER=DIS~Propuesta;' +
    'solucion;INGVOD-01-SER=DIS~Otras;' +
    'actividades;MED-FAILED_VISIT=PIM;MED-IE=PIM;MED-JOINT_VISIT=PIM;MED-PIM_ADDITIONAL_BANDS=PIM;MED-PIM_FIRST_BAND=PIM;MED-URGENCY=PIM;MOD-SOL-01-SER=DIS~Propuesta;' +
    'solucion;MODPLANDDEE-01-SER=DIS~Diseños;' +
    'Especiales;QB_RS01_PIM_NOCAT=PIM~NOCAT;RADREP01-SER=DIS~Replanteo;RADREP01A-SER=DIS~Replanteo;RADREP02-SER=DIS~Replanteo;RADREP03-SER=DIS~Replanteo;RADREP04-SER=DIS~Replanteo;RADREP05-SER=DIS~Replanteo;RADREPMI-SER=DIS~Replanteo;'
  ).split(';').reduce((m, par) => {
    const [cod, resto] = par.split('=');
    if (!cod) return m;
    const [s, st] = (resto || '').split('~');
    m[cod] = { s: s || '', st: st || '' };
    return m;
  }, {});

  // El servicio (PIM / EMR / Diseño) sale del recetario, que vive en «Gestionar RFx».
  // Se consulta EN CALIENTE a través de window.__AAT_RFX en vez de copiar aquí las
  // tablas: el recetario lo mantiene una sola persona y duplicarlo es la forma segura
  // de que un día las dos copias digan cosas distintas. Si ese script no está puesto,
  // la columna sale vacía y se avisa una vez; todo lo demás funciona igual.
  const NOMBRE_SRV = { PIM: 'PIM', EMR: 'EMR', DIS: 'Diseño' };

  // A partir de las líneas de la ficha. Esto NO adivina: lee el código de ítem, que es
  // el dato de verdad. Es lo que distingue este camino del recetario por importe, que
  // con 999,00 € proponía «EMR/PIM» cuando la ficha dice «ítem no catalogado» → Diseño.
  // Cuando conviven varios servicios en una misma respuesta manda el de mayor importe,
  // que es el que define para qué era el trabajo.
  function servicioDeLineas(lineas) {
    if (!lineas || !lineas.length) return { srv: '', firma: '' };
    const porSrv = {}, porSub = {};
    for (const l of lineas) {
      const it = ITEMS[l.cod];
      if (!it || !it.s) continue;
      porSrv[it.s] = (porSrv[it.s] || 0) + l.total;
      if (it.st) porSub[it.s + '|' + it.st] = (porSub[it.s + '|' + it.st] || 0) + l.total;
    }
    const srv = Object.entries(porSrv).sort((a, b) => b[1] - a[1])[0];
    if (!srv) return { srv: '', firma: firmaDe(lineas) };
    const sub = Object.entries(porSub).filter(([k]) => k.startsWith(srv[0] + '|'))
                       .sort((a, b) => b[1] - a[1])[0];
    const st = sub ? sub[0].split('|')[1] : '';
    const nombre = NOMBRE_SRV[srv[0]] || srv[0];
    // «NOCAT» es un precio pactado a mano, no un servicio distinto: se dice tal cual,
    // porque es justo el caso que el importe nunca va a poder explicar.
    return { srv: st === 'NOCAT' ? `${nombre} (no catalogado)` : (st ? `${nombre} (${st})` : nombre),
             firma: firmaDe(lineas) };
  }
  const firmaDe = ls => ls.map(l => `${l.cod}:${l.qty}`).sort().join('|');
  let avisadoSinRecetario = false;
  function servicioDe(nombre, importe, log) {
    const api = window.__AAT_RFX;
    if (!api || typeof api.servicioDe !== 'function') {
      if (!avisadoSinRecetario && log) {
        avisadoSinRecetario = true;
        log('Nota: el servicio sale del recetario de «Gestionar RFx» y ese script no está '
          + 'instalado o no ha cargado. La columna Servicio irá vacía.', 'w');
      }
      return '';
    }
    try {
      const srv = api.servicioDe({ ref: nombre, valor: importe });
      return srv ? (NOMBRE_SRV[srv] || srv) : 'Pendiente';
    } catch (e) { return ''; }
  }
  const limpiar  = s => String(s || '').replace(/\s+/g, ' ').trim();

  // ── Las dos pantallas del portal ──────────────────────────────────────────────────
  const PANTALLAS = {
    respuestas: {
      nombre: 'Submitted Responses',
      ruta: '/ConnectedSupplier_Requests/SubmittedResponses_List.aspx',
      tabla: 'table[id$="wtSubmittedResponseTable"]',
      fechas: d => [porEtiqueta(d, 'Creation Date From'), porEtiqueta(d, 'Creation Date To')],
      preparar: null,
      leer(tds, tr) {
        const [siteId, ...site] = limpiar(tds[0]).split(' ');
        const celda1 = limpiar(tds[1]).split(' ');
        const resp = celda1[0] || '';
        return {
          ficha: M.enlaceFicha(tr),
          response:  /^\d{6,}$/.test(resp) ? resp : '',
          respNombre: celda1.slice(1).join(' '),
          siteId, site: site.join(' '),
          estado: limpiar(tds[2]),
          creacion: limpiar(tds[3]),
          importe: limpiar(tds[4]),
          scope: limpiar(tds[5] || '')
        };
      }
    },
    avanzada: {
      nombre: 'Request, Response and PO',
      ruta: '/ConnectedSupplier_AdvancedSearch/AdvancedSearch.aspx',
      tabla: 'table[id$="wtAdvancedSearchTableRecord"]',
      // Por ETIQUETA, no por identificador. Los ids «wttxtCreatedFrom» que se ven a
      // veces no están siempre: OutSystems los genera distinto según cómo se llegue a
      // la página, y dentro del iframe salen vacíos. Anclarse a ellos fue el fallo que
      // dejaba la pasada 2 sin arrancar («la pantalla no cargó»).
      fechas: d => [porEtiqueta(d, 'Created from'), porEtiqueta(d, 'Created to')],
      campoNumeros: d => d.querySelector('input[id$="wttxtDocumentNumber"]'),
      comboNumeros: d => d.querySelector('input[id*="wtcboDocumentNumber"][id$="wtHiddenInput"]'),
      // Medido en el portal, campo a campo:
      //   · Vacío, el filtro es un <input> normal de texto (maxlength 550) y admite los
      //     números separados por comas.
      //   · En cuanto tiene algo, el portal lo sustituye por un widget de fichas cuyo
      //     valor real es un JSON —["8004…","8004…"]— con maxlength 255. Cada número
      //     ocupa 13 caracteres ahí dentro, así que a partir de 19 el JSON se corta a
      //     medias y el portal contesta «Property 'documentNumber' … has invalid value».
      // 15 deja margen de sobra incluso si arrastra alguno de la búsqueda anterior.
      // 15, y esta vez MEDIDO, no calculado. En la 1.4.0 lo subí a 19 razonando sobre el
      // maxlength 255 del JSON del widget: 19 × 13 + 1 = 248, cabe. Pues no. El 27-oct,
      // con 19 números, el portal contestó «Property 'documentNumber' at offset '274'
      // has invalid value». La aritmética decía que cabía y el portal dijo que no; gana
      // el portal. Con 15 lleva meses sin una queja.
      maxNumeros: 15,
      // El «Document type» no es un <select>: es un widget de OutSystems.
      async preparar(d, log) {
        const boton = d.querySelector('.current-options');
        if (!boton) throw new Error('no encuentro el selector de Document type');
        if (limpiar(boton.innerText) === 'Response') return true;
        boton.click();
        const item = await esperar(() =>
          [...d.querySelectorAll('.item')].filter(i => limpiar(i.innerText) === 'Response').pop(), 15000);
        if (!item) throw new Error('no encuentro la opción «Response» del desplegable');
        item.click();
        const ok = await esperar(() => limpiar(d.querySelector('.current-options').innerText) === 'Response', 15000);
        if (!ok) throw new Error('el desplegable no se quedó en «Response»');

        // Y AQUÍ hay que sentarse a esperar. El rótulo cambia a «Response» en cuanto se
        // pulsa —es cosa del navegador—, pero el postback que lo fija EN EL SERVIDOR
        // llega después. Si se escriben las fechas antes de que aterrice, el servidor se
        // queda sin ellas y busca el histórico completo, mientras la pantalla enseña
        // tranquilamente las fechas que pusimos. Es el fallo que nos costó tres días.
        // MEDIDO el 27-oct, mismos pasos y mismo iframe: dejando asentar el postback la
        // búsqueda devuelve 40 registros; sin dejarlo, 2.750. No basta con esperar a que
        // el DOM calle, porque calla antes de que el servidor haya tomado nota.
        // 1.7.1: con 2.500 ms iban bien todos los tramos MENOS el primero, que es el que
        // carga la pantalla en frío y tarda más en registrarse en el servidor. Lo barato
        // es darle margen de sobra: son un par de segundos por tramo, frente a una
        // búsqueda tirada y una partición inútil cada vez que se queda corto.
        await M.quieto(1200, 10000);
        await dormir(4000);
        log && log('  Document type = Response');
        return true;
      },
      // `tr` llega para poder quedarnos con el enlace a la ficha de la respuesta. Es
      // gratis aquí —ya estamos en la fila— y carísimo después: sin él habría que
      // volver a buscar la respuesta por número solo para encontrar su enlace.
      leer(tds, tr) {
        const [siteId, ...site] = limpiar(tds[0]).split(' ');
        return {
          ficha: M.enlaceFicha(tr),
          siteId, site: site.join(' '),
          reqNombre: limpiar(tds[1]),
          rfx:       limpiar(tds[2]),
          response:  limpiar(tds[3]),
          po:        limpiar(tds[4]),
          estado:    limpiar(tds[6]),
          importe:   limpiar(tds[7])
        };
      }
    }
  };

  function porEtiqueta(d, texto) {
    const et = [...d.querySelectorAll('div,label,span')]
      .filter(e => e.children.length === 0 && limpiar(e.innerText).toLowerCase() === texto.toLowerCase())[0];
    if (!et) return null;
    let p = et.parentElement;
    for (let i = 0; i < 5 && p; i++) {
      const inp = p.querySelector('input[placeholder="YYYY-MM-DD"]');
      if (inp) return inp;
      p = p.parentElement;
    }
    return null;
  }

  // Espera mirando el documento QUE TOCA. `esperar()` de arriba observa siempre el
  // iframe del MOTOR DE BÚSQUEDA, así que para una ficha se quedaba apoyada solo en el
  // sondeo cada 250 ms — y Chrome frena los temporizadores de las pestañas ocultas,
  // que es la trampa más vieja de este proyecto. Observando el documento de la ficha se
  // vuelve en cuanto aparece la tabla, sin depender del reloj.
  function esperarEn(d, w, cond, ms) {
    return new Promise(resolve => {
      let hecho = false, obs = null, iv = null, to = null;
      const fin = v => {
        if (hecho) return;
        hecho = true;
        try { obs && obs.disconnect(); } catch (e) {}
        clearInterval(iv); clearTimeout(to); resolve(v);
      };
      const probar = () => { if (hecho) return; let v; try { v = cond(); } catch (e) { v = false; } if (v) fin(v); };
      try {
        obs = new ((w && w.MutationObserver) || window.MutationObserver)(probar);
        if (d && d.body) obs.observe(d.body, { childList: true, subtree: true, characterData: true });
      } catch (e) {}
      iv = setInterval(probar, 300);
      to = setTimeout(() => fin(null), ms);
      probar();
    });
  }

  // ── Motor: un iframe oculto del propio portal ─────────────────────────────────────
  const M = {
    frame: null, ficheros: [], pantalla: null,
    get doc() { return M.frame?.contentDocument || null; },
    get win() { return M.frame?.contentWindow || null; },

    destruir() {
      document.querySelectorAll('iframe[data-aat-resp],iframe[data-aat-ficha]').forEach(f => f.remove());
      M.frame = null; M.ficheros = [];
    },

    tabla: () => M.pantalla ? M.doc?.querySelector(M.pantalla.tabla) : null,
    liPag: () => M.doc?.querySelector('li.ListNavigation_CurrentPageNumber'),
    pagActual() { const n = parseInt(limpiar(M.liPag()?.innerText || ''), 10); return Number.isFinite(n) ? n : null; },

    botonBuscar() {
      return [...M.doc.querySelectorAll('input,button')]
        .find(e => limpiar(e.value || e.innerText) === 'Search') || null;
    },

    // Esta herramienta no acepta nada, pero el portal tiene botones peligrosos
    // repartidos. Se niega a pulsar cualquiera de ellos, por si acaso.
    clic(el, quien) {
      const id = el.id || '';
      if (/wtbtnAccept$/.test(id) || /wtRejectButtonPopUp$/.test(id))
        throw new Error('BLOQUEADO: intento de pulsar Approve/Reject (' + quien + ')');
      el.click();
    },

    listo() {
      try {
        if (M.doc?.readyState !== 'complete') return false;
        if (!M.botonBuscar()) return false;
        const [a, b] = M.pantalla.fechas(M.doc);
        return !!(a && b);
      } catch (e) { return false; }
    },

    marcar() {
      const t = M.tabla(); if (!t) return false;
      let n = 0;
      for (const tr of t.querySelectorAll('tr')) { tr.dataset.aatM = '1'; n++; }
      return n > 0;
    },
    quedanMarcas() { const t = M.tabla(); return !!t && !!t.querySelector('tr[data-aat-m]'); },

    huella() {
      try {
        const t = M.tabla();
        const primera = t ? limpiar((t.querySelectorAll('tr')[1] || {}).innerText || '').slice(0, 40) : '';
        const rec = (M.doc.body.innerText.match(/[\d.,]+\s+records?/i) || [''])[0];
        return `${M.pagActual() ?? '-'}|${rec}|${primera}|${t ? t.querySelectorAll('tr').length : 0}`;
      } catch (e) { return 'error'; }
    },

    // El portal enseña sus errores en un aviso flotante y NO repinta la rejilla: sin
    // esto, el script se quedaba esperando hasta agotar el plazo sin saber por qué.
    errorDelPortal() {
      try {
        const nodo = [...M.doc.querySelectorAll('*')]
          .filter(e => e.children.length === 0 && /invalid value|^\s*Error:/i.test(e.innerText || ''))[0];
        if (nodo) return limpiar(nodo.innerText).slice(0, 160);
        // Este otro aviso viene con lista de números dentro, así que no cae en ningún
        // nodo hoja. Es el que nos delató el fallo: «invalid for search by document
        // type 'Request'» significa que el Document type se perdió por el camino.
        const txt = limpiar(M.doc.body.innerText || '');
        const m = txt.match(/[^.]{0,80}invalid for search by document type[^.]{0,40}/i);
        return m ? limpiar(m[0]).slice(0, 160) : null;
      } catch (e) { return null; }
    },

    // errPrevio: el aviso que YA estaba en pantalla antes de pulsar. El portal no lo
    // borra hasta el siguiente postback, así que sin esta comparación un error viejo
    // haría fallar la acción siguiente, que en realidad iba bien.
    // Poner una fecha o el tipo de documento dispara un refresco de la barra de filtros,
    // y ese refresco repinta los <input> con lo que tiene el servidor: todo lo que
    // hayamos escrito y no se haya enviado se pierde. Por eso hay que esperar a que la
    // barra deje de moverse ANTES de escribir los números, que van los últimos.
    quieto(calma = 900, tope = 12000) {
      return new Promise(resolve => {
        const d = M.doc;
        if (!d || !d.body) return resolve(false);
        let t = null, obs = null, fin = false;
        const acabar = v => { if (fin) return; fin = true; clearTimeout(t); try { obs.disconnect(); } catch (e) {} resolve(v); };
        const rearmar = () => { clearTimeout(t); t = setTimeout(() => acabar(true), calma); };
        obs = new (M.win.MutationObserver)(rearmar);
        obs.observe(d.body, { childList: true, subtree: true, attributes: true, characterData: true });
        rearmar();
        setTimeout(() => acabar('tope'), tope);
      });
    },

    tipoPuesto() {
      const b = M.doc && M.doc.querySelector('.current-options');
      return b ? limpiar(b.innerText) : null;
    },

    async esperarRejilla(previa, ms, habiaMarcas, destino, errPrevio) {
      const fallo = { msg: null };
      const r = await esperar(() => {
        const err = M.errorDelPortal();
        if (err && err !== errPrevio) { fallo.msg = err; return 'ERROR_PORTAL'; }
        const h = M.huella();
        if (h === 'error') return false;
        const nueva = habiaMarcas ? !M.quedanMarcas() : (h !== previa);
        if (!nueva) return false;
        if (!M.tabla()) return h;                       // 0 resultados
        if (destino != null && M.pagActual() !== destino) return false;
        return h;
      }, ms);
      if (r === 'ERROR_PORTAL') throw new Error('el portal rechazó la búsqueda: ' + fallo.msg);
      return r;
    },

    async arrancar(pantalla, log) {
      M.destruir();
      M.pantalla = pantalla;
      const f = document.createElement('iframe');
      f.dataset.aatResp = '1';
      f.style.cssText = 'position:fixed;left:-10000px;top:0;width:1400px;height:900px;border:0';
      document.body.appendChild(f);
      M.frame = f;
      for (let i = 1; i <= 4; i++) {
        f.src = pantalla.ruta + (i > 1 ? '?_r=' + Date.now() : '');
        await new Promise(res => {
          let ok = false;
          f.onload = () => { if (!ok) { ok = true; res(); } };
          setTimeout(() => { if (!ok) { ok = true; res(); } }, ESPERA_CARGA);
        });
        if (await esperar(() => M.listo(), 30000)) return true;
        log && log(`  intento ${i}: la pantalla no cargó`, 'w');
        await dormir(1500);
      }
      throw new Error(`No consigo abrir «${pantalla.nombre}».`);
    },

    escribir(inp, v) {
      Object.getOwnPropertyDescriptor(M.win.HTMLInputElement.prototype, 'value').set.call(inp, v);
      for (const e of ['input', 'change', 'blur']) inp.dispatchEvent(new M.win.Event(e, { bubbles: true }));
    },

    async fijarFechas(desde, hasta, log) {
      for (let i = 1; i <= 3; i++) {
        const [a, b] = M.pantalla.fechas(M.doc);
        if (!a || !b) { await dormir(1000); continue; }
        M.escribir(a, desde); M.escribir(b, hasta);
        await dormir(200);
        const [a2, b2] = M.pantalla.fechas(M.doc);
        if (a2?.value === desde && b2?.value === hasta) return true;
        log && log(`  las fechas no cuajaron (intento ${i})`, 'w');
        await dormir(1000);
      }
      throw new Error('No consigo fijar el rango de fechas.');
    },

    // El portal RECUERDA los filtros en la sesión del servidor, y el campo de números
    // se convierte en un widget de lista en cuanto tiene algo («3 options selected»),
    // que ya no se puede escribir. «Reset Filters» lo devuelve todo a cero y hace que
    // vuelva a ser un campo normal. Sin esto, un número olvidado de una búsqueda
    // anterior filtra la siguiente en silencio y devuelve tres filas donde había cientos.
    async resetFiltros(log) {
      for (let i = 1; i <= 3; i++) {
        const b = [...M.doc.querySelectorAll('input,button')]
          .find(e => limpiar(e.value || e.innerText) === 'Reset Filters');
        if (!b) { await dormir(700); continue; }
        b.click();
        await dormir(1500);
        const ok = await esperar(() => M.listo(), 15000);
        if (ok) return true;
        log && log(`  el reset no cuajó (intento ${i})`, 'w');
      }
      log && log('  aviso: no he podido confirmar la limpieza de filtros', 'w');
      return false;
    },

    // El campo de números solo es escribible cuando está vacío. Si quedó como widget de
    // fichas NO se resetea desde aquí: el «Reset Filters» devuelve el Document type a
    // «Request» y entonces el portal ignora los números. Se avisa y decide fuera.
    async fijarNumeros(lista, log) {
      if (!lista || !lista.length) return true;          // el reset ya lo dejó vacío
      const campo = M.pantalla.campoNumeros && M.pantalla.campoNumeros(M.doc);
      if (!campo) {
        log && log('  el campo de números quedó como lista de fichas', 'w');
        return false;
      }
      const valor = lista.join(',');
      M.escribir(campo, valor);
      await dormir(300);
      if (limpiar(campo.value) !== valor) {
        log && log('  el campo de números no se quedó como quería', 'w');
        return false;
      }
      return true;
    },

    async buscar(log) {
      const btn = M.botonBuscar();
      if (!btn) throw new Error('no encuentro el botón Search');
      const previa = M.huella();
      const errPrevio = M.errorDelPortal();
      const marcas = M.marcar();
      M.clic(btn, 'buscar');
      const h = await M.esperarRejilla(previa, ESPERA_BUSCAR, marcas, null, errPrevio);
      if (!h) {
        if (M.tabla() || /records?/i.test(M.doc.body.innerText)) {
          log && log('  la rejilla no cambió; sigo con lo que hay', 'w');
          return true;
        }
        throw new Error(`«${M.pantalla.nombre}» no respondió en ${ESPERA_BUSCAR/1000} s`);
      }
      return true;
    },

    total() {
      const t = M.doc?.body.innerText || '';
      const m = t.match(/of\s+([\d.,]+)\s+records?/i) || t.match(/\b([\d.,]+)\s+records?/i);
      if (!m) return null;
      const n = parseInt(m[1].replace(/[.,]/g, ''), 10);
      return Number.isFinite(n) ? n : null;
    },

    porPagina: null,
    pagTotal() {
      const tot = M.total();
      if (tot != null) {
        const pp = M.porPagina || 15;
        return Math.max(1, Math.ceil(tot / pp));
      }
      const ul = M.liPag()?.parentElement;
      if (!ul) return 1;
      const n = [...ul.children].map(li => parseInt(limpiar(li.innerText), 10)).filter(Number.isFinite);
      return n.length ? Math.max(...n) : 1;
    },

    async irPagina(destino, log) {
      for (let paso = 0; paso < 45; paso++) {
        const actual = M.pagActual();
        if (actual === destino) return true;
        if (actual != null && destino < actual) return false;
        const ul = M.liPag()?.parentElement;
        if (!ul) { await dormir(700); continue; }
        let enlace = null;
        for (const li of ul.children)
          if (limpiar(li.innerText) === String(destino)) { enlace = li.querySelector('a'); break; }
        if (!enlace) {
          const fuera = [...ul.parentElement.querySelectorAll('a')].filter(a => !ul.contains(a));
          if (fuera.length) enlace = fuera[fuera.length - 1];
        }
        if (!enlace) { log && log(`  no sé llegar a la página ${destino}`, 'w'); return false; }
        const previa = M.huella();
        const errPrevio = M.errorDelPortal();
        const marcas = M.marcar();
        enlace.click();
        if (!await M.esperarRejilla(previa, ESPERA_PAGINA, marcas, destino, errPrevio)) {
          log && log(`  la página ${destino} no respondió`, 'w');
          return false;
        }
      }
      return M.pagActual() === destino;
    },

    // El número de respuesta de la fila es un enlace a «Submitted Response Detail».
    enlaceFicha(tr) {
      try {
        const a = tr && [...tr.querySelectorAll('a')]
          .find(x => /^\s*8\d{9}\s*$/.test(x.innerText || ''));
        if (!a) return '';
        const u = new URL(a.href, M.doc.location.href);
        return u.pathname + u.search;
      } catch (e) { return ''; }
    },

    // Abre una ficha y devuelve sus líneas. Un iframe propio, reutilizado para todas:
    // no se toca el motor de búsqueda ni sus filtros, que bastante nos ha costado
    // dejarlos quietos.
    async leerFicha(ruta, hueco = 0) {
      if (!M.ficheros[hueco]) {
        const f = document.createElement('iframe');
        f.dataset.aatFicha = '1';
        f.style.cssText = 'position:fixed;left:-10000px;top:0;width:1200px;height:900px;border:0';
        document.body.appendChild(f);
        M.ficheros[hueco] = f;
      }
      const f = M.ficheros[hueco];
      await new Promise(res => {
        let ok = false;
        f.onload = () => { if (!ok) { ok = true; res(); } };
        f.src = ruta;
        setTimeout(() => { if (!ok) { ok = true; res(); } }, ESPERA_CARGA);
      });
      const hayTabla = () => {
        const dd = f.contentDocument;
        return dd && dd.querySelector('table[id$="wtResponseItemTable"]');
      };
      let t = await esperarEn(f.contentDocument, f.contentWindow, hayTabla, 20000);
      if (!t) {
        // Una ficha que no llega a tiempo suele ser un tropiezo suelto del portal, no un
        // problema de esa respuesta. Un reintento cuesta segundos y nos ahorra un hueco.
        await dormir(1500);
        t = await esperarEn(f.contentDocument, f.contentWindow, hayTabla, 20000);
        if (!t) return null;
      }
      const d = f.contentDocument;
      const lineas = [];
      for (const tr of [...t.querySelectorAll('tr')].slice(1)) {
        const c = [...tr.children].map(x => limpiar(x.innerText));
        // «GNA2022596/04000 / ER_006 PSC, 1ª tecnología…». OJO: hay DOS barras. La
        // primera va pegada, dentro de la referencia de Ericsson (GNA…/04000); la que
        // separa el código lleva espacios a los lados. Cogiendo la primera salía
        // «04000» —o «19000»— y ningún código existía, así que la pasada 4 abría las
        // fichas para no identificar nada. Medido el 28-oct.
        const m = (c[1] || '').match(/\s\/\s*([A-Za-z0-9_\-]+)/)
               || (c[1] || '').match(/^\s*([A-Za-z0-9_\-]+)\s/);
        if (!m) continue;
        lineas.push({ cod: m[1], qty: parseInt(c[2], 10) || 1, total: parseFloat((c[4] || '0').replace(/[^\d.,-]/g, '').replace(',', '.')) || 0 });
      }
      return lineas;
    },

    extraer() {
      const t = M.tabla();
      if (!t) return [];
      const filas = [];
      for (const tr of t.querySelectorAll('tr')) {
        const tds = [...tr.querySelectorAll('td')].map(td => td.innerText || '');
        if (tds.length < 5) continue;
        const f = M.pantalla.leer(tds, tr);
        if (f && (f.response || f.rfx)) filas.push(f);
      }
      return filas;
    }
  };

  // ── Recorrer una pantalla entera, partiendo el rango si hace falta ────────────────
  async function recorrer(pantalla, desde, hasta, log, acumulado, avisos, prof = 0, numeros = null, totalPadre = null, techo = null) {
    if (S.abortar) return;
    await M.arrancar(pantalla, log);

    // Preparar los filtros es UNA SOLA operación que hay que dejar verificada antes de
    // buscar, no cuatro pasos sueltos. El orden importa y no es negociable:
    //   1. Reset Filters   — deja el formulario limpio Y el Document type en «Request».
    //   2. Document type   — por eso va DESPUÉS del reset, nunca antes.
    //   3. Fechas          — su refresco todavía puede borrar cosas.
    //   4. Esperar quietud — hasta que la barra de filtros deje de repintarse.
    //   5. Números         — los últimos, porque son los que se pierden.
    // Y al final se comprueba que el tipo y los números siguen puestos. Si no, se repite
    // entera. Lo aprendimos por las malas: al reponer los números tras un reset se
    // perdía el Document type, y sin él el portal ignora los números sin decir nada.
    let listo = false, totalBusqueda = null;
    for (let intento = 1; intento <= 3 && !listo; intento++) {
      await M.resetFiltros(log);
      // Tras el reset el portal repinta la barra entera. Si venimos de una búsqueda con
      // números, el campo llega como fichas y tarda un momento en volver a ser normal:
      // esperarlo aquí ahorra una vuelta completa (medido: sin esto siempre hacía dos).
      if (numeros && pantalla.campoNumeros)
        await esperar(() => pantalla.campoNumeros(M.doc), 15000);
      if (pantalla.preparar) await pantalla.preparar(M.doc, log);
      await M.fijarFechas(desde, hasta, log);
      await M.quieto();

      // Poner las fechas repinta la barra y a veces se lleva por delante el Document
      // type, que vuelve a «Request». Se recoloca aquí y ya está: repetir la secuencia
      // entera por esto costaba un reset y una búsqueda de más cada vez.
      // PERO recolocar el tipo dispara OTRO postback, y ése se lleva LAS FECHAS. En la
      // 1.3.2 metí este arreglo y no volví a poner las fechas detrás: el resultado era
      // buscar sin fechas, o sea el histórico entero —2.742 Responses— creyendo que se
      // pedía un día. Si se toca el tipo aquí, las fechas se vuelven a poner. Punto.
      if (pantalla.preparar && M.tipoPuesto() !== 'Response') {
        await pantalla.preparar(M.doc, log);
        await M.quieto(600, 6000);
        await M.fijarFechas(desde, hasta, log);
        await M.quieto(600, 6000);
      }

      if (numeros && pantalla.campoNumeros) {
        if (!await M.fijarNumeros(numeros, log)) {
          log(`  reintento la preparación de filtros (${intento})`, 'w');
          continue;
        }
        await M.quieto(600, 6000);
      }

      // La comprobación tiene que cubrir TODO lo que importa, no dos de las tres cosas.
      // Las fechas se quedaron fuera de esta lista y por eso el fallo pasó inadvertido:
      // el tipo estaba bien, los números no hacían falta, y nadie miraba las fechas.
      const tipoMal = pantalla.preparar && M.tipoPuesto() !== 'Response';
      const campo   = numeros && pantalla.campoNumeros ? pantalla.campoNumeros(M.doc) : null;
      const numsMal = numeros && pantalla.campoNumeros &&
                      (!campo || limpiar(campo.value) !== numeros.join(','));
      // Las fechas solo se exigen cuando SON el filtro. En el rescate por número mandan
      // los números —la fecha va abierta de par en par para que no estorbe— y escribir
      // los números dispara un postback que se lleva las fechas por delante. Exigirlas
      // ahí dejaba la pasada 3 dando vueltas con «no consigo dejar los filtros puestos»
      // por algo que daba igual. Medido al probar la 1.6.0.
      const [fa, fb] = pantalla.fechas(M.doc);
      const fechasMal = !numeros &&
                        (!fa || !fb || limpiar(fa.value) !== desde || limpiar(fb.value) !== hasta);
      if (tipoMal || numsMal || fechasMal) {
        const que = tipoMal ? 'tipo=' + M.tipoPuesto()
                  : fechasMal ? `fechas=${fa ? fa.value : '?'}→${fb ? fb.value : '?'}`
                  : 'números';
        log(`  los filtros no se sostuvieron (${que}); repito (${intento})`, 'w');
        continue;
      }
      // Último vistazo JUSTO antes de pulsar. Entre la comprobación y el clic todavía
      // puede aterrizar un postback pendiente y llevarse las fechas: pasaba en la
      // primera búsqueda de la pasada 2, que verificaba bien y acababa buscando sin
      // fechas —2.750 registros, el histórico entero—.
      if (!numeros && pantalla.fechas) {
        await M.quieto(600, 6000);
        const [fa2, fb2] = pantalla.fechas(M.doc);
        if (!fa2 || !fb2 || limpiar(fa2.value) !== desde || limpiar(fb2.value) !== hasta) {
          log('  las fechas se cayeron justo antes de buscar; las repongo', 'w');
          await M.fijarFechas(desde, hasta, log);
          await M.quieto(600, 6000);
        }
      }

      // Y la prueba del algodón: BUSCAR y mirar si el resultado cuadra con lo pedido.
      // Comprobar los filtros en pantalla no basta —ya nos lo enseñó el 27-oct: el DOM
      // estaba impecable y el servidor buscaba sin fechas—, así que lo que se juzga es
      // el RESULTADO. Si devuelve mucho más de lo que cabe en el rango, se rehace la
      // preparación entera en vez de ponerse a paginar el histórico.
      await M.buscar(log);
      totalBusqueda = M.total();
      if (techo != null && totalBusqueda != null && totalBusqueda > techo) {
        log(`  la búsqueda devuelve ${totalBusqueda} registros y en este rango no caben `
          + `más de ~${techo}: los filtros no han llegado al servidor. Repito (${intento}).`, 'w');
        continue;
      }
      listo = true;
    }
    if (!listo) throw new Error('la búsqueda no respeta el rango de fechas por más que lo repito');

    const total = totalBusqueda;

    // GUARDIA DEL FILTRO DE FECHAS. 27-oct-2026: la búsqueda avanzada del portal dejó
    // de aplicar las fechas —devolvía siempre los mismos 2.742 registros, se pidiera el
    // mes, la semana o un día suelto— y el script, fiándose de ese número, se puso a
    // paginar las 183 páginas del histórico entero hasta que el portal cortó con un
    // «401 Unauthorized». El número que leemos puede ser el de la búsqueda ANTERIOR.
    // Invariante: si tras partir el rango dos veces —o sea, con una cuarta parte de los
    // días— el total no se ha movido ni un registro y sigue siendo grande, el filtro no
    // está vivo. Que todo caiga justo en ese trocito es imposible a estos volúmenes.
    // La primera versión de esta guardia pedía dos particiones, y con un rango de dos
    // días solo cabe una: no saltaba justo cuando el usuario hacía lo correcto. Ahora
    // basta con que un tramo MÁS CORTO devuelva exactamente lo mismo que el anterior.
    if (total != null && totalPadre != null && total === totalPadre && total > MAX_POR_TRAMO)
      throw new Error(`el filtro de fechas no se está aplicando: ${desde} → ${hasta} devuelve `
        + `los mismos ${total} registros que el tramo del que sale. Corto aquí para no `
        + `recorrer el histórico entero.`);

    // MEDIDO: el filtro de números SOLO se aplica si «Document type» está puesto. Sin
    // él, el portal ignora los números en silencio y devuelve el catálogo entero —4.486
    // registros en la prueba—, que el script se pondría a paginar durante horas dando
    // por buenas filas que no había pedido. Si vienen más filas que números, algo falló.
    if (numeros && total != null && total > numeros.length) {
      if (total > numeros.length * 2)
        throw new Error(`el filtro de números no se aplicó (${total} registros para ${numeros.length} números)`);
      log(`  ⚠ ${total} registros para ${numeros.length} números: reviso igualmente`, 'w');
    }
    const dias = diasEntre(desde, hasta);

    // Un lote por números ya viene acotado: no se parte por fechas.
    if (!numeros && total != null && total > MAX_POR_TRAMO && dias >= 1 && prof < MAX_PROF) {
      const medio = mitad(desde, hasta);
      log(`✂ ${desde} → ${hasta}: ${total} registros. Lo parto por ${medio}.`);
      await recorrer(pantalla, desde, medio, log, acumulado, avisos, prof + 1, null, total, techo);
      await recorrer(pantalla, sumarDias(medio, 1), hasta, log, acumulado, avisos, prof + 1, null, total, techo);
      return;
    }
    if (!numeros && total != null && total > MAX_POR_TRAMO)
      log(`⚠ ${desde} → ${hasta}: ${total} registros y no puedo partir más. Voy por paginación.`, 'w');

    M.porPagina = null;
    let pagina = M.pagActual() || 1;
    const antes = acumulado.size;

    for (;;) {
      if (S.abortar) return;
      const filas = M.extraer();
      if (M.porPagina == null || filas.length > M.porPagina) M.porPagina = filas.length;
      for (const f of filas) {
        const k = f.response || ('rfx:' + f.rfx);
        acumulado.set(k, Object.assign(acumulado.get(k) || {}, f));
      }
      const totalPag = M.liPag() ? M.pagTotal() : 1;
      if (!numeros)
        log(`  ${pantalla.nombre} · página ${pagina}/${totalPag} · ${acumulado.size - antes} de este tramo`);

      if (total && (acumulado.size - antes) >= total) break;
      if (pagina >= totalPag) break;

      if (!await M.irPagina(pagina + 1, log)) {
        avisos.push(`${pantalla.nombre} ${desde}→${hasta}: corté en la página ${pagina}`);
        log(`✗ Me quedé en la página ${pagina} de ${pantalla.nombre}.`, 'e');
        return;
      }
      pagina++;
      await dormir(PAUSA_PAGINA);
    }
  }

  // Las respuestas enviadas ESTE mes sobre peticiones creadas ANTES no salen en la
  // búsqueda avanzada por fechas: esa pantalla filtra por la fecha de la RFx, no por
  // la de la respuesta. (Comprobado: la respuesta 8004099349, del 7-sep, cuelga de la
  // RFx 7004232081, bastante anterior.) A ésas se les busca la RFx por número.
  async function rescatarPorNumero(sinRfx, desde, hasta, log, acumulado, avisos) {
    const desdeAmplio = sumarDias(desde, -730);   // los números mandan; la fecha solo no debe estorbar
    let tam = PANTALLAS.avanzada.maxNumeros || 15;
    let hechos = 0, hecho = 0;

    // Si el portal rechaza un lote, se parte por la mitad y se reintenta; y además el
    // tamaño baja para TODO lo que queda, que si un lote se atragantó los siguientes
    // también lo harían. Así un tropiezo no se repite quince veces.
    async function intentar(trozo, etiqueta) {
      if (S.abortar) return 0;
      try {
        await recorrer(PANTALLAS.avanzada, desdeAmplio, hasta, log, acumulado, avisos, 0, trozo);
        return trozo.length;
      } catch (e) {
        if (trozo.length > 4) {
          if (trozo.length >= tam) tam = Math.max(4, Math.floor(trozo.length / 2));
          const m = Math.ceil(trozo.length / 2);
          log(`  ⚠ ${etiqueta}: ${e.message}. Lo parto en dos y sigo de ${tam} en ${tam}.`, 'w');
          return await intentar(trozo.slice(0, m), etiqueta + 'a')
               + await intentar(trozo.slice(m), etiqueta + 'b');
        }
        avisos.push(`rescate por número (lote ${etiqueta}): ${e.message}`);
        log('  ✗ ' + e.message, 'e');
        return 0;
      }
    }

    let n = 0;
    while (hecho < sinRfx.length) {
      if (S.abortar) return hechos;
      const trozo = sinRfx.slice(hecho, hecho + tam);
      n++;
      log(`  buscando por número ${hecho + 1}–${hecho + trozo.length} de ${sinRfx.length}…`);
      hechos += await intentar(trozo, String(n));
      hecho += trozo.length;
    }
    return hechos;
  }

  // ── Estado ────────────────────────────────────────────────────────────────────────
  const S = { filas: [], abortar: false, corriendo: false, lineas: [] };

  // ── CSV ───────────────────────────────────────────────────────────────────────────
  const COLUMNAS = ['Creación','Operador','Servicio','Desglose','Proyecto','Site ID','Site','RFx','Request name',
                    'Response','Response name','PO','Estado','Importe','CM Scope ID','Visto en'];

  function aCSV(filas) {
    const esc = v => {
      const t = String(v ?? '');
      return /[";\n\r]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t;
    };
    const L = [COLUMNAS.join(';')];
    for (const f of filas) L.push(COLUMNAS.map(c => esc(f[c])).join(';'));
    return L.join('\r\n');
  }

  function componer(mapa, log) {
    componer.log = log || null;
    const filas = [];
    for (const r of mapa.values()) {
      const nombre = r.reqNombre || r.respNombre || '';
      const srvFinal = r.srvFicha || servicioDe(nombre, r.importe, componer.log);
      const visto = (r.creacion ? 'R' : '') + (r.rfx ? 'A' : '');
      filas.push({
        'Creación':     r.creacion || '',
        'Operador':     operador(nombre),
        // Hay filas que son una RFx SIN respuesta todavía: aparecen por la búsqueda
        // avanzada y no hay ficha que mirar. Decir «Pendiente» en ésas da a entender que
        // no supimos clasificarlas, cuando lo cierto es que no hay nada que clasificar.
        // OJO: solo cambia la etiqueta cuando NO se sabe el servicio. En la 1.9.2 lo
        // puse delante de todo y me cargué el servicio de 20 filas que el recetario sí
        // conocía — «sin respuesta» pasó de 11 a 31 comiéndose PIM y Diseño enteros.
        'Servicio':     (srvFinal === 'Pendiente' && !r.response) ? 'sin respuesta' : srvFinal,
        'Desglose':     r.firma || '',
        'Proyecto':     proyecto(nombre),
        'Site ID':      r.siteId || '',
        'Site':         r.site || '',
        'RFx':          r.rfx || '',
        'Request name': r.reqNombre || '',
        'Response':     r.response || '',
        'Response name': r.respNombre || '',
        'PO':           r.po || '',
        'Estado':       r.estado || '',
        'Importe':      r.importe || '',
        'CM Scope ID':  r.scope || '',
        'Visto en':     visto === 'RA' ? 'ambas'
                       : visto === 'R' ? 'sin RFx localizada'
                       : visto === 'A' ? 'solo búsqueda avanzada' : ''
      });
    }
    filas.sort((a, b) => (b['Creación'] || '').localeCompare(a['Creación'] || '')
                      || (b['Response'] || '').localeCompare(a['Response'] || ''));
    return filas;
  }

  function descargar(texto, nombre) {
    const blob = new Blob(['﻿' + texto], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement('a'), { href: url, download: nombre });
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 3000);
  }

  // ── Panel ─────────────────────────────────────────────────────────────────────────
  const CSS = `
.arb{position:fixed;inset:0;background:rgba(12,18,26,.55);z-index:2147483646}
.arp{position:fixed;top:6vh;left:50%;transform:translateX(-50%);width:min(1000px,94vw);
 max-height:88vh;background:#fff;border-radius:10px;box-shadow:0 20px 60px rgba(0,0,0,.35);
 z-index:2147483647;display:flex;flex-direction:column;
 font:20px/1.4 system-ui,-apple-system,Segoe UI,sans-serif;color:#16191d}
.arp *{box-sizing:border-box}
.arp .h{display:flex;align-items:center;gap:.55em;padding:.5em .8em;background:#003A5C;color:#fff;border-radius:10px 10px 0 0}
.arp .h img{height:1.4em;width:auto;display:block}
.arp .h b{flex:1;font-size:1.05em;font-weight:600}
.arp .h .ver{opacity:.65;font-size:.6em;font-weight:400}
.arp .h .x{cursor:pointer;font-size:1.3em;opacity:.8;padding:0 .25em}
.arp .aviso{background:#eaf3ff;border-bottom:1px solid #cfe0f5;padding:.45em .8em;font-size:.68em;color:#0f56b8}
.arp .bar{display:flex;flex-wrap:wrap;gap:.5em;align-items:flex-end;padding:.7em .8em;border-bottom:1px solid #e3e8ed;background:#f8fafc}
.arp .bar label{display:block;font-size:.6em;color:#5a646e;margin-bottom:.25em}
.arp .bar input{padding:.3em .45em;border:1px solid #c6ccd3;border-radius:5px;font:inherit;font-size:.8em;width:7em}
.arp .b{padding:.4em .8em;border:0;border-radius:5px;cursor:pointer;font:inherit;font-size:.8em;font-weight:600}
.arp .b.p{background:#1668dc;color:#fff}.arp .b.p:hover{background:#0f56b8}
.arp .b.g{background:#e6eaee;color:#22282e}.arp .b.g:hover{background:#d6dce2}
.arp .b.r{background:#c0392b;color:#fff}
.arp .b:disabled{background:#aeb6be!important;color:#fff!important;cursor:default}
.arp .cuerpo{flex:1;overflow:auto;padding:.7em .8em;min-height:9em}
.arp .res{font-size:.8em}
.arp .res table{width:100%;border-collapse:collapse;font-size:.85em}
.arp .res th{position:sticky;top:0;background:#eef2f6;text-align:left;padding:.35em .4em;border-bottom:2px solid #d3dae1}
.arp .res td{padding:.3em .4em;border-bottom:1px solid #eef1f4;white-space:nowrap}
.arp .log{height:8em;overflow:auto;border-top:1px solid #e3e8ed;padding:.5em .8em;background:#fbfcfd;
 font:.62em/1.55 ui-monospace,Consolas,monospace;white-space:pre-wrap;color:#39424b}
.arp .log .e{color:#c0392b}.arp .log .o{color:#1e7d32}.arp .log .w{color:#b26a00}
.arp .pie{border-top:1px solid #e3e8ed;padding:.6em .8em;background:#f8fafc;display:flex;gap:.5em;align-items:center;flex-wrap:wrap}
.arp .bar .et{font-size:.66em;font-weight:700;letter-spacing:.03em;text-transform:uppercase;color:#5a646e;margin-right:.2em}
.arp .resumen{font-size:.82em;font-weight:600;color:#16191d;white-space:nowrap;margin-left:.3em}
.arp .arDlgCapa{position:fixed;inset:0;background:rgba(12,18,26,.5);z-index:2147483647;display:flex!important;align-items:center;justify-content:center;visibility:visible!important;opacity:1!important}
.arp .arDlgCaja{background:#fff;border-radius:10px;box-shadow:0 20px 50px rgba(0,0,0,.35);padding:1em 1.1em;width:min(380px,92vw);font-size:1rem}
.arp .arDlgCaja h3{margin:0 0 .15em;font-size:1em;color:#16191d}
.arp .arDlgCaja .sub{color:#5a646e;font-size:.78em;margin-bottom:.8em}
.arp .arDlgCaja label{font-size:.68em;color:#5a646e;display:block;margin:.5em 0 .2em}
.arp .arDlgCaja input{width:100%;padding:.35em .5em;border:1px solid #c6ccd3;border-radius:5px;font:inherit}
.arp .arDlgPie{display:flex;gap:.4em;justify-content:flex-end;margin-top:1em}
.arp .ch{border:1px solid #c6ccd3;background:#fff;border-radius:14px;padding:.2em .7em;font:inherit;font-size:.78em;cursor:pointer;color:#16191d}
.arp .ch:hover{border-color:#9aa4ae;background:#f6f8fa}
.arp .ch[aria-pressed="true"]{border-color:#1668dc;background:#eaf3ff;color:#0f56b8;font-weight:600}
.arp .dias{font-size:.74em;padding:.18em .5em;border-radius:4px;background:#eceff2;color:#5a646e;white-space:nowrap}
.arp .dias.ojo{background:#fff4e5;color:#7a4b00;font-weight:600}
.arp .dias.mal{background:#fde8e8;color:#9b1c1c;font-weight:600}
.arp .cuenta{flex:1;font-size:.8em;font-weight:600}
`;

  let ui = null;

  function abrir() {
    if (ui && document.body.contains(ui.panel)) { ui.panel.style.display = ''; ui.fondo.style.display = ''; return; }

    const estilo = document.createElement('style'); estilo.textContent = CSS;
    document.head.appendChild(estilo);
    const fondo = document.createElement('div'); fondo.className = 'arb';
    const panel = document.createElement('div'); panel.className = 'arp';
    panel.innerHTML = `
      <div class="h"><img src="${LOGO_AAT}" alt="AAT" onerror="this.style.display='none'">
        <b>Listar respuestas <span class="ver">v${VERSION}</span></b><span class="x">&times;</span></div>
      <div class="aviso">Esta herramienta solo lee. No acepta nada ni cambia nada en el portal.</div>
      <div class="bar">
        <span class="et">Creación</span>
        <button class="ch" type="button" data-dias="0">Hoy</button>
        <button class="ch" type="button" data-dias="7">1 semana</button>
        <button class="ch" type="button" data-dias="14">2 semanas</button>
        <button class="ch" type="button" id="rOtro">Rango de fechas…</button>
        <span class="resumen" id="rResumen"></span>
        <span class="dias" id="rDias"></span>
        <button class="b p" id="rGo">Listar respuestas</button>
        <button class="b r" id="rStop" style="display:none">Abortar</button>
        <span style="flex:1"></span>
        <button class="b g" id="rCsv" disabled>Descargar CSV</button>
      </div>
      <!-- Las fechas siguen viviendo aquí, ocultas: todo el motor lee rD y rH, y
           esconderlas sin moverlas evita tocar nada de la lógica de la pasada. -->
      <input type="hidden" id="rD" value="${haceDias(7)}">
      <input type="hidden" id="rH" value="${hoy()}">
      <div class="cuerpo"><div class="res" id="rRes"></div></div>
      <div class="pie"><span class="cuenta" id="rCnt">Elige el rango y pulsa «Listar respuestas».</span></div>
      <div class="log" id="rLog">Listo.</div>`;
    document.body.append(fondo, panel);

    const $ = id => panel.querySelector('#' + id);
    const caja = $('rLog');
    const log = (t, c = '') => { caja.innerHTML += `\n<span class="${c}">${t}</span>`; caja.scrollTop = caja.scrollHeight; };

    function pintar() {
      const n = S.filas.length;
      $('rCsv').disabled = !n;
      $('rCnt').textContent = n
        ? `${n} respuestas · ${S.filas.filter(f => f.PO).length} con PO · ${S.filas.filter(f => !f.RFx).length} sin RFx localizada`
        : 'Sin resultados todavía.';
      if (!n) { $('rRes').innerHTML = ''; return; }
      const muestra = S.filas.slice(0, 40);
      $('rRes').innerHTML =
        '<table><thead><tr>' + ['Creación','Operador','Servicio','Proyecto','RFx','Response','PO','Importe','Estado']
          .map(c => `<th>${c}</th>`).join('') + '</tr></thead><tbody>' +
        muestra.map(f => '<tr>' + ['Creación','Operador','Servicio','Proyecto','RFx','Response','PO','Importe','Estado']
          .map(c => `<td>${f[c] || ''}</td>`).join('') + '</tr>').join('') +
        '</tbody></table>' +
        (n > muestra.length ? `<div style="padding:.5em 0;color:#5a646e">…y ${n - muestra.length} más. El CSV las lleva todas.</div>` : '');
    }

    panel.querySelector('.x').onclick = () => {
      if (S.corriendo && !confirm('Hay una búsqueda en marcha. ¿Cerrar igualmente?')) return;
      S.abortar = true; M.destruir();
      panel.remove(); fondo.remove(); estilo.remove(); ui = null;
    };
    $('rStop').onclick = () => { S.abortar = true; log('Abortando…', 'w'); };

    // ── Atajos de rango y red contra el error de dedo ────────────────────────────────
    // La historia de verdad: alguien quiso pedir UN día —del 26 al 27 de octubre— y
    // tecleó 26 de SEPTIEMBRE. Un mes son unas 6.000 filas y media hora de portal, y no
    // hay nada en la pantalla que lo diga antes de pulsar. Los atajos evitan teclear; el
    // contador de días hace visible el error; y el aviso lo para antes de empezar.
    // Densidad medida en el portal el 27-oct-2026: ~105 respuestas/día en Submitted
    // Responses, y la búsqueda avanzada añade un 82% más de filas que leer. Sale a unos
    // 0,6 min por día de rango. Si el volumen cambia mucho, se ajusta aquí.
    const RESP_POR_DIA = 105;
    const MIN_POR_DIA  = 0.6;
    const DIAS_AVISO   = 14;

    // Las fechas ya no están a la vista, así que el rótulo del rango NO es decoración:
    // es lo único que queda entre el gestor y arrancar un mes sin darse cuenta. Por eso
    // va siempre visible, con los días al lado y en color cuando se pasa.
    const bonito = t => {
      const M = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
      const [a, m, d] = t.split('-');
      return `${Number(d)} ${M[Number(m) - 1]}` + (Number(a) !== new Date().getFullYear() ? ' ' + a : '');
    };

    function pintarDias() {
      const desde = $('rD').value.trim(), hasta = $('rH').value.trim();
      const et = $('rDias'), res = $('rResumen');
      const bien = /^\d{4}-\d{2}-\d{2}$/.test(desde) && /^\d{4}-\d{2}-\d{2}$/.test(hasta);
      if (!bien) { res.textContent = '(fechas sin poner)'; et.textContent = ''; et.className = 'dias'; return; }
      if (desde > hasta) {
        res.textContent = `${bonito(desde)} → ${bonito(hasta)}`;
        et.textContent = '⚠ el desde va después del hasta'; et.className = 'dias mal'; return;
      }
      const n = diasEntre(desde, hasta) + 1;
      res.textContent = n === 1 ? bonito(desde) : `${bonito(desde)} → ${bonito(hasta)}`;
      et.textContent = n === 1 ? '1 día' : `${n} días`;
      et.className = 'dias' + (n > 31 ? ' mal' : n > DIAS_AVISO ? ' ojo' : '');
      for (const b of panel.querySelectorAll('.bar .ch[data-dias]'))
        b.setAttribute('aria-pressed', String(hasta === hoy() && Number(b.dataset.dias) === n - 1));
      const aMedida = ![...panel.querySelectorAll('.bar .ch[data-dias]')]
        .some(b => b.getAttribute('aria-pressed') === 'true');
      $('rOtro').setAttribute('aria-pressed', String(aMedida));
    }

    for (const b of panel.querySelectorAll('.bar .ch[data-dias]'))
      b.onclick = () => {
        if (S.corriendo) return;
        $('rH').value = hoy();
        $('rD').value = haceDias(Number(b.dataset.dias));
        pintarDias();
      };

    $('rOtro').onclick = () => {
      if (S.corriendo) return;
      const capa = document.createElement('div');
      capa.className = 'arDlgCapa';
      capa.innerHTML = `<div class="arDlgCaja">
        <h3>Rango de fechas</h3>
        <div class="sub">Fecha de creación de la respuesta, en formato AAAA-MM-DD.</div>
        <label>Desde</label><input type="text" id="rDlgD" value="${$('rD').value}" autocomplete="off">
        <label>Hasta</label><input type="text" id="rDlgH" value="${$('rH').value}" autocomplete="off">
        <div class="dias" id="rDlgDias" style="display:inline-block;margin-top:.7em"></div>
        <div class="arDlgPie">
          <button class="b g" id="rDlgNo">Cancelar</button>
          <button class="b p" id="rDlgSi">Usar este rango</button>
        </div></div>`;
      panel.appendChild(capa);
      const q = id => capa.querySelector('#' + id);
      const repasar = () => {
        const a = q('rDlgD').value.trim(), b2 = q('rDlgH').value.trim();
        const et = q('rDlgDias');
        const ok = /^\d{4}-\d{2}-\d{2}$/.test(a) && /^\d{4}-\d{2}-\d{2}$/.test(b2);
        if (!ok) { et.textContent = 'formato AAAA-MM-DD'; et.className = 'dias mal'; return false; }
        if (a > b2) { et.textContent = 'el desde va después del hasta'; et.className = 'dias mal'; return false; }
        if (b2 > hoy()) { et.textContent = 'el hasta está en el futuro'; et.className = 'dias mal'; return false; }
        const n = diasEntre(a, b2) + 1;
        et.textContent = (n === 1 ? '1 día' : `${n} días`)
          + (n > DIAS_AVISO ? ` · unos ${Math.max(1, Math.round(n * MIN_POR_DIA))} min de portal` : '');
        et.className = 'dias' + (n > 31 ? ' mal' : n > DIAS_AVISO ? ' ojo' : '');
        return true;
      };
      q('rDlgD').oninput = repasar; q('rDlgH').oninput = repasar; repasar();
      const cerrar = () => capa.remove();
      capa.onclick = ev => { if (ev.target === capa) cerrar(); };
      q('rDlgNo').onclick = cerrar;
      q('rDlgSi').onclick = () => {
        if (!repasar()) return;
        $('rD').value = q('rDlgD').value.trim();
        $('rH').value = q('rDlgH').value.trim();
        cerrar(); pintarDias();
      };
      try { q('rDlgD').focus(); q('rDlgD').select(); } catch (e) {}
    };

    pintarDias();

    $('rGo').onclick = async () => {
      const desde = $('rD').value.trim(), hasta = $('rH').value.trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(desde) || !/^\d{4}-\d{2}-\d{2}$/.test(hasta))
        return log('✗ Las fechas van en formato AAAA-MM-DD.', 'e');
      if (desde > hasta) return log('✗ El «desde» es posterior al «hasta».', 'e');
      if (hasta > hoy()) return log('✗ El «hasta» está en el futuro. ¿Te has equivocado de mes?', 'e');

      const dias = diasEntre(desde, hasta) + 1;
      if (dias > DIAS_AVISO) {
        const resp = Math.round(dias * RESP_POR_DIA / 50) * 50;
        const mins = Math.max(1, Math.round(dias * MIN_POR_DIA));
        if (!confirm(`Has pedido ${dias} días: del ${desde} al ${hasta}.\n\n`
          + `Eso son del orden de ${resp} respuestas y unos ${mins} minutos de portal.\n\n`
          + `Si querías un rango corto, revisa las fechas: el fallo más común es `
          + `equivocarse de MES en el «desde».\n\n¿Sigo?`)) {
          log('Cancelado. Revisa el rango o usa uno de los atajos de arriba.', 'w');
          return;
        }
      }

      S.corriendo = true; S.abortar = false; S.filas = [];
      $('rGo').disabled = true; $('rCsv').disabled = true; $('rStop').style.display = '';
      caja.innerHTML = `▶ ${desde} → ${hasta}`;
      const mapa = new Map(), avisos = [];
      const t0 = Date.now();

      try {
        const crono = {};
        let tPaso = Date.now();
        const marcar = n => { crono[n] = Math.round((Date.now() - tPaso) / 1000); tPaso = Date.now(); };
        log(`── 1 de 3 · Submitted Responses (fecha de creación) ──`);
        // Techo de la pasada 1: esta pantalla SÍ filtra por la fecha de la respuesta,
        // así que un rango de N días no puede traer miles. Medido: ~105 respuestas/día.
        const techo1 = Math.max(400, (diasEntre(desde, hasta) + 1) * RESP_POR_DIA_TOPE);
        await recorrer(PANTALLAS.respuestas, desde, hasta, log, mapa, avisos, 0, null, null, techo1);
        const soloR = mapa.size;
        log(`✓ ${soloR} respuestas`, 'o');

        if (!S.abortar) {
          marcar('pasada 1');
          log('── 2 de 3 · Request, Response and PO (RFx y PO) ──');
          // Techo de cordura para la pasada 2. La búsqueda avanzada filtra por la fecha
          // de la RFx, así que puede traer bastantes más filas que respuestas hubo —pero
          // no DIECIOCHO veces más. El 28-oct, con el filtro caído, devolvió 1.858 donde
          // la pasada 1 había encontrado 102, y se puso a paginar hasta la página 118.
          const techo2 = Math.max(400, soloR * 6);
          await recorrer(PANTALLAS.avanzada, desde, hasta, log, mapa, avisos, 0, null, null, techo2);
          log(`✓ cruce hecho · ${mapa.size} filas en total`, 'o');
        }

        if (!S.abortar) {
          const sinRfx = [...mapa.values()].filter(r => r.response && !r.rfx).map(r => r.response);
          if (sinRfx.length) {
            marcar('pasada 2');
            log(`── 3 de 3 · ${sinRfx.length} respuestas sin RFx: las busco por número ──`);
            log('   (son respuestas de este periodo sobre peticiones más antiguas)');
            await rescatarPorNumero(sinRfx, desde, hasta, log, mapa, avisos);
            const quedan = [...mapa.values()].filter(r => r.response && !r.rfx).length;
            log(quedan ? `✓ rescatadas ${sinRfx.length - quedan}; ${quedan} siguen sin RFx`
                       : `✓ rescatadas las ${sinRfx.length}`, quedan ? 'w' : 'o');
          } else {
            marcar('pasada 2');
            log('── 3 de 3 · todas tienen RFx, no hace falta rescate ──', 'o');
          }
        }

        marcar('pasada 3');

        // ── 4 de 4 · los que el recetario no sabe, leídos de su ficha ────────────────
        // Aquí no se adivina. El recetario acierta por importe cuando el importe es
        // revelador; cuando no lo es —un ítem fuera de catálogo a precio pactado— solo
        // la ficha lo sabe. Se abre SOLO la de los pendientes, que son pocos.
        const pendientes = [...mapa.values()].filter(r => {
          const nombre = r.reqNombre || r.respNombre || '';
          return r.ficha && servicioDe(nombre, r.importe, null) === 'Pendiente';
        });
        if (pendientes.length) {
          log(`── 4 de 4 · ${pendientes.length} sin servicio conocido: las miro en su ficha ──`);
          // MEDIDO el 28-oct: de una en una, 417 s para 45 fichas; de TRES en tres, 397 s.
          // Nada. El portal atiende las peticiones de una misma sesión en fila —es lo
          // normal en estas plataformas, que bloquean la sesión mientras sirven— así que
          // abrir tres iframes solo hace que esperen su turno tres en vez de uno.
          // Se deja el reparto por huecos montado, pero en 1: si algún día el portal
          // deja de serializar, esto es cambiar un número. No lo subas sin medir.
          const A_LA_VEZ = 1;
          let siguiente = 0, bien = 0;
          const obrero = async hueco => {
            for (;;) {
              const i = siguiente++;
              if (i >= pendientes.length || S.abortar) return;
              const r = pendientes[i];
              try {
                const lineas = await M.leerFicha(r.ficha, hueco);
                if (lineas && lineas.length) {
                  const v = servicioDeLineas(lineas);
                  if (v.srv) { r.srvFicha = v.srv; r.firma = v.firma; bien++; }
                  log(`  ${i + 1}/${pendientes.length} ${r.response} · ${v.srv || 'sigue sin identificar'}`
                    + (v.firma ? ` · ${v.firma}` : ''));
                } else {
                  log(`  ${i + 1}/${pendientes.length} ${r.response} · la ficha no trae líneas`, 'w');
                }
              } catch (e) {
                log(`  ${i + 1}/${pendientes.length} ${r.response} · ${e.message}`, 'e');
              }
            }
          };
          await Promise.all(Array.from({ length: Math.min(A_LA_VEZ, pendientes.length) }, (_, h) => obrero(h)));
          if (S.abortar) log('■ Abortado.', 'w');
          log(`✓ ${bien} de ${pendientes.length} resueltas en la ficha`, bien === pendientes.length ? 'o' : 'w');
        }
        marcar('pasada 4');
        try { M.ficheros.forEach(f => f && f.remove()); M.ficheros = []; } catch (e) {}

        S.filas = componer(mapa, log);
        const conRfx = S.filas.filter(f => f.RFx).length;
        const conPo  = S.filas.filter(f => f.PO).length;
        const sinSrv = S.filas.filter(f => f.Servicio === 'Pendiente').length;
        const sinResp = S.filas.filter(f => f.Servicio === 'sin respuesta').length;
        log(`\n${S.filas.length} respuestas · ${conRfx} con RFx · ${conPo} con PO`
          + ` · ${sinSrv} sin servicio`
          + (sinResp ? ` · ${sinResp} aún sin respuesta` : '')
          + ` · ${((Date.now()-t0)/1000).toFixed(0)} s`, 'o');
        log('   Reparto del tiempo: ' + Object.entries(crono).map(([k, v]) => `${k} ${v} s`).join(' · '));
        if (avisos.length) {
          log('⚠ El listado puede estar INCOMPLETO:', 'e');
          for (const a of avisos) log('   · ' + a, 'e');
        }
        if (S.filas.some(f => f['Visto en'] !== 'ambas'))
          log('Nota: las dos pantallas no siempre devuelven lo mismo. La columna «Visto en» dice de dónde salió cada fila.', 'w');
      } catch (e) {
        log('✗ ' + e.message, 'e');
      } finally {
        M.destruir();
        S.corriendo = false;
        $('rGo').disabled = false; $('rStop').style.display = 'none';
        pintar();
      }
    };

    $('rCsv').onclick = () => {
      const d = $('rD').value.trim(), h = $('rH').value.trim();
      descargar(aCSV(S.filas), `respuestas_${d}_a_${h}.csv`);
      log('CSV descargado.', 'o');
    };

    ui = { panel, fondo, estilo, log, pintar };
    pintar();
  }

  function lanzador() {
    if (document.getElementById('aatRespLauncher')) return;
    const b = document.createElement('button');
    b.id = 'aatRespLauncher';
    b.type = 'button';
    b.title = 'Listar las respuestas enviadas de un periodo';
    b.innerHTML = '<img src="' + LOGO_AAT + '" alt="AAT" style="height:18px;width:auto;display:block" ' +
      'onerror="this.style.display=\'none\'"><span style="width:1px;height:16px;background:rgba(255,255,255,.35)"></span>' +
      '<span>Listar respuestas</span>';
    b.style.cssText = 'position:fixed;right:20px;bottom:76px;z-index:2147483645;display:flex;align-items:center;' +
      'gap:9px;padding:9px 16px 9px 12px;background:#1668dc;color:#fff;border:0;border-radius:24px;cursor:pointer;' +
      'font:600 14px/1 system-ui,Segoe UI,sans-serif;box-shadow:0 6px 18px rgba(22,104,220,.35)';
    b.onclick = abrir;
    document.body.appendChild(b);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', lanzador);
  else lanzador();

  window.__AAT_RESP = { abrir, M, S, VERSION, PANTALLAS, componer, aCSV, servicioDeLineas, ITEMS };
})();
