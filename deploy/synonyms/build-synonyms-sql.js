// Genera el SQL de la carga inicial de sinonimos (deploy/synonyms/initial-synonyms.json).
// Uso:  node deploy/synonyms/build-synonyms-sql.js > /tmp/synonyms.sql
//       psql <db> -v ON_ERROR_STOP=1 -f /tmp/synonyms.sql
// - Las reglas entran INACTIVAS (pendientes): no cambian ninguna busqueda hasta activarlas en la pantalla.
// - Las categorias se resuelven por nombre en la BD destino. Si una regla lista categorias y NINGUNA existe
//   en esa empresa, la regla se omite (si no, quedaria aplicando a todas las categorias).
// - Idempotente: no duplica una regla con los mismos matchTerms + terms.
const fs = require('fs');
const path = require('path');

const { rules } = JSON.parse(fs.readFileSync(path.join(__dirname, 'initial-synonyms.json'), 'utf8'));
const lit = (s) => `'${String(s).replace(/'/g, "''")}'`;
const arr = (xs) => `ARRAY[${xs.map(lit).join(', ')}]::text[]`;

const out = ['BEGIN;'];
for (const r of rules) {
  const cats = r.categories || [];
  const catIds = cats.length
    ? `ARRAY(SELECT id FROM "Category" WHERE name = ANY(${arr(cats)}) ORDER BY name)`
    : `ARRAY[]::text[]`;
  out.push(`INSERT INTO "SearchSynonym" (id, terms, "matchTerms", "categoryIds", "isActive", notes, "createdAt", "updatedAt")
SELECT 'syn' || substr(md5(random()::text || clock_timestamp()::text), 1, 22), ${arr(r.terms)}, ${lit(r.matchTerms)}, ${catIds}, false, ${r.notes ? lit(r.notes) : 'NULL'}, now(), now()
WHERE (${cats.length} = 0 OR EXISTS (SELECT 1 FROM "Category" WHERE name = ANY(${arr(cats)})))
  AND NOT EXISTS (SELECT 1 FROM "SearchSynonym" WHERE "matchTerms" = ${lit(r.matchTerms)} AND terms = ${arr(r.terms)});`);
}
out.push(`SELECT count(*) AS reglas_totales, count(*) FILTER (WHERE NOT "isActive") AS pendientes FROM "SearchSynonym";`);
out.push('COMMIT;');
process.stdout.write(out.join('\n') + '\n');
