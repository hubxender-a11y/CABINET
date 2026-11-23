import {
  BadRequestException,
  ConflictException,
  Injectable,
  PayloadTooLargeException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';

const backupFormat = 'cabinet-transparency-backup';
const backupVersion = 1;
const bytesMarker = '__cabinetTransparencyBytesBase64';
const maximumBackupBytes = 30 * 1024 * 1024;
const maximumRecordsPerTable = 100_000;

const backupTables = [
  'branches',
  'customers',
  'customerDocuments',
  'suppliers',
  'productCategories',
  'products',
  'services',
  'warehouses',
  'stockMovements',
  'fixedAssets',
  'fixedAssetMovements',
  'archiveBinders',
  'archiveDocuments',
  'quotes',
  'quoteItems',
  'salesOrders',
  'invoices',
  'invoiceItems',
  'invoiceTaxes',
  'creditNotes',
  'payments',
  'paymentAllocations',
  'expenses',
  'cashVouchers',
  'cashAccounts',
  'cashMovements',
  'paymentOrders',
  'paymentOrderAttachments',
  'purchases',
  'purchaseItems',
  'currencies',
  'exchangeRates',
  'taxSettings',
  'fiscalDevices',
  'fiscalTransactions',
  'transmissionLogs',
] as const;

type BackupTable = (typeof backupTables)[number];
type BackupRows = Record<BackupTable, Record<string, unknown>[]>;
const delegateNames: Record<BackupTable, string> = {
  branches: 'branch',
  customers: 'customer',
  customerDocuments: 'customerDocument',
  suppliers: 'supplier',
  productCategories: 'productCategory',
  products: 'product',
  services: 'service',
  warehouses: 'warehouse',
  stockMovements: 'stockMovement',
  fixedAssets: 'fixedAsset',
  fixedAssetMovements: 'fixedAssetMovement',
  archiveBinders: 'archiveBinder',
  archiveDocuments: 'archiveDocument',
  quotes: 'quote',
  quoteItems: 'quoteItem',
  salesOrders: 'salesOrder',
  invoices: 'invoice',
  invoiceItems: 'invoiceItem',
  invoiceTaxes: 'invoiceTax',
  creditNotes: 'creditNote',
  payments: 'payment',
  paymentAllocations: 'paymentAllocation',
  expenses: 'expense',
  cashVouchers: 'cashVoucher',
  cashAccounts: 'cashAccount',
  cashMovements: 'cashMovement',
  paymentOrders: 'paymentOrder',
  paymentOrderAttachments: 'paymentOrderAttachment',
  purchases: 'purchase',
  purchaseItems: 'purchaseItem',
  currencies: 'currency',
  exchangeRates: 'exchangeRate',
  taxSettings: 'taxConfiguration',
  fiscalDevices: 'fiscalDevice',
  fiscalTransactions: 'fiscalTransaction',
  transmissionLogs: 'fiscalTransmissionLog',
};
type DynamicDelegate = {
  findMany(args: { where: Record<string, unknown> }): Promise<Record<string, unknown>[]>;
  deleteMany(args: { where: Record<string, unknown> }): Promise<{ count: number }>;
  createMany(args: { data: Record<string, unknown>[] }): Promise<{ count: number }>;
};

const clearableModules = {
  archives: 'Archives · classeurs et documents classés',
  patrimoine: 'Patrimoine · biens et historique de leurs mouvements',
  stock: 'Stocks et achats · produits, fournisseurs et mouvements',
  clients: 'Dossiers clients · coordonnées et pièces du dossier',
  facturation: 'Facturation · factures, règlements et pièces fiscales',
  tresorerie: 'Trésorerie · approvisionnements, OP et bons de caisse',
} as const;

export type ClearableModule = keyof typeof clearableModules;

function asRows(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value) || value.length > maximumRecordsPerTable) {
    throw new BadRequestException('La sauvegarde contient une liste invalide ou trop volumineuse.');
  }
  if (value.some((row) => !row || typeof row !== 'object' || Array.isArray(row))) {
    throw new BadRequestException('La sauvegarde contient un enregistrement invalide.');
  }
  return value as Record<string, unknown>[];
}

function encodeBackupValue(value: unknown): unknown {
  if (value instanceof Uint8Array) {
    return { [bytesMarker]: Buffer.from(value).toString('base64') };
  }
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(encodeBackupValue);
  if (value && typeof value === 'object') {
    const decimal = value as { toJSON?: () => unknown };
    if (typeof decimal.toJSON === 'function') {
      const serialized = decimal.toJSON();
      if (typeof serialized === 'string' || typeof serialized === 'number') return serialized;
    }
    return Object.fromEntries(
      Object.entries(value).map(([key, nested]) => [key, encodeBackupValue(nested)]),
    );
  }
  return value;
}

function decodeBackupValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(decodeBackupValue);
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const encodedBytes = record[bytesMarker];
    if (typeof encodedBytes === 'string') {
      if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encodedBytes)) {
        throw new BadRequestException('Une pièce jointe de la sauvegarde est invalide.');
      }
      return Buffer.from(encodedBytes, 'base64');
    }
    return Object.fromEntries(
      Object.entries(record).map(([key, nested]) => [key, decodeBackupValue(nested)]),
    );
  }
  return value;
}

@Injectable()
export class BackupsService {
  constructor(private readonly prisma: PrismaService) {}

  async export(companyId: string, userId: string) {
    const backup = await this.prisma.$transaction(async (transaction) => {
      const company = await transaction.company.findUnique({ where: { id: companyId } });
      if (!company) throw new ConflictException('Le cabinet associé à cette session est introuvable.');

      const data = {} as BackupRows;
      const find = (table: BackupTable, where: Record<string, unknown> = { companyId }) =>
        (transaction as unknown as Record<string, DynamicDelegate>)[delegateNames[table]].findMany({ where });

      const [branches, customers, customerDocuments, suppliers, productCategories, products, services,
        warehouses, stockMovements, fixedAssets, fixedAssetMovements, archiveBinders, archiveDocuments,
        quotes, salesOrders, invoices, creditNotes, payments, expenses, cashVouchers, cashAccounts,
        cashMovements, paymentOrders, purchases, currencies, exchangeRates, taxSettings, fiscalDevices,
        fiscalTransactions, transmissionLogs] = await Promise.all([
        find('branches'), find('customers'), find('customerDocuments'), find('suppliers'),
        find('productCategories'), find('products'), find('services'), find('warehouses'),
        find('stockMovements'), find('fixedAssets'), find('fixedAssetMovements'), find('archiveBinders'),
        find('archiveDocuments'), find('quotes'), find('salesOrders'), find('invoices'), find('creditNotes'),
        find('payments'), find('expenses'), find('cashVouchers'), find('cashAccounts'), find('cashMovements'),
        find('paymentOrders'), find('purchases'), find('currencies'), find('exchangeRates'), find('taxSettings'),
        find('fiscalDevices'), find('fiscalTransactions'), find('transmissionLogs'),
      ]);
      const [quoteItems, invoiceItems, invoiceTaxes, paymentAllocations, purchaseItems, paymentOrderAttachments] = await Promise.all([
        find('quoteItems', { quoteId: { in: quotes.map((row) => row.id) } }),
        find('invoiceItems', { invoiceId: { in: invoices.map((row) => row.id) } }),
        find('invoiceTaxes', { invoiceId: { in: invoices.map((row) => row.id) } }),
        find('paymentAllocations', { paymentId: { in: payments.map((row) => row.id) } }),
        find('purchaseItems', { purchaseId: { in: purchases.map((row) => row.id) } }),
        find('paymentOrderAttachments'),
      ]);

      Object.assign(data, {
        branches, customers, customerDocuments, suppliers, productCategories, products, services,
        warehouses, stockMovements, fixedAssets, fixedAssetMovements, archiveBinders, archiveDocuments,
        quotes, quoteItems, salesOrders, invoices, invoiceItems, invoiceTaxes, creditNotes, payments,
        paymentAllocations, expenses, cashVouchers, cashAccounts, cashMovements, paymentOrders,
        paymentOrderAttachments, purchases, purchaseItems, currencies, exchangeRates, taxSettings,
        fiscalDevices, fiscalTransactions, transmissionLogs,
      });
      data.fiscalDevices = fiscalDevices.map((device) => {
        const safeDevice = { ...device };
        delete safeDevice.credentialsHash;
        return safeDevice;
      });

      return { company, data };
    });

    await this.prisma.auditLog.create({
      data: { companyId, userId, action: 'DATABASE_BACKUP_EXPORTED', details: { format: backupFormat, version: backupVersion } },
    });
    const result = encodeBackupValue({
      format: backupFormat,
      version: backupVersion,
      companyId,
      createdAt: new Date().toISOString(),
      data: backup,
      excluded: ['comptes utilisateurs et mots de passe', 'journaux d’audit', 'notifications personnelles'],
    });
    const json = JSON.stringify(result);
    if (Buffer.byteLength(json, 'utf8') > maximumBackupBytes) {
      throw new PayloadTooLargeException('La sauvegarde dépasse 30 Mo. Téléchargez les pièces jointes volumineuses séparément avant de réessayer.');
    }
    return json;
  }

  modules() {
    return Object.entries(clearableModules).map(([id, label]) => ({ id, label }));
  }

  async clearModule(moduleId: string, confirmation: string, companyId: string, userId: string) {
    if (!(moduleId in clearableModules) || confirmation !== 'VIDER') {
      throw new BadRequestException('Sélectionnez un module autorisé et confirmez en saisissant VIDER.');
    }
    const moduleKey = moduleId as ClearableModule;
    return this.prisma.$transaction(async (transaction) => {
      const deleteRows = async (model: string, where: Record<string, unknown> = { companyId }) => {
        const delegate = (transaction as unknown as Record<string, DynamicDelegate>)[model];
        if (!delegate?.deleteMany) throw new BadRequestException('Module de suppression non pris en charge.');
        const result = await delegate.deleteMany({ where });
        return result.count;
      };
      const counts: Record<string, number> = {};
      const remove = async (model: string, where?: Record<string, unknown>) => {
        counts[model] = await deleteRows(model, where);
      };

      if (moduleKey === 'archives') {
        await remove('archiveDocument');
        await remove('archiveBinder');
      } else if (moduleKey === 'patrimoine') {
        await remove('fixedAssetMovement');
        await remove('fixedAsset');
      } else if (moduleKey === 'stock') {
        await remove('stockMovement');
        await remove('purchaseItem', { purchase: { companyId } });
        await remove('purchase');
        await remove('product');
        await remove('productCategory');
        await remove('supplier');
        await remove('warehouse');
      } else if (moduleKey === 'clients') {
        const [invoices, quotes, payments] = await Promise.all([
          transaction.invoice.count({ where: { companyId } }),
          transaction.quote.count({ where: { companyId } }),
          transaction.payment.count({ where: { companyId, customerId: { not: null } } }),
        ]);
        if (invoices || quotes || payments) {
          throw new ConflictException('Des factures, devis ou règlements sont encore liés aux clients. Videz d’abord le module Facturation.');
        }
        await remove('customerDocument');
        await remove('customer');
      } else if (moduleKey === 'facturation') {
        const payments = await transaction.payment.findMany({ where: { companyId }, select: { id: true } });
        await remove('cashMovement', { companyId, sourceType: 'INVOICE_PAYMENT', sourceId: { in: payments.map(({ id }) => id) } });
        await remove('paymentAllocation', { payment: { companyId } });
        await remove('payment');
        await remove('fiscalTransaction');
        await remove('transmissionLog');
        await remove('creditNote');
        await remove('invoiceItem', { invoice: { companyId } });
        await remove('invoiceTax', { invoice: { companyId } });
        await remove('invoice');
      } else {
        const vouchers = await transaction.cashVoucher.findMany({ where: { companyId }, select: { id: true } });
        await remove('paymentOrderAttachment');
        await remove('paymentOrder');
        await remove('expense', { companyId, cashVoucherId: { in: vouchers.map(({ id }) => id) } });
        await remove('cashMovement', { companyId, sourceType: { in: ['CASH_FUNDING', 'CASH_VOUCHER', 'CASH_VOUCHER_REVERSAL'] } });
        await remove('cashVoucher');
      }

      await transaction.auditLog.create({
        data: {
          companyId,
          userId,
          action: 'DATABASE_MODULE_CLEARED',
          details: { module: moduleKey, counts },
        },
      });
      return { module: moduleKey, counts };
    });
  }

  async restore(fileName: string, fileData: Buffer, confirmation: string, companyId: string, userId: string) {
    if (confirmation !== 'RESTAURER') {
      throw new BadRequestException('Confirmez la restauration en saisissant RESTAURER.');
    }
    if (!fileName.toLocaleLowerCase('fr').endsWith('.json')) throw new BadRequestException('Choisissez une sauvegarde JSON Cabinet Transparency.');
    if (fileData.byteLength === 0 || fileData.byteLength > maximumBackupBytes) {
      throw new PayloadTooLargeException('Le fichier de sauvegarde est vide ou dépasse 30 Mo.');
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(fileData.toString('utf8'));
    } catch {
      throw new BadRequestException('Le fichier sélectionné n’est pas un JSON valide.');
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new BadRequestException('Structure de sauvegarde invalide.');
    const backup = parsed as Record<string, unknown>;
    if (backup.format !== backupFormat || backup.version !== backupVersion) throw new BadRequestException('Format ou version de sauvegarde non pris en charge.');
    if (backup.companyId !== companyId) throw new ConflictException('Cette sauvegarde appartient à un autre cabinet. Elle ne peut pas être restaurée dans cet espace.');
    const backupData = backup.data as Record<string, unknown> | undefined;
    if (!backupData || typeof backupData !== 'object' || !backupData.company || typeof backupData.company !== 'object') {
      throw new BadRequestException('La sauvegarde ne contient pas les paramètres du cabinet.');
    }
    const rows = {} as BackupRows;
    for (const table of backupTables) rows[table] = asRows(backupData.data && typeof backupData.data === 'object' ? (backupData.data as Record<string, unknown>)[table] : undefined);
    const encodedCompany = backupData.company as Record<string, unknown>;
    if (encodedCompany.id !== companyId) throw new ConflictException('L’identifiant du cabinet dans le fichier ne correspond pas à la session.');

    const decoded = decodeBackupValue(rows) as BackupRows;
    for (const table of backupTables) {
      if (decoded[table].some((row) => 'companyId' in row && row.companyId !== companyId)) {
        throw new ConflictException(`La table ${table} contient des données d’un autre cabinet.`);
      }
    }
    const company = decodeBackupValue(encodedCompany) as Record<string, unknown>;

    return this.prisma.$transaction(async (transaction) => {
      const existingFiscalDevices = await transaction.fiscalDevice.findMany({
        where: { companyId },
        select: { id: true, credentialsHash: true },
      });
      const fiscalSecretsById = new Map(
        existingFiscalDevices
          .filter((device) => device.credentialsHash)
          .map((device) => [device.id, device.credentialsHash]),
      );
      const deleteRows = async (model: string, where: Record<string, unknown> = { companyId }) => {
        const delegate = (transaction as unknown as Record<string, DynamicDelegate>)[model];
        return delegate.deleteMany({ where });
      };
      const deletions = [
        ['paymentOrderAttachment', { companyId }], ['paymentOrder', { companyId }],
        ['expense', { companyId }], ['cashVoucher', { companyId }], ['cashMovement', { companyId }],
        ['paymentAllocation', { payment: { companyId } }], ['payment', { companyId }],
        ['fiscalTransaction', { companyId }], ['transmissionLog', { companyId }], ['creditNote', { companyId }],
        ['invoiceItem', { invoice: { companyId } }], ['invoiceTax', { invoice: { companyId } }], ['invoice', { companyId }],
        ['quoteItem', { quote: { companyId } }], ['quote', { companyId }], ['salesOrder', { companyId }],
        ['purchaseItem', { purchase: { companyId } }], ['purchase', { companyId }], ['stockMovement', { companyId }],
        ['product', { companyId }], ['productCategory', { companyId }], ['supplier', { companyId }], ['warehouse', { companyId }],
        ['fixedAssetMovement', { companyId }], ['fixedAsset', { companyId }], ['archiveDocument', { companyId }],
        ['archiveBinder', { companyId }], ['customerDocument', { companyId }], ['customer', { companyId }],
        ['service', { companyId }], ['branch', { companyId }], ['cashAccount', { companyId }],
        ['currency', { companyId }], ['exchangeRate', { companyId }], ['taxConfiguration', { companyId }],
        ['fiscalDevice', { companyId }],
      ] as const;
      for (const [model, where] of deletions) await deleteRows(model, where);

      const safeCompany = { ...company };
      delete safeCompany.id;
      delete safeCompany.createdAt;
      delete safeCompany.updatedAt;
      await transaction.company.update({ where: { id: companyId }, data: safeCompany as Prisma.CompanyUpdateInput });

      const createRows = async (table: BackupTable, values: Record<string, unknown>[]) => {
        if (table === 'fiscalDevices') {
          for (const device of values) {
            const id = typeof device.id === 'string' ? device.id : null;
            if (id && fiscalSecretsById.has(id)) device.credentialsHash = fiscalSecretsById.get(id);
          }
        }
        const delegate = (transaction as unknown as Record<string, DynamicDelegate>)[delegateNames[table]];
        for (let offset = 0; offset < values.length; offset += 500) {
          await delegate.createMany({ data: values.slice(offset, offset + 500) });
        }
      };
      const creationOrder: BackupTable[] = [
        'branches', 'customers', 'suppliers', 'productCategories', 'currencies', 'exchangeRates',
        'taxSettings', 'fiscalDevices', 'products', 'services', 'warehouses', 'cashAccounts',
        'fixedAssets', 'archiveBinders', 'stockMovements', 'fixedAssetMovements', 'archiveDocuments',
        'customerDocuments', 'quotes', 'quoteItems', 'salesOrders', 'invoices', 'invoiceItems',
        'invoiceTaxes', 'creditNotes', 'payments', 'paymentAllocations', 'expenses', 'cashVouchers',
        'cashMovements', 'paymentOrders', 'paymentOrderAttachments', 'purchases', 'purchaseItems',
        'fiscalTransactions', 'transmissionLogs',
      ];
      for (const table of creationOrder) await createRows(table, decoded[table]);
      await transaction.auditLog.create({
        data: {
          companyId,
          userId,
          action: 'DATABASE_BACKUP_RESTORED',
          details: {
            format: backupFormat,
            version: backupVersion,
            backupCreatedAt: typeof backup.createdAt === 'string' ? backup.createdAt : 'unknown',
          },
        },
      });
      return { success: true, restoredRecords: creationOrder.reduce((sum, table) => sum + decoded[table].length, 0) };
    }, { timeout: 120_000, maxWait: 15_000 });
  }
}
