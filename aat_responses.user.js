// ==UserScript==
// @name         AAT · Listar respuestas (Connected Supplier)
// @namespace    https://aatconsultoria.com/
// @version      1.3.2
// @description  Saca a CSV todas las Submitted Responses de un periodo, con su RFx, su PO y su importe, leyéndolas del propio portal. No hace falta el Power BI.
// @author       AAT CONSULTORIA DE PROYECTOS SL
// @match        https://appcodeplatform.ericsson.net/ConnectedSupplier*
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

  const VERSION = '1.3.2';
  const LOGO_AAT = 'https://aatconsultoria.com/wp-content/uploads/2021/07/AAT_Logo_White.png';

  const ESPERA_CARGA  = 45000;
  const ESPERA_BUSCAR = 60000;
  const ESPERA_PAGINA = 45000;
  const PAUSA_PAGINA  = 400;
  const MAX_POR_TRAMO = 150;      // 10 páginas de 15
  const MAX_PROF      = 7;

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
  const limpiar  = s => String(s || '').replace(/\s+/g, ' ').trim();

  // ── Las dos pantallas del portal ──────────────────────────────────────────────────
  const PANTALLAS = {
    respuestas: {
      nombre: 'Submitted Responses',
      ruta: '/ConnectedSupplier_Requests/SubmittedResponses_List.aspx',
      tabla: 'table[id$="wtSubmittedResponseTable"]',
      fechas: d => [porEtiqueta(d, 'Creation Date From'), porEtiqueta(d, 'Creation Date To')],
      preparar: null,
      leer(tds) {
        const [siteId, ...site] = limpiar(tds[0]).split(' ');
        const celda1 = limpiar(tds[1]).split(' ');
        const resp = celda1[0] || '';
        return {
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
        log && log('  Document type = Response');
        return true;
      },
      leer(tds) {
        const [siteId, ...site] = limpiar(tds[0]).split(' ');
        return {
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

  // ── Motor: un iframe oculto del propio portal ─────────────────────────────────────
  const M = {
    frame: null, pantalla: null,
    get doc() { return M.frame?.contentDocument || null; },
    get win() { return M.frame?.contentWindow || null; },

    destruir() {
      document.querySelectorAll('iframe[data-aat-resp]').forEach(f => f.remove());
      M.frame = null;
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
        await dormir(400);
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

    extraer() {
      const t = M.tabla();
      if (!t) return [];
      const filas = [];
      for (const tr of t.querySelectorAll('tr')) {
        const tds = [...tr.querySelectorAll('td')].map(td => td.innerText || '');
        if (tds.length < 5) continue;
        const f = M.pantalla.leer(tds);
        if (f && (f.response || f.rfx)) filas.push(f);
      }
      return filas;
    }
  };

  // ── Recorrer una pantalla entera, partiendo el rango si hace falta ────────────────
  async function recorrer(pantalla, desde, hasta, log, acumulado, avisos, prof = 0, numeros = null) {
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
    let listo = false;
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
      if (pantalla.preparar && M.tipoPuesto() !== 'Response') {
        await pantalla.preparar(M.doc, log);
        await M.quieto(600, 6000);
      }

      if (numeros && pantalla.campoNumeros) {
        if (!await M.fijarNumeros(numeros, log)) {
          log(`  reintento la preparación de filtros (${intento})`, 'w');
          continue;
        }
        await M.quieto(600, 6000);
      }

      const tipoMal = pantalla.preparar && M.tipoPuesto() !== 'Response';
      const campo   = numeros && pantalla.campoNumeros ? pantalla.campoNumeros(M.doc) : null;
      const numsMal = numeros && pantalla.campoNumeros &&
                      (!campo || limpiar(campo.value) !== numeros.join(','));
      if (tipoMal || numsMal) {
        log(`  los filtros no se sostuvieron (${tipoMal ? 'tipo=' + M.tipoPuesto() : 'números'}); repito (${intento})`, 'w');
        continue;
      }
      listo = true;
    }
    if (!listo) throw new Error('no consigo dejar los filtros puestos');

    await M.buscar(log);

    const total = M.total();

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
      await recorrer(pantalla, desde, medio, log, acumulado, avisos, prof + 1);
      await recorrer(pantalla, sumarDias(medio, 1), hasta, log, acumulado, avisos, prof + 1);
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
  const COLUMNAS = ['Creación','Operador','Proyecto','Site ID','Site','RFx','Request name',
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

  function componer(mapa) {
    const filas = [];
    for (const r of mapa.values()) {
      const nombre = r.reqNombre || r.respNombre || '';
      const visto = (r.creacion ? 'R' : '') + (r.rfx ? 'A' : '');
      filas.push({
        'Creación':     r.creacion || '',
        'Operador':     operador(nombre),
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
        <div><label>Creación desde</label><input type="text" id="rD" value="${haceDias(30)}"></div>
        <div><label>Creación hasta</label><input type="text" id="rH" value="${hoy()}"></div>
        <button class="b p" id="rGo">Listar respuestas</button>
        <button class="b r" id="rStop" style="display:none">Abortar</button>
        <span style="flex:1"></span>
        <button class="b g" id="rCsv" disabled>Descargar CSV</button>
      </div>
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
        '<table><thead><tr>' + ['Creación','Operador','Proyecto','RFx','Response','PO','Importe','Estado']
          .map(c => `<th>${c}</th>`).join('') + '</tr></thead><tbody>' +
        muestra.map(f => '<tr>' + ['Creación','Operador','Proyecto','RFx','Response','PO','Importe','Estado']
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

    $('rGo').onclick = async () => {
      const desde = $('rD').value.trim(), hasta = $('rH').value.trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(desde) || !/^\d{4}-\d{2}-\d{2}$/.test(hasta))
        return log('✗ Las fechas van en formato AAAA-MM-DD.', 'e');
      if (desde > hasta) return log('✗ El «desde» es posterior al «hasta».', 'e');

      S.corriendo = true; S.abortar = false; S.filas = [];
      $('rGo').disabled = true; $('rCsv').disabled = true; $('rStop').style.display = '';
      caja.innerHTML = `▶ ${desde} → ${hasta}`;
      const mapa = new Map(), avisos = [];
      const t0 = Date.now();

      try {
        log('── 1 de 3 · Submitted Responses (fecha de creación) ──');
        await recorrer(PANTALLAS.respuestas, desde, hasta, log, mapa, avisos);
        const soloR = mapa.size;
        log(`✓ ${soloR} respuestas`, 'o');

        if (!S.abortar) {
          log('── 2 de 3 · Request, Response and PO (RFx y PO) ──');
          await recorrer(PANTALLAS.avanzada, desde, hasta, log, mapa, avisos);
          log(`✓ cruce hecho · ${mapa.size} filas en total`, 'o');
        }

        if (!S.abortar) {
          const sinRfx = [...mapa.values()].filter(r => r.response && !r.rfx).map(r => r.response);
          if (sinRfx.length) {
            log(`── 3 de 3 · ${sinRfx.length} respuestas sin RFx: las busco por número ──`);
            log('   (son respuestas de este periodo sobre peticiones más antiguas)');
            await rescatarPorNumero(sinRfx, desde, hasta, log, mapa, avisos);
            const quedan = [...mapa.values()].filter(r => r.response && !r.rfx).length;
            log(quedan ? `✓ rescatadas ${sinRfx.length - quedan}; ${quedan} siguen sin RFx`
                       : `✓ rescatadas las ${sinRfx.length}`, quedan ? 'w' : 'o');
          } else {
            log('── 3 de 3 · todas tienen RFx, no hace falta rescate ──', 'o');
          }
        }

        S.filas = componer(mapa);
        const conRfx = S.filas.filter(f => f.RFx).length;
        const conPo  = S.filas.filter(f => f.PO).length;
        log(`\n${S.filas.length} respuestas · ${conRfx} con RFx · ${conPo} con PO · ${((Date.now()-t0)/1000).toFixed(0)} s`, 'o');
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

  window.__AAT_RESP = { abrir, M, S, VERSION, PANTALLAS, componer, aCSV };
})();
