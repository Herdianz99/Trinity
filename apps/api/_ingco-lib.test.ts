import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  cleanCode,
  buildProductUrl,
  extractTitle,
  extractDescription,
  extractImageUrl,
  parseIngcoPage,
  WADFOW_BASE,
} from './_ingco-lib';

// Fixtures basados en el HTML real de ingco.com/ve
const HTML_OK = `
<title data-react-helmet="true"> Accesorios Cincel SDS Plus DBC0112501 - INGCO Venezuela</title>
<div class="parameter-content">14X250mm, puntiagudo  <br>Embalado por percha de plástico</div>
<script>window.g_initialProps = {"data":{"productExtNo":"DBC0112501","productPicList":["https:\\u002F\\u002Fres-de.togroup.com\\u002Fstc\\u002Fhome_product\\u002Fingco\\u002Fuserfiles\\u002F1\\u002Fimages\\u002Fphoto\\u002F20260101\\u002FDBC0112501.jpg"]}}</script>
`;

// Página de un modelo inexistente: título vacío, sin datos de producto
const HTML_EMPTY = `
<title data-react-helmet="true"></title>
<div id="app"></div>
`;

test('cleanCode recorta espacios y no altera prefijos', () => {
  assert.equal(cleanCode('  UPLM6001 '), 'UPLM6001');
  assert.equal(cleanCode('ING-UFC13018'), 'ING-UFC13018');
});

test('buildProductUrl arma la URL con slug cosmético', () => {
  assert.equal(buildProductUrl('DBC0112501'), 'https://www.ingco.com/ve/product/x/DBC0112501');
  assert.equal(buildProductUrl(' HTC04601 '), 'https://www.ingco.com/ve/product/x/HTC04601');
});

test('buildProductUrl acepta base alterna (WADFOW, misma plataforma)', () => {
  assert.equal(buildProductUrl('WYH1325', WADFOW_BASE), 'https://www.wadfow.com/ve/product/x/WYH1325');
});

test('extractTitle devuelve el nombre sin sufijo, o null si vacío', () => {
  assert.equal(extractTitle(HTML_OK), 'Accesorios Cincel SDS Plus DBC0112501');
  assert.equal(extractTitle(HTML_EMPTY), null);
});

test('extractDescription convierte <br> en saltos y limpia', () => {
  assert.equal(extractDescription(HTML_OK), '14X250mm, puntiagudo\nEmbalado por percha de plástico');
  assert.equal(extractDescription(HTML_EMPTY), null);
});

test('extractImageUrl desescapa \\u002F y devuelve la URL del CDN', () => {
  assert.equal(
    extractImageUrl(HTML_OK),
    'https://res-de.togroup.com/stc/home_product/ingco/userfiles/1/images/photo/20260101/DBC0112501.jpg',
  );
  assert.equal(extractImageUrl(HTML_EMPTY), null);
});

test('parseIngcoPage devuelve null si el título está vacío (no-match)', () => {
  assert.equal(parseIngcoPage(HTML_EMPTY), null);
  const p = parseIngcoPage(HTML_OK);
  assert.ok(p);
  assert.equal(p!.title, 'Accesorios Cincel SDS Plus DBC0112501');
  assert.equal(p!.description, '14X250mm, puntiagudo\nEmbalado por percha de plástico');
  assert.match(p!.imageUrl!, /DBC0112501\.jpg$/);
});
