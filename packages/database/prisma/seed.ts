import { PrismaClient, UserRole, IvaType, DynamicKeyPerm } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('=== LIMPIANDO BASE DE DATOS ===');

  // Delete in dependency order (most dependent first)
  // Audit & logs
  await prisma.dynamicKeyLog.deleteMany();
  await prisma.priceAdjustmentLog.deleteMany();

  // Receipts (depend on receivables, payables, notes)
  await prisma.receiptPayment.deleteMany();
  await prisma.receiptItem.deleteMany();
  await prisma.receipt.deleteMany();

  // Receivables
  await prisma.receivablePayment.deleteMany();
  await prisma.receivable.deleteMany();

  // Payables & scheduling
  await prisma.paymentScheduleItem.deleteMany();
  await prisma.paymentSchedule.deleteMany();
  await prisma.payablePayment.deleteMany();
  await prisma.payable.deleteMany();

  // Credit/Debit notes
  await prisma.creditDebitNoteItem.deleteMany();
  await prisma.creditDebitNote.deleteMany();

  // Invoices
  await prisma.printJob.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.invoiceItem.deleteMany();
  await prisma.invoice.deleteMany();

  // Quotations
  await prisma.quotationItem.deleteMany();
  await prisma.quotation.deleteMany();

  // Cash sessions
  await prisma.cashSession.deleteMany();

  // Purchases
  await prisma.purchaseOrderItem.deleteMany();
  await prisma.purchaseOrder.deleteMany();

  // Inventory operations
  await prisma.inventoryCountItem.deleteMany();
  await prisma.inventoryCount.deleteMany();
  await prisma.transferItem.deleteMany();
  await prisma.transfer.deleteMany();
  await prisma.stockMovement.deleteMany();
  await prisma.stock.deleteMany();

  // Expenses
  await prisma.expense.deleteMany();
  await prisma.expenseCategory.deleteMany();

  // Products & catalog
  await prisma.product.deleteMany();
  await prisma.seller.deleteMany();
  await prisma.customer.deleteMany();

  // Dynamic keys
  await prisma.dynamicKeyPermission.deleteMany();
  await prisma.dynamicKey.deleteMany();

  // Infrastructure
  await prisma.cashRegister.deleteMany();
  // Payment methods: children first
  await prisma.paymentMethod.deleteMany({ where: { parentId: { not: null } } });
  await prisma.paymentMethod.deleteMany();

  // Categories: children first
  await prisma.category.deleteMany({ where: { parentId: { not: null } } });
  await prisma.category.deleteMany();
  await prisma.brand.deleteMany();
  await prisma.supplier.deleteMany();
  await prisma.warehouse.deleteMany();
  await prisma.printArea.deleteMany();

  // Auth
  await prisma.userPermission.deleteMany();
  await prisma.rolePermission.deleteMany();
  await prisma.exchangeRate.deleteMany();
  await prisma.user.deleteMany();

  // Config
  await prisma.companyConfig.deleteMany();

  console.log('Base de datos limpia');

  // ============================================
  // COMPANY CONFIG
  // ============================================
  await prisma.companyConfig.create({
    data: {
      id: 'singleton',
      companyName: 'Inversiones El Trebol C.A.',
      rif: 'J-40123456-7',
      address: 'Av. Principal de Los Teques, Centro Comercial El Trebol, Local 5, Los Teques, Miranda',
      phone: '+58 212 321 4567',
      email: 'ventas@eltrebol.com',
      bregaGlobalPct: 0,
      defaultGananciaPct: 35,
      defaultGananciaMayorPct: 20,
      invoicePrefix: 'FAC',
      quotationValidityDays: 15,
      overdueWarningDays: 3,
      ivaRetentionPct: 75,
      islrRetentionPct: 0,
      isIGTFContributor: true,
      igtfPct: 3,
      allowNegativeStock: false,
    },
  });
  console.log('CompanyConfig creada');

  // ============================================
  // USERS
  // ============================================
  const hash = (pw: string) => bcrypt.hash(pw, 10);

  const admin = await prisma.user.create({
    data: {
      name: 'Carlos Rodriguez',
      email: 'admin@trinity.com',
      password: await hash('Admin1234!'),
      role: UserRole.ADMIN,
      mustChangePassword: false,
    },
  });

  const supervisor = await prisma.user.create({
    data: {
      name: 'Maria Gonzalez',
      email: 'supervisor@trinity.com',
      password: await hash('Super1234!'),
      role: UserRole.SUPERVISOR,
      mustChangePassword: false,
    },
  });

  const cashier1 = await prisma.user.create({
    data: {
      name: 'Ana Martinez',
      email: 'cajera1@trinity.com',
      password: await hash('Cajera1234!'),
      role: UserRole.CASHIER,
      mustChangePassword: false,
    },
  });

  const cashier2 = await prisma.user.create({
    data: {
      name: 'Luis Hernandez',
      email: 'cajero2@trinity.com',
      password: await hash('Cajero1234!'),
      role: UserRole.CASHIER,
      mustChangePassword: false,
    },
  });

  const seller1 = await prisma.user.create({
    data: {
      name: 'Pedro Sanchez',
      email: 'vendedor1@trinity.com',
      password: await hash('Vende1234!'),
      role: UserRole.SELLER,
      mustChangePassword: false,
    },
  });

  const seller2 = await prisma.user.create({
    data: {
      name: 'Rosa Perez',
      email: 'vendedor2@trinity.com',
      password: await hash('Vende1234!'),
      role: UserRole.SELLER,
      mustChangePassword: false,
    },
  });

  const warehouseUser = await prisma.user.create({
    data: {
      name: 'Jorge Ramirez',
      email: 'almacen@trinity.com',
      password: await hash('Almacen1234!'),
      role: UserRole.WAREHOUSE,
      mustChangePassword: false,
    },
  });

  const buyer = await prisma.user.create({
    data: {
      name: 'Carmen Lopez',
      email: 'compras@trinity.com',
      password: await hash('Compras1234!'),
      role: UserRole.BUYER,
      mustChangePassword: false,
    },
  });

  const accountant = await prisma.user.create({
    data: {
      name: 'Fernando Torres',
      email: 'contabilidad@trinity.com',
      password: await hash('Conta1234!'),
      role: UserRole.ACCOUNTANT,
      mustChangePassword: false,
    },
  });

  console.log('9 Usuarios creados');

  // ============================================
  // ROLE PERMISSIONS
  // ============================================
  const rolePermissionsData = [
    { role: UserRole.ADMIN, modules: ['*'] },
    { role: UserRole.SUPERVISOR, modules: ['dashboard', 'sales', 'quotations', 'catalog', 'inventory', 'purchases', 'cash', 'receivables', 'payables', 'fiscal', 'expenses', 'reports'] },
    { role: UserRole.CASHIER, modules: ['dashboard', 'sales', 'quotations', 'cash', 'receivables'] },
    { role: UserRole.SELLER, modules: ['dashboard', 'sales', 'quotations'] },
    { role: UserRole.WAREHOUSE, modules: ['dashboard', 'inventory', 'purchases'] },
    { role: UserRole.BUYER, modules: ['dashboard', 'catalog', 'purchases', 'payables'] },
    { role: UserRole.ACCOUNTANT, modules: ['dashboard', 'receivables', 'payables', 'fiscal', 'expenses', 'reports'] },
    { role: UserRole.AUDITOR, modules: ['dashboard', 'reports', 'fiscal'] },
  ];

  for (const rp of rolePermissionsData) {
    await prisma.rolePermission.create({ data: { role: rp.role, modules: rp.modules } });
  }
  console.log('Permisos de rol creados');

  // ============================================
  // EXCHANGE RATE (today)
  // ============================================
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  await prisma.exchangeRate.create({
    data: {
      rate: 78.50,
      date: today,
      source: 'BCV',
      createdById: admin.id,
    },
  });
  console.log('Tasa de cambio creada: 78.50 Bs/$');

  // ============================================
  // PRINT AREAS
  // ============================================
  const printAreaDespacho = await prisma.printArea.create({
    data: { name: 'Despacho General', description: 'Area de despacho principal' },
  });
  const printAreaPintura = await prisma.printArea.create({
    data: { name: 'Despacho Pinturas', description: 'Area de despacho de pinturas y solventes' },
  });
  console.log('2 Areas de impresion creadas');

  // ============================================
  // WAREHOUSES
  // ============================================
  const whPrincipal = await prisma.warehouse.create({
    data: {
      id: 'default-warehouse',
      name: 'Almacen Principal',
      location: 'Planta baja, area trasera',
      isDefault: true,
    },
  });
  const whSecundario = await prisma.warehouse.create({
    data: {
      name: 'Almacen Secundario',
      location: 'Galpon anexo',
      isDefault: false,
    },
  });
  console.log('2 Almacenes creados');

  // ============================================
  // CATEGORIES (with codes for auto product codes)
  // ============================================
  const catHerramientas = await prisma.category.create({
    data: {
      name: 'Herramientas',
      code: 'HER',
      printAreaId: printAreaDespacho.id,
      children: {
        create: [
          { name: 'Herramientas Manuales', commissionPct: 5 },
          { name: 'Herramientas Electricas', commissionPct: 3 },
          { name: 'Herramientas de Medicion', commissionPct: 4 },
        ],
      },
    },
    include: { children: true },
  });

  const catPinturas = await prisma.category.create({
    data: {
      name: 'Pinturas y Acabados',
      code: 'PIN',
      printAreaId: printAreaPintura.id,
      children: {
        create: [
          { name: 'Pinturas de Interior', commissionPct: 4 },
          { name: 'Pinturas de Exterior', commissionPct: 4 },
          { name: 'Solventes y Diluyentes', commissionPct: 3 },
          { name: 'Accesorios de Pintura', commissionPct: 5 },
        ],
      },
    },
    include: { children: true },
  });

  const catElectricidad = await prisma.category.create({
    data: {
      name: 'Electricidad',
      code: 'ELE',
      printAreaId: printAreaDespacho.id,
      children: {
        create: [
          { name: 'Cables y Conductores', commissionPct: 3 },
          { name: 'Interruptores y Tomacorrientes', commissionPct: 5 },
          { name: 'Iluminacion', commissionPct: 4 },
          { name: 'Tableros y Breakers', commissionPct: 3 },
        ],
      },
    },
    include: { children: true },
  });

  const catPlomeria = await prisma.category.create({
    data: {
      name: 'Plomeria',
      code: 'PLO',
      printAreaId: printAreaDespacho.id,
      children: {
        create: [
          { name: 'Tuberias y Conexiones', commissionPct: 3 },
          { name: 'Griferia y Llaves', commissionPct: 5 },
          { name: 'Accesorios de Bano', commissionPct: 4 },
        ],
      },
    },
    include: { children: true },
  });

  const catFerreteria = await prisma.category.create({
    data: {
      name: 'Ferreteria General',
      code: 'FER',
      printAreaId: printAreaDespacho.id,
      children: {
        create: [
          { name: 'Tornilleria y Fijacion', commissionPct: 3 },
          { name: 'Cerraduras y Seguridad', commissionPct: 5 },
          { name: 'Adhesivos y Selladores', commissionPct: 4 },
          { name: 'Abrasivos', commissionPct: 3 },
        ],
      },
    },
    include: { children: true },
  });

  const catConstruccion = await prisma.category.create({
    data: {
      name: 'Construccion',
      code: 'CON',
      printAreaId: printAreaDespacho.id,
      children: {
        create: [
          { name: 'Cementos y Morteros', commissionPct: 2 },
          { name: 'Impermeabilizantes', commissionPct: 4 },
        ],
      },
    },
    include: { children: true },
  });

  const catJardin = await prisma.category.create({
    data: {
      name: 'Jardineria',
      code: 'JAR',
      printAreaId: printAreaDespacho.id,
      children: {
        create: [
          { name: 'Herramientas de Jardin', commissionPct: 5 },
          { name: 'Mangueras y Riego', commissionPct: 4 },
        ],
      },
    },
    include: { children: true },
  });

  console.log('7 Categorias padre + 22 subcategorias creadas');

  // ============================================
  // BRANDS
  // ============================================
  const brands: Record<string, any> = {};
  const brandNames = [
    'Stanley', 'DeWalt', 'Truper', 'Black+Decker', 'Bosch',
    'Makita', 'Milwaukee', 'Montana', 'Kem', 'Sherwin Williams',
    'Pavco', 'Tigre', 'Phillips', 'Sylvania', 'Yale',
    'EPE', 'Norton', 'Loctite', 'Pretul', 'Viceroy',
  ];
  for (const name of brandNames) {
    brands[name] = await prisma.brand.create({ data: { name } });
  }
  console.log(`${brandNames.length} Marcas creadas`);

  // ============================================
  // SUPPLIERS
  // ============================================
  const sup1 = await prisma.supplier.create({
    data: {
      name: 'Distribuidora Ferretera Nacional C.A.',
      rif: 'J-12345678-9',
      phone: '+58 212 555 1234',
      email: 'ventas@dfn.com.ve',
      address: 'Zona Industrial La Yaguara, Caracas',
      contactName: 'Roberto Mendez',
      isRetentionAgent: false,
    },
  });
  const sup2 = await prisma.supplier.create({
    data: {
      name: 'Importadora de Herramientas C.A.',
      rif: 'J-98765432-1',
      phone: '+58 212 555 5678',
      email: 'pedidos@ihca.com.ve',
      address: 'Av. Intercomunal, Guarenas, Miranda',
      contactName: 'Gabriela Fernandez',
      isRetentionAgent: true,
    },
  });
  const sup3 = await prisma.supplier.create({
    data: {
      name: 'Pinturas Montana de Venezuela',
      rif: 'J-30111222-0',
      phone: '+58 212 555 9012',
      email: 'distribuidores@montana.com.ve',
      address: 'Zona Industrial San Vicente, Maracay',
      contactName: 'Andres Villegas',
      isRetentionAgent: true,
    },
  });
  const sup4 = await prisma.supplier.create({
    data: {
      name: 'Materiales Electricos del Centro',
      rif: 'J-40222333-5',
      phone: '+58 241 555 3456',
      email: 'ventas@mecentro.com.ve',
      address: 'Av. Bolivar Norte, Valencia, Carabobo',
      contactName: 'Diana Castillo',
      isRetentionAgent: false,
    },
  });
  const sup5 = await prisma.supplier.create({
    data: {
      name: 'Plomeria Industrial Venezolana',
      rif: 'J-50333444-8',
      phone: '+58 212 555 7890',
      email: 'info@plomindustrial.com.ve',
      address: 'Calle Comercio, La Victoria, Aragua',
      contactName: 'Miguel Acosta',
      isRetentionAgent: false,
    },
  });
  console.log('5 Proveedores creados');

  // ============================================
  // PAYMENT METHODS
  // ============================================
  const pmCashUsd = await prisma.paymentMethod.create({
    data: { id: 'pm_cash_usd', name: 'Efectivo USD', isDivisa: true, sortOrder: 1 },
  });
  const pmCashBs = await prisma.paymentMethod.create({
    data: { id: 'pm_cash_bs', name: 'Efectivo Bs', isDivisa: false, sortOrder: 2 },
  });
  const pmPdv = await prisma.paymentMethod.create({
    data: { id: 'pm_punto_venta', name: 'Punto de Venta', isDivisa: false, sortOrder: 3 },
  });
  const pmPagoMovil = await prisma.paymentMethod.create({
    data: { id: 'pm_pago_movil', name: 'Pago Movil', isDivisa: false, sortOrder: 4 },
  });
  const pmZelle = await prisma.paymentMethod.create({
    data: { id: 'pm_zelle', name: 'Zelle', isDivisa: true, sortOrder: 5 },
  });
  const pmTransferencia = await prisma.paymentMethod.create({
    data: { id: 'pm_transferencia', name: 'Transferencia', isDivisa: false, sortOrder: 6 },
  });
  const pmCashea = await prisma.paymentMethod.create({
    data: { id: 'pm_cashea', name: 'Cashea', isDivisa: true, createsReceivable: true, sortOrder: 7 },
  });
  const pmCrediagro = await prisma.paymentMethod.create({
    data: { id: 'pm_crediagro', name: 'Crediagro', isDivisa: true, createsReceivable: true, sortOrder: 8 },
  });
  const pmSaldoFavor = await prisma.paymentMethod.create({
    data: { id: 'pm_saldo_favor', name: 'Saldo a Favor', isDivisa: false, sortOrder: 99, isActive: true },
  });

  // Sub-methods: Punto de Venta
  await prisma.paymentMethod.createMany({
    data: [
      { id: 'pm_pdv_banesco', name: 'Punto de Venta Banesco', fiscalCode: 'PDB', sortOrder: 1, parentId: 'pm_punto_venta' },
      { id: 'pm_pdv_mercantil', name: 'Punto de Venta Mercantil', fiscalCode: 'PDM', sortOrder: 2, parentId: 'pm_punto_venta' },
      { id: 'pm_pdv_provincial', name: 'Punto de Venta Provincial', fiscalCode: 'PDP', sortOrder: 3, parentId: 'pm_punto_venta' },
    ],
  });

  // Sub-methods: Pago Movil
  await prisma.paymentMethod.createMany({
    data: [
      { id: 'pm_pm_banesco', name: 'Pago Movil Banesco', fiscalCode: 'PMB', sortOrder: 1, parentId: 'pm_pago_movil' },
      { id: 'pm_pm_mercantil', name: 'Pago Movil Mercantil', fiscalCode: 'PMM', sortOrder: 2, parentId: 'pm_pago_movil' },
    ],
  });
  console.log('8 Metodos de pago + 5 sub-metodos creados');

  // ============================================
  // CASH REGISTERS
  // ============================================
  await prisma.cashRegister.create({ data: { code: '01', name: 'Caja Notas', isFiscal: false } });
  await prisma.cashRegister.create({ data: { code: '02', name: 'Fiscal 1', isFiscal: true } });
  await prisma.cashRegister.create({ data: { code: '03', name: 'Fiscal 2', isFiscal: true } });
  console.log('3 Cajas registradoras creadas');

  // ============================================
  // SELLERS
  // ============================================
  await prisma.seller.create({
    data: { code: 'VEN-001', name: 'Pedro Sanchez', phone: '+58 414 111 2233', userId: seller1.id },
  });
  await prisma.seller.create({
    data: { code: 'VEN-002', name: 'Rosa Perez', phone: '+58 424 222 3344', userId: seller2.id },
  });
  await prisma.seller.create({
    data: { code: 'VEN-003', name: 'Daniel Rojas', phone: '+58 412 333 4455' },
  });
  console.log('3 Vendedores creados');

  // ============================================
  // EXPENSE CATEGORIES
  // ============================================
  await prisma.expenseCategory.createMany({
    data: [
      { name: 'Servicios Publicos', description: 'Electricidad, agua, telefono, internet', isDefault: true },
      { name: 'Alquiler', description: 'Alquiler del local comercial' },
      { name: 'Nomina', description: 'Sueldos, salarios y prestaciones' },
      { name: 'Transporte', description: 'Fletes, envios y combustible' },
      { name: 'Mantenimiento', description: 'Reparaciones y mantenimiento del local' },
      { name: 'Suministros de Oficina', description: 'Papeleria, toner, materiales de oficina' },
      { name: 'Impuestos y Tasas', description: 'Impuestos municipales, patentes' },
      { name: 'Varios', description: 'Gastos no clasificados' },
    ],
  });
  console.log('8 Categorias de gastos creadas');

  // ============================================
  // CUSTOMERS (default customer first)
  // ============================================
  const defaultCustomer = await prisma.customer.create({
    data: {
      name: '***CLIENTE FINAL***',
      documentType: 'V',
      rif: '00000000',
      isDefault: true,
    },
  });

  // Update CompanyConfig with default customer
  await prisma.companyConfig.update({
    where: { id: 'singleton' },
    data: { defaultCustomerId: defaultCustomer.id },
  });

  await prisma.customer.createMany({
    data: [
      { name: 'Constructora ABC C.A.', documentType: 'J', rif: 'J-41234567-0', phone: '+58 212 444 1111', email: 'compras@constABC.com', address: 'Caracas, Dtto. Capital', creditLimit: 5000, creditDays: 30 },
      { name: 'Juan Perez', documentType: 'V', rif: 'V-12345678', phone: '+58 414 555 6677', email: 'juanperez@gmail.com' },
      { name: 'Ferreteria El Vecino', documentType: 'J', rif: 'J-30456789-2', phone: '+58 241 666 7788', email: 'elvecino@gmail.com', address: 'Valencia, Carabobo', creditLimit: 3000, creditDays: 15 },
      { name: 'Maria Fernandez', documentType: 'V', rif: 'V-98765432', phone: '+58 424 888 9900' },
      { name: 'Inversiones Delta C.A.', documentType: 'J', rif: 'J-20567890-1', phone: '+58 212 111 2233', email: 'admin@invdelta.com', address: 'Los Teques, Miranda', creditLimit: 10000, creditDays: 30 },
      { name: 'Plomeria Express', documentType: 'J', rif: 'J-50678901-3', phone: '+58 412 222 3344', creditLimit: 2000, creditDays: 15 },
      { name: 'Roberto Diaz', documentType: 'V', rif: 'V-11223344', phone: '+58 414 333 4455' },
      { name: 'Electricistas Asociados', documentType: 'J', rif: 'J-40789012-5', phone: '+58 241 444 5566', email: 'info@electasoc.com', creditLimit: 4000, creditDays: 30 },
      { name: 'Contratista General Cliente', documentType: 'E', rif: 'E-84567890', phone: '+58 412 999 0011' },
      { name: 'Gobierno Municipal Los Teques', documentType: 'G', rif: 'G-20000001-0', phone: '+58 212 555 0000', address: 'Alcaldia Los Teques', creditLimit: 20000, creditDays: 45 },
    ],
  });
  console.log('11 Clientes creados (incluye CLIENTE FINAL por defecto)');

  // ============================================
  // DYNAMIC KEY (master authorization key)
  // ============================================
  const masterKeyHash = await bcrypt.hash('1234', 10);
  const masterKey = await prisma.dynamicKey.create({
    data: {
      name: 'Clave Maestra',
      keyHash: masterKeyHash,
      isActive: true,
      createdById: admin.id,
      permissions: {
        create: Object.values(DynamicKeyPerm).map((perm) => ({ permission: perm })),
      },
    },
  });
  console.log('Clave dinamica maestra creada (clave: 1234)');

  // ============================================
  // PRODUCTS (catalog with stock, no transactions)
  // ============================================
  const ivaRates: Record<IvaType, number> = {
    EXEMPT: 0,
    REDUCED: 0.08,
    GENERAL: 0.16,
    SPECIAL: 0.31,
  };

  function calcPrices(costUsd: number, gananciaPct: number, gananciaMayorPct: number, ivaType: IvaType) {
    const iva = ivaRates[ivaType];
    const priceDetal = costUsd * (1 + gananciaPct / 100) * (1 + iva);
    const priceMayor = costUsd * (1 + gananciaMayorPct / 100) * (1 + iva);
    return {
      priceDetal: Math.round(priceDetal * 100) / 100,
      priceMayor: Math.round(priceMayor * 100) / 100,
    };
  }

  // Helper to get subcategory by name
  const subcat = (parent: any, name: string) => parent.children.find((c: any) => c.name === name)!;

  const productsData = [
    // === HERRAMIENTAS MANUALES ===
    { name: 'Martillo Stanley 16oz', costUsd: 12, gPct: 35, gMPct: 20, iva: IvaType.GENERAL, brandId: brands['Stanley'].id, categoryId: subcat(catHerramientas, 'Herramientas Manuales').id, supplierId: sup1.id, minStock: 10, stock: 45 },
    { name: 'Destornillador Phillips #2 Stanley', costUsd: 5, gPct: 40, gMPct: 25, iva: IvaType.GENERAL, brandId: brands['Stanley'].id, categoryId: subcat(catHerramientas, 'Herramientas Manuales').id, supplierId: sup1.id, minStock: 15, stock: 60 },
    { name: 'Alicate Universal 8" Truper', costUsd: 7, gPct: 38, gMPct: 22, iva: IvaType.GENERAL, brandId: brands['Truper'].id, categoryId: subcat(catHerramientas, 'Herramientas Manuales').id, supplierId: sup2.id, minStock: 10, stock: 35 },
    { name: 'Juego de Llaves Allen (9pcs) Stanley', costUsd: 9, gPct: 35, gMPct: 20, iva: IvaType.GENERAL, brandId: brands['Stanley'].id, categoryId: subcat(catHerramientas, 'Herramientas Manuales').id, supplierId: sup1.id, minStock: 8, stock: 25 },
    { name: 'Llave Ajustable 10" Truper', costUsd: 8, gPct: 40, gMPct: 25, iva: IvaType.GENERAL, brandId: brands['Truper'].id, categoryId: subcat(catHerramientas, 'Herramientas Manuales').id, supplierId: sup2.id, minStock: 10, stock: 30 },
    { name: 'Serrucho 20" Pretul', costUsd: 6, gPct: 42, gMPct: 28, iva: IvaType.GENERAL, brandId: brands['Pretul'].id, categoryId: subcat(catHerramientas, 'Herramientas Manuales').id, supplierId: sup2.id, minStock: 8, stock: 20 },

    // === HERRAMIENTAS ELECTRICAS ===
    { name: 'Taladro Percutor DeWalt 20V', costUsd: 89, gPct: 30, gMPct: 18, iva: IvaType.GENERAL, brandId: brands['DeWalt'].id, categoryId: subcat(catHerramientas, 'Herramientas Electricas').id, supplierId: sup2.id, minStock: 3, stock: 8 },
    { name: 'Esmeril Angular 4-1/2" Bosch', costUsd: 45, gPct: 32, gMPct: 20, iva: IvaType.GENERAL, brandId: brands['Bosch'].id, categoryId: subcat(catHerramientas, 'Herramientas Electricas').id, supplierId: sup2.id, minStock: 3, stock: 6 },
    { name: 'Sierra Circular 7-1/4" DeWalt', costUsd: 75, gPct: 28, gMPct: 15, iva: IvaType.GENERAL, brandId: brands['DeWalt'].id, categoryId: subcat(catHerramientas, 'Herramientas Electricas').id, supplierId: sup2.id, minStock: 2, stock: 5 },
    { name: 'Lijadora Orbital Black+Decker', costUsd: 35, gPct: 35, gMPct: 22, iva: IvaType.GENERAL, brandId: brands['Black+Decker'].id, categoryId: subcat(catHerramientas, 'Herramientas Electricas').id, supplierId: sup2.id, minStock: 3, stock: 7 },

    // === HERRAMIENTAS DE MEDICION ===
    { name: 'Cinta Metrica 5m Truper', costUsd: 4, gPct: 45, gMPct: 28, iva: IvaType.GENERAL, brandId: brands['Truper'].id, categoryId: subcat(catHerramientas, 'Herramientas de Medicion').id, supplierId: sup1.id, minStock: 15, stock: 50 },
    { name: 'Nivel de Burbuja 24" Stanley', costUsd: 15, gPct: 38, gMPct: 22, iva: IvaType.GENERAL, brandId: brands['Stanley'].id, categoryId: subcat(catHerramientas, 'Herramientas de Medicion').id, supplierId: sup1.id, minStock: 5, stock: 18 },

    // === PINTURAS ===
    { name: 'Pintura Latex Interior Blanca Montana 1GL', costUsd: 15, gPct: 25, gMPct: 15, iva: IvaType.GENERAL, brandId: brands['Montana'].id, categoryId: subcat(catPinturas, 'Pinturas de Interior').id, supplierId: sup3.id, minStock: 20, stock: 60 },
    { name: 'Pintura Latex Interior Hueso Montana 1GL', costUsd: 15, gPct: 25, gMPct: 15, iva: IvaType.GENERAL, brandId: brands['Montana'].id, categoryId: subcat(catPinturas, 'Pinturas de Interior').id, supplierId: sup3.id, minStock: 15, stock: 40 },
    { name: 'Pintura Latex Exterior Blanca Montana 1GL', costUsd: 22, gPct: 28, gMPct: 18, iva: IvaType.GENERAL, brandId: brands['Montana'].id, categoryId: subcat(catPinturas, 'Pinturas de Exterior').id, supplierId: sup3.id, minStock: 12, stock: 35 },
    { name: 'Esmalte Sintetico Kem Rojo 1/4GL', costUsd: 8, gPct: 35, gMPct: 20, iva: IvaType.GENERAL, brandId: brands['Kem'].id, categoryId: subcat(catPinturas, 'Pinturas de Exterior').id, supplierId: sup3.id, minStock: 10, stock: 28 },
    { name: 'Thinner Corriente 1L', costUsd: 3, gPct: 40, gMPct: 25, iva: IvaType.GENERAL, categoryId: subcat(catPinturas, 'Solventes y Diluyentes').id, supplierId: sup3.id, minStock: 20, stock: 50 },
    { name: 'Brocha 4" Pelo de Caballo', costUsd: 3, gPct: 55, gMPct: 35, iva: IvaType.EXEMPT, categoryId: subcat(catPinturas, 'Accesorios de Pintura').id, supplierId: sup1.id, minStock: 20, stock: 45 },
    { name: 'Rodillo 9" con Felpa', costUsd: 5, gPct: 50, gMPct: 30, iva: IvaType.EXEMPT, categoryId: subcat(catPinturas, 'Accesorios de Pintura').id, supplierId: sup1.id, minStock: 15, stock: 30 },

    // === ELECTRICIDAD ===
    { name: 'Cable THHN 12AWG Rojo (metro)', costUsd: 0.8, gPct: 50, gMPct: 30, iva: IvaType.GENERAL, brandId: brands['EPE'].id, categoryId: subcat(catElectricidad, 'Cables y Conductores').id, supplierId: sup4.id, minStock: 200, stock: 500, saleUnit: 'METER' },
    { name: 'Cable THHN 12AWG Negro (metro)', costUsd: 0.8, gPct: 50, gMPct: 30, iva: IvaType.GENERAL, brandId: brands['EPE'].id, categoryId: subcat(catElectricidad, 'Cables y Conductores').id, supplierId: sup4.id, minStock: 200, stock: 500, saleUnit: 'METER' },
    { name: 'Cable THHN 10AWG Verde (metro)', costUsd: 1.2, gPct: 45, gMPct: 28, iva: IvaType.GENERAL, brandId: brands['EPE'].id, categoryId: subcat(catElectricidad, 'Cables y Conductores').id, supplierId: sup4.id, minStock: 100, stock: 300, saleUnit: 'METER' },
    { name: 'Interruptor Sencillo Blanco', costUsd: 1.5, gPct: 60, gMPct: 40, iva: IvaType.GENERAL, categoryId: subcat(catElectricidad, 'Interruptores y Tomacorrientes').id, supplierId: sup4.id, minStock: 30, stock: 80 },
    { name: 'Interruptor Doble Blanco', costUsd: 2.5, gPct: 55, gMPct: 35, iva: IvaType.GENERAL, categoryId: subcat(catElectricidad, 'Interruptores y Tomacorrientes').id, supplierId: sup4.id, minStock: 20, stock: 50 },
    { name: 'Tomacorriente Doble Blanco', costUsd: 2, gPct: 58, gMPct: 38, iva: IvaType.GENERAL, categoryId: subcat(catElectricidad, 'Interruptores y Tomacorrientes').id, supplierId: sup4.id, minStock: 25, stock: 60 },
    { name: 'Bombillo LED 9W Luz Blanca Sylvania', costUsd: 2.5, gPct: 50, gMPct: 30, iva: IvaType.GENERAL, brandId: brands['Sylvania'].id, categoryId: subcat(catElectricidad, 'Iluminacion').id, supplierId: sup4.id, minStock: 30, stock: 100 },
    { name: 'Bombillo LED 12W Luz Calida Sylvania', costUsd: 3, gPct: 48, gMPct: 28, iva: IvaType.GENERAL, brandId: brands['Sylvania'].id, categoryId: subcat(catElectricidad, 'Iluminacion').id, supplierId: sup4.id, minStock: 25, stock: 80 },
    { name: 'Breaker 1x20A', costUsd: 5, gPct: 45, gMPct: 28, iva: IvaType.GENERAL, categoryId: subcat(catElectricidad, 'Tableros y Breakers').id, supplierId: sup4.id, minStock: 15, stock: 40 },

    // === PLOMERIA ===
    { name: 'Tubo PVC 1/2" x 3m Pavco', costUsd: 3.5, gPct: 35, gMPct: 22, iva: IvaType.GENERAL, brandId: brands['Pavco'].id, categoryId: subcat(catPlomeria, 'Tuberias y Conexiones').id, supplierId: sup5.id, minStock: 30, stock: 80 },
    { name: 'Tubo PVC 3/4" x 3m Pavco', costUsd: 4.5, gPct: 33, gMPct: 20, iva: IvaType.GENERAL, brandId: brands['Pavco'].id, categoryId: subcat(catPlomeria, 'Tuberias y Conexiones').id, supplierId: sup5.id, minStock: 25, stock: 60 },
    { name: 'Codo PVC 1/2" x 90 Pavco', costUsd: 0.3, gPct: 70, gMPct: 45, iva: IvaType.GENERAL, brandId: brands['Pavco'].id, categoryId: subcat(catPlomeria, 'Tuberias y Conexiones').id, supplierId: sup5.id, minStock: 100, stock: 300 },
    { name: 'Tee PVC 1/2" Pavco', costUsd: 0.4, gPct: 65, gMPct: 40, iva: IvaType.GENERAL, brandId: brands['Pavco'].id, categoryId: subcat(catPlomeria, 'Tuberias y Conexiones').id, supplierId: sup5.id, minStock: 80, stock: 250 },
    { name: 'Llave de Paso 1/2" Bronce', costUsd: 6, gPct: 35, gMPct: 20, iva: IvaType.GENERAL, categoryId: subcat(catPlomeria, 'Griferia y Llaves').id, supplierId: sup5.id, minStock: 10, stock: 25 },
    { name: 'Grifo Lavaplatos Sencillo Cromado', costUsd: 12, gPct: 40, gMPct: 25, iva: IvaType.GENERAL, categoryId: subcat(catPlomeria, 'Griferia y Llaves').id, supplierId: sup5.id, minStock: 5, stock: 15 },
    { name: 'Regadera con Manguera Cromada', costUsd: 8, gPct: 45, gMPct: 28, iva: IvaType.GENERAL, categoryId: subcat(catPlomeria, 'Accesorios de Bano').id, supplierId: sup5.id, minStock: 5, stock: 12 },
    { name: 'Teflon 1/2" x 10m', costUsd: 0.5, gPct: 80, gMPct: 50, iva: IvaType.EXEMPT, categoryId: subcat(catPlomeria, 'Tuberias y Conexiones').id, supplierId: sup5.id, minStock: 50, stock: 200 },

    // === FERRETERIA GENERAL ===
    { name: 'Tornillo Drywall 6x1" (100pcs)', costUsd: 2, gPct: 60, gMPct: 40, iva: IvaType.GENERAL, categoryId: subcat(catFerreteria, 'Tornilleria y Fijacion').id, supplierId: sup1.id, minStock: 30, stock: 100 },
    { name: 'Clavo 2" sin Cabeza (1kg)', costUsd: 3, gPct: 45, gMPct: 28, iva: IvaType.GENERAL, categoryId: subcat(catFerreteria, 'Tornilleria y Fijacion').id, supplierId: sup1.id, minStock: 20, stock: 50 },
    { name: 'Tarugo Plastico 5/16" (100pcs)', costUsd: 1.5, gPct: 70, gMPct: 45, iva: IvaType.GENERAL, categoryId: subcat(catFerreteria, 'Tornilleria y Fijacion').id, supplierId: sup1.id, minStock: 40, stock: 120 },
    { name: 'Cerradura Yale Doble Cilindro', costUsd: 25, gPct: 30, gMPct: 18, iva: IvaType.GENERAL, brandId: brands['Yale'].id, categoryId: subcat(catFerreteria, 'Cerraduras y Seguridad').id, supplierId: sup2.id, minStock: 5, stock: 12 },
    { name: 'Candado Yale 40mm', costUsd: 8, gPct: 40, gMPct: 25, iva: IvaType.GENERAL, brandId: brands['Yale'].id, categoryId: subcat(catFerreteria, 'Cerraduras y Seguridad').id, supplierId: sup2.id, minStock: 10, stock: 25 },
    { name: 'Silicona Transparente 280ml Loctite', costUsd: 4.5, gPct: 50, gMPct: 30, iva: IvaType.GENERAL, brandId: brands['Loctite'].id, categoryId: subcat(catFerreteria, 'Adhesivos y Selladores').id, supplierId: sup1.id, minStock: 10, stock: 30 },
    { name: 'Pega Loca 3g Loctite', costUsd: 1.5, gPct: 65, gMPct: 42, iva: IvaType.GENERAL, brandId: brands['Loctite'].id, categoryId: subcat(catFerreteria, 'Adhesivos y Selladores').id, supplierId: sup1.id, minStock: 20, stock: 60 },
    { name: 'Lija de Agua #150 Norton', costUsd: 0.6, gPct: 75, gMPct: 50, iva: IvaType.EXEMPT, brandId: brands['Norton'].id, categoryId: subcat(catFerreteria, 'Abrasivos').id, supplierId: sup1.id, minStock: 50, stock: 150 },
    { name: 'Disco de Corte 4-1/2" x 1mm Norton', costUsd: 1.2, gPct: 60, gMPct: 38, iva: IvaType.GENERAL, brandId: brands['Norton'].id, categoryId: subcat(catFerreteria, 'Abrasivos').id, supplierId: sup1.id, minStock: 20, stock: 80 },

    // === CONSTRUCCION ===
    { name: 'Cemento Portland Tipo I 42.5kg', costUsd: 6, gPct: 20, gMPct: 10, iva: IvaType.EXEMPT, categoryId: subcat(catConstruccion, 'Cementos y Morteros').id, supplierId: sup1.id, minStock: 20, stock: 50 },
    { name: 'Sika 1 Impermeabilizante 1L', costUsd: 5, gPct: 40, gMPct: 25, iva: IvaType.GENERAL, categoryId: subcat(catConstruccion, 'Impermeabilizantes').id, supplierId: sup1.id, minStock: 10, stock: 30 },

    // === JARDINERIA ===
    { name: 'Pala de Punta Truper', costUsd: 10, gPct: 35, gMPct: 20, iva: IvaType.GENERAL, brandId: brands['Truper'].id, categoryId: subcat(catJardin, 'Herramientas de Jardin').id, supplierId: sup2.id, minStock: 5, stock: 15 },
    { name: 'Manguera de Jardin 1/2" x 15m', costUsd: 12, gPct: 38, gMPct: 22, iva: IvaType.GENERAL, categoryId: subcat(catJardin, 'Mangueras y Riego').id, supplierId: sup5.id, minStock: 5, stock: 12 },
  ];

  // Track lastProductNumber per category code
  const categoryCounters: Record<string, number> = {};

  for (const p of productsData) {
    const prices = calcPrices(p.costUsd, p.gPct, p.gMPct, p.iva);

    // Find the parent category code for auto product code
    const cat = await prisma.category.findUnique({ where: { id: p.categoryId }, include: { parent: true } });
    const parentCode = cat?.parent?.code || cat?.code || 'GEN';
    if (!categoryCounters[parentCode]) categoryCounters[parentCode] = 0;
    categoryCounters[parentCode]++;
    const productCode = `${parentCode}${String(categoryCounters[parentCode]).padStart(5, '0')}`;

    await prisma.product.create({
      data: {
        code: productCode,
        name: p.name,
        costUsd: p.costUsd,
        gananciaPct: p.gPct,
        gananciaMayorPct: p.gMPct,
        ivaType: p.iva,
        priceDetal: prices.priceDetal,
        priceMayor: prices.priceMayor,
        brandId: p.brandId,
        categoryId: p.categoryId,
        supplierId: p.supplierId,
        saleUnit: (p as any).saleUnit || 'UNIT',
        minStock: p.minStock,
        stock: {
          create: {
            warehouseId: whPrincipal.id,
            quantity: p.stock,
          },
        },
      },
    });
  }

  // Update category lastProductNumber counters
  for (const [code, count] of Object.entries(categoryCounters)) {
    await prisma.category.update({ where: { code }, data: { lastProductNumber: count } });
  }

  console.log(`${productsData.length} Productos creados con stock`);

  // ============================================
  // SUMMARY
  // ============================================
  console.log('\n=== SEED COMPLETADO ===');
  console.log('CompanyConfig: Inversiones El Trebol C.A.');
  console.log('Usuarios: 9 (admin/supervisor/2 cajeros/2 vendedores/almacen/compras/contabilidad)');
  console.log('Tasa del dia: 78.50 Bs/$');
  console.log('Areas de impresion: 2');
  console.log('Almacenes: 2');
  console.log('Categorias: 7 padre + 22 sub');
  console.log('Marcas: 20');
  console.log('Proveedores: 5');
  console.log('Metodos de pago: 8 + 5 sub');
  console.log('Cajas: 3');
  console.log('Vendedores: 3');
  console.log('Categorias de gasto: 8');
  console.log('Clientes: 10');
  console.log('Clave dinamica: 1 (clave: 1234)');
  console.log(`Productos: ${productsData.length} con stock inicial`);
  console.log('\n--- Credenciales ---');
  console.log('admin@trinity.com / Admin1234!');
  console.log('supervisor@trinity.com / Super1234!');
  console.log('cajera1@trinity.com / Cajera1234!');
  console.log('cajero2@trinity.com / Cajero1234!');
  console.log('vendedor1@trinity.com / Vende1234!');
  console.log('vendedor2@trinity.com / Vende1234!');
  console.log('almacen@trinity.com / Almacen1234!');
  console.log('compras@trinity.com / Compras1234!');
  console.log('contabilidad@trinity.com / Conta1234!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
