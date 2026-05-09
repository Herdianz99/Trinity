import { PrismaClient, UserRole, IvaType } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // --- Company Config ---
  await prisma.companyConfig.upsert({
    where: { id: 'singleton' },
    update: {},
    create: {
      id: 'singleton',
      companyName: 'Inversiones El Trebol',
      exchangeRate: 0,
      bregaGlobalPct: 0,
      invoicePrefix: 'FAC',
    },
  });
  console.log('CompanyConfig created');

  // --- Users ---
  const adminPassword = await bcrypt.hash('Admin1234!', 10);
  const sellerPassword = await bcrypt.hash('Seller1234!', 10);
  const cashierPassword = await bcrypt.hash('Cashier1234!', 10);

  await prisma.user.upsert({
    where: { email: 'admin@trinity.com' },
    update: {},
    create: {
      name: 'Administrador',
      email: 'admin@trinity.com',
      password: adminPassword,
      role: UserRole.ADMIN,
      mustChangePassword: false,
    },
  });

  await prisma.user.upsert({
    where: { email: 'seller@trinity.com' },
    update: {},
    create: {
      name: 'Vendedor Demo',
      email: 'seller@trinity.com',
      password: sellerPassword,
      role: UserRole.SELLER,
      mustChangePassword: false,
    },
  });

  await prisma.user.upsert({
    where: { email: 'cashier@trinity.com' },
    update: {},
    create: {
      name: 'Cajero Demo',
      email: 'cashier@trinity.com',
      password: cashierPassword,
      role: UserRole.CASHIER,
      mustChangePassword: false,
    },
  });
  console.log('Users created');

  // --- Cash Registers ---
  await prisma.cashRegister.upsert({
    where: { code: '01' },
    update: {},
    create: { code: '01', name: 'Caja 1' },
  });
  await prisma.cashRegister.upsert({
    where: { code: '02' },
    update: {},
    create: { code: '02', name: 'Caja 2' },
  });
  console.log('Cash registers created');

  // --- Warehouse ---
  const warehouse = await prisma.warehouse.upsert({
    where: { id: 'default-warehouse' },
    update: {},
    create: {
      id: 'default-warehouse',
      name: 'Almacen Principal',
      location: 'Sede principal',
      isDefault: true,
    },
  });
  console.log('Warehouse created');

  // --- Categories ---
  const catHerramientas = await prisma.category.create({
    data: {
      name: 'Herramientas',
      children: {
        create: [
          { name: 'Herramientas Manuales' },
          { name: 'Herramientas Electricas' },
        ],
      },
    },
  });

  const catPinturas = await prisma.category.create({
    data: {
      name: 'Pinturas',
      children: {
        create: [
          { name: 'Pinturas de Interior' },
          { name: 'Pinturas de Exterior' },
        ],
      },
    },
  });

  const catElectricidad = await prisma.category.create({
    data: {
      name: 'Electricidad',
      children: {
        create: [
          { name: 'Cables' },
          { name: 'Interruptores' },
        ],
      },
    },
  });

  const catPlomeria = await prisma.category.create({
    data: {
      name: 'Plomeria',
      children: {
        create: [
          { name: 'Tuberias' },
          { name: 'Accesorios de Bano' },
        ],
      },
    },
  });

  const catFerreteria = await prisma.category.create({
    data: {
      name: 'Ferreteria General',
      children: {
        create: [
          { name: 'Tornillos y Clavos' },
          { name: 'Cerraduras' },
        ],
      },
    },
  });
  console.log('Categories created');

  // --- Brands ---
  const brandStanley = await prisma.brand.create({ data: { name: 'Stanley' } });
  const brandDeWalt = await prisma.brand.create({ data: { name: 'DeWalt' } });
  const brandTruper = await prisma.brand.create({ data: { name: 'Truper' } });
  console.log('Brands created');

  // --- Suppliers ---
  const supplier1 = await prisma.supplier.create({
    data: {
      name: 'Distribuidora Ferretera Nacional',
      rif: 'J-12345678-9',
      phone: '+58 212 555 1234',
      email: 'ventas@dfn.com',
      contactName: 'Carlos Rodriguez',
    },
  });

  const supplier2 = await prisma.supplier.create({
    data: {
      name: 'Importadora de Herramientas CA',
      rif: 'J-98765432-1',
      phone: '+58 212 555 5678',
      email: 'pedidos@ihca.com',
      contactName: 'Maria Gonzalez',
      isRetentionAgent: true,
    },
  });
  console.log('Suppliers created');

  // --- Products ---
  const bregaPct = 0; // bregaGlobalPct from config
  const ivaRates: Record<IvaType, number> = {
    EXEMPT: 0,
    REDUCED: 0.08,
    GENERAL: 0.16,
    SPECIAL: 0.31,
  };

  function calcPrices(costUsd: number, gananciaPct: number, gananciaMayorPct: number, ivaType: IvaType, bregaApplies: boolean) {
    const brecha = bregaApplies ? bregaPct : 0;
    const iva = ivaRates[ivaType];
    const priceDetal = costUsd * (1 + brecha / 100) * (1 + gananciaPct / 100) * (1 + iva);
    const priceMayor = costUsd * (1 + brecha / 100) * (1 + gananciaMayorPct / 100) * (1 + iva);
    return { priceDetal: Math.round(priceDetal * 100) / 100, priceMayor: Math.round(priceMayor * 100) / 100 };
  }

  const productsData = [
    { code: 'PROD-001', name: 'Martillo Stanley 16oz', costUsd: 12, gananciaPct: 35, gananciaMayorPct: 20, ivaType: IvaType.GENERAL, brandId: brandStanley.id, categoryId: catHerramientas.id, supplierId: supplier1.id },
    { code: 'PROD-002', name: 'Destornillador Phillips #2', costUsd: 5, gananciaPct: 40, gananciaMayorPct: 25, ivaType: IvaType.GENERAL, brandId: brandStanley.id, categoryId: catHerramientas.id, supplierId: supplier1.id },
    { code: 'PROD-003', name: 'Taladro DeWalt 20V', costUsd: 89, gananciaPct: 30, gananciaMayorPct: 18, ivaType: IvaType.GENERAL, brandId: brandDeWalt.id, categoryId: catHerramientas.id, supplierId: supplier2.id },
    { code: 'PROD-004', name: 'Pintura Latex Blanca 1GL', costUsd: 15, gananciaPct: 25, gananciaMayorPct: 15, ivaType: IvaType.GENERAL, categoryId: catPinturas.id, supplierId: supplier1.id },
    { code: 'PROD-005', name: 'Cable THHN 12AWG (metro)', costUsd: 0.8, gananciaPct: 50, gananciaMayorPct: 30, ivaType: IvaType.GENERAL, categoryId: catElectricidad.id, supplierId: supplier2.id, saleUnit: 'METER' },
    { code: 'PROD-006', name: 'Tubo PVC 1/2" x 3m', costUsd: 3.5, gananciaPct: 35, gananciaMayorPct: 22, ivaType: IvaType.GENERAL, categoryId: catPlomeria.id, supplierId: supplier1.id },
    { code: 'PROD-007', name: 'Cerradura Yale Doble Cilindro', costUsd: 25, gananciaPct: 30, gananciaMayorPct: 18, ivaType: IvaType.GENERAL, categoryId: catFerreteria.id, supplierId: supplier2.id },
    { code: 'PROD-008', name: 'Cinta Metrica Truper 5m', costUsd: 4, gananciaPct: 45, gananciaMayorPct: 28, ivaType: IvaType.GENERAL, brandId: brandTruper.id, categoryId: catHerramientas.id, supplierId: supplier1.id },
    { code: 'PROD-009', name: 'Interruptor Sencillo Blanco', costUsd: 1.5, gananciaPct: 60, gananciaMayorPct: 40, ivaType: IvaType.GENERAL, categoryId: catElectricidad.id, supplierId: supplier2.id },
    { code: 'PROD-010', name: 'Llave de Paso 1/2"', costUsd: 6, gananciaPct: 35, gananciaMayorPct: 20, ivaType: IvaType.GENERAL, categoryId: catPlomeria.id, supplierId: supplier1.id },
    // Session 2 - 5 additional test products
    { code: 'PROD-011', name: 'Sierra Circular DeWalt 7-1/4"', costUsd: 75, gananciaPct: 28, gananciaMayorPct: 15, ivaType: IvaType.GENERAL, brandId: brandDeWalt.id, categoryId: catHerramientas.id, supplierId: supplier2.id },
    { code: 'PROD-012', name: 'Brocha Atlas 4 pulgadas', costUsd: 3, gananciaPct: 55, gananciaMayorPct: 35, ivaType: IvaType.EXEMPT, categoryId: catPinturas.id, supplierId: supplier1.id },
    { code: 'PROD-013', name: 'Tomacorriente Doble Blanco', costUsd: 2.5, gananciaPct: 65, gananciaMayorPct: 45, ivaType: IvaType.REDUCED, categoryId: catElectricidad.id, supplierId: supplier2.id },
    { code: 'PROD-014', name: 'Llave Ajustable Truper 10"', costUsd: 8, gananciaPct: 40, gananciaMayorPct: 25, ivaType: IvaType.GENERAL, brandId: brandTruper.id, categoryId: catHerramientas.id, supplierId: supplier1.id },
    { code: 'PROD-015', name: 'Silicona Transparente 280ml', costUsd: 4.5, gananciaPct: 50, gananciaMayorPct: 30, ivaType: IvaType.SPECIAL, categoryId: catFerreteria.id, supplierId: supplier2.id },
  ];

  for (const p of productsData) {
    const prices = calcPrices(p.costUsd, p.gananciaPct, p.gananciaMayorPct, p.ivaType, true);
    await prisma.product.create({
      data: {
        code: p.code,
        name: p.name,
        costUsd: p.costUsd,
        gananciaPct: p.gananciaPct,
        gananciaMayorPct: p.gananciaMayorPct,
        ivaType: p.ivaType,
        priceDetal: prices.priceDetal,
        priceMayor: prices.priceMayor,
        brandId: p.brandId,
        categoryId: p.categoryId,
        supplierId: p.supplierId,
        saleUnit: (p as any).saleUnit || 'UNIT',
        minStock: 5,
        stock: {
          create: {
            warehouseId: warehouse.id,
            quantity: Math.floor(Math.random() * 100) + 10,
          },
        },
      },
    });
  }
  console.log('Products created with stock');

  console.log('Seed completed successfully!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
