import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateSynonymDto, PreviewSynonymDto, UpdateSynonymDto } from './dto/search-synonym.dto';

type Tx = Prisma.TransactionClient;
type RuleShape = { matchTerms: string; categoryIds: string[] };

const PREVIEW_LIMIT = 200;

// Sinonimos de busqueda. Una regla activa agrega sus "terms" al Product.searchKeywords (y por el
// trigger, al searchVector) de los productos cuyo NOMBRE contiene "matchTerms" en sus categorias.
// La logica de coincidencia vive en SQL (product_search_normalize / product_synonym_keywords,
// migracion 20261011120000_search_synonyms); aqui se usa la misma expresion para la vista previa.
@Injectable()
export class SearchSynonymsService {
  constructor(private prisma: PrismaService) {}

  // Condicion SQL "el producto cumple la regla" (misma que product_synonym_keywords) sobre una fila
  // x con columnas "categoryId" y v = to_tsvector('simple', product_search_normalize(name)).
  private matchSql(rule: RuleShape) {
    const cats = rule.categoryIds ?? [];
    return Prisma.sql`
      (cardinality(${cats}::text[]) = 0 OR x."categoryId" = ANY(${cats}::text[]))
      AND x.v @@ plainto_tsquery('simple', product_search_normalize(${rule.matchTerms}))`;
  }

  private cleanTerms(terms: string[]): string[] {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const t of terms) {
      const v = t.replace(/[,\s]+/g, ' ').trim();
      const key = v.toLowerCase();
      if (v && !seen.has(key)) {
        seen.add(key);
        out.push(v);
      }
    }
    return out;
  }

  // matchTerms debe dejar al menos una palabra util ("con", "de" solas son palabras vacias).
  private async assertMatchTerms(matchTerms: string) {
    const [row] = await this.prisma.$queryRaw<{ n: number }[]>`
      SELECT numnode(plainto_tsquery('simple', product_search_normalize(${matchTerms})))::int AS n`;
    if (!row || row.n === 0) {
      throw new BadRequestException('Las palabras del producto no sirven para buscar (use palabras del nombre, ej. "barra resalte")');
    }
  }

  async findAll(status?: string, search?: string) {
    const where: Prisma.SearchSynonymWhereInput = {};
    if (status === 'pending') where.isActive = false;
    if (status === 'active') where.isActive = true;
    const rules = await this.prisma.searchSynonym.findMany({
      where,
      orderBy: [{ isActive: 'asc' }, { createdAt: 'asc' }],
      include: { createdBy: { select: { name: true } } },
    });
    const q = (search || '').trim().toLowerCase();
    const filtered = q
      ? rules.filter((r) => r.matchTerms.toLowerCase().includes(q) || r.terms.some((t) => t.toLowerCase().includes(q)))
      : rules;

    // Cantidad de productos activos que cumple cada regla (activa o no), en una sola pasada.
    const ids = filtered.map((r) => r.id);
    const counts = ids.length
      ? await this.prisma.$queryRaw<{ id: string; n: number }[]>`
          WITH p AS MATERIALIZED (
            SELECT id, "categoryId", to_tsvector('simple', product_search_normalize(name)) AS v
            FROM "Product" WHERE "isActive"
          )
          SELECT s.id, COUNT(p.id)::int AS n
          FROM "SearchSynonym" s
          LEFT JOIN p ON (cardinality(s."categoryIds") = 0 OR p."categoryId" = ANY(s."categoryIds"))
                     AND p.v @@ plainto_tsquery('simple', product_search_normalize(s."matchTerms"))
          WHERE s.id = ANY(${ids}::text[])
          GROUP BY s.id`
      : [];
    const countMap = new Map(counts.map((c) => [c.id, c.n]));

    const categories = await this.prisma.category.findMany({ select: { id: true, name: true } });
    const catName = new Map(categories.map((c) => [c.id, c.name]));

    return filtered.map((r) => ({
      ...r,
      categories: r.categoryIds.map((id) => ({ id, name: catName.get(id) ?? '(categoria borrada)' })),
      productCount: countMap.get(r.id) ?? 0,
    }));
  }

  async preview(dto: PreviewSynonymDto) {
    const matchTerms = (dto.matchTerms || '').trim();
    if (!matchTerms) return { total: 0, items: [] };
    await this.assertMatchTerms(matchTerms);
    const rule = { matchTerms, categoryIds: dto.categoryIds ?? [] };
    const rows = await this.prisma.$queryRaw<{ id: string; code: string; name: string; category: string | null; total: number }[]>`
      WITH x AS MATERIALIZED (
        SELECT id, code, name, "categoryId", to_tsvector('simple', product_search_normalize(name)) AS v
        FROM "Product" WHERE "isActive"
      )
      SELECT x.id, x.code, x.name, c.name AS category, COUNT(*) OVER ()::int AS total
      FROM x
      LEFT JOIN "Category" c ON c.id = x."categoryId"
      WHERE ${this.matchSql(rule)}
      ORDER BY x.name
      LIMIT ${PREVIEW_LIMIT}`;
    return {
      total: rows[0]?.total ?? 0,
      items: rows.map(({ total, ...r }) => r),
    };
  }

  async create(dto: CreateSynonymDto, userId: string) {
    const terms = this.cleanTerms(dto.terms);
    if (terms.length === 0) throw new BadRequestException('Indique al menos una palabra del cliente');
    const matchTerms = dto.matchTerms.trim();
    await this.assertMatchTerms(matchTerms);
    return this.prisma.$transaction(async (tx) => {
      const rule = await tx.searchSynonym.create({
        data: {
          terms,
          matchTerms,
          categoryIds: dto.categoryIds ?? [],
          notes: dto.notes?.trim() || null,
          isActive: dto.isActive ?? false,
          createdById: userId,
        },
      });
      if (rule.isActive) await this.refreshKeywords(tx, [rule]);
      return rule;
    });
  }

  async update(id: string, dto: UpdateSynonymDto) {
    const old = await this.prisma.searchSynonym.findUnique({ where: { id } });
    if (!old) throw new NotFoundException('Sinonimo no encontrado');
    const data: Prisma.SearchSynonymUpdateInput = {};
    if (dto.terms !== undefined) {
      const terms = this.cleanTerms(dto.terms);
      if (terms.length === 0) throw new BadRequestException('Indique al menos una palabra del cliente');
      data.terms = terms;
    }
    if (dto.matchTerms !== undefined) {
      data.matchTerms = dto.matchTerms.trim();
      await this.assertMatchTerms(data.matchTerms);
    }
    if (dto.categoryIds !== undefined) data.categoryIds = dto.categoryIds;
    if (dto.notes !== undefined) data.notes = dto.notes?.trim() || null;
    if (dto.isActive !== undefined) data.isActive = dto.isActive;

    return this.prisma.$transaction(async (tx) => {
      const rule = await tx.searchSynonym.update({ where: { id }, data });
      // Los productos que cumplian la version vieja (pierden palabras) y los que cumplen la nueva.
      if (old.isActive || rule.isActive) await this.refreshKeywords(tx, [old, rule]);
      return rule;
    });
  }

  async remove(id: string) {
    const old = await this.prisma.searchSynonym.findUnique({ where: { id } });
    if (!old) throw new NotFoundException('Sinonimo no encontrado');
    await this.prisma.$transaction(async (tx) => {
      await tx.searchSynonym.delete({ where: { id } });
      if (old.isActive) await this.refreshKeywords(tx, [old]);
    });
    return { ok: true };
  }

  async setActive(ids: string[], isActive: boolean) {
    const rules = await this.prisma.searchSynonym.findMany({
      where: { id: { in: ids }, isActive: !isActive },
    });
    if (rules.length === 0) return { updated: 0 };
    await this.prisma.$transaction(
      async (tx) => {
        await tx.searchSynonym.updateMany({ where: { id: { in: rules.map((r) => r.id) } }, data: { isActive } });
        await this.refreshKeywords(tx, rules);
      },
      { timeout: 60_000 },
    );
    return { updated: rules.length };
  }

  // Recalcula Product.searchKeywords de los productos (activos o no) que cumplen alguna de las reglas
  // dadas; el trigger rearma el searchVector. Solo escribe los que cambian (no toca updatedAt).
  private async refreshKeywords(tx: Tx, rules: RuleShape[]) {
    const conds = rules.map((r) => Prisma.sql`(${this.matchSql(r)})`);
    await tx.$executeRaw`
      WITH x AS MATERIALIZED (
        SELECT id, name, "categoryId", to_tsvector('simple', product_search_normalize(name)) AS v
        FROM "Product"
      ),
      t AS (
        SELECT x.id, product_synonym_keywords(x.name, x."categoryId") AS kw
        FROM x WHERE ${Prisma.join(conds, ' OR ')}
      )
      UPDATE "Product" p SET "searchKeywords" = t.kw
      FROM t
      WHERE p.id = t.id AND p."searchKeywords" IS DISTINCT FROM t.kw`;
  }
}
