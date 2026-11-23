import { UserRole } from '@prisma/client';

const managingPartnerRoutes = new Map<string, Set<string>>([
  ['AuthController', new Set(['me'])],
  ['CompanyController', new Set(['get'])],
  ['DashboardController', new Set(['getMonthlyReport'])],
  [
    'PaymentOrdersController',
    new Set(['list', 'managerVisa', 'reject', 'attachment']),
  ],
  [
    'CashVouchersController',
    new Set(['list', 'treasury', 'treasuryPeriod', 'approve', 'reject']),
  ],
  ['ArchivesController', new Set(['listBinders', 'list', 'content'])],
  [
    'NotificationsController',
    new Set(['list', 'markRead', 'markAllRead']),
  ],
]);

export function isManagingPartnerRouteAllowed(
  controller: string,
  handler: string,
) {
  return managingPartnerRoutes.get(controller)?.has(handler) ?? false;
}

const globalManagingPartnerRoutes = new Map<string, Set<string>>([
  ['ManagingPartnerController', new Set(['overview'])],
  ['AuthController', new Set(['me', 'companies', 'switchCompany'])],
  ['CompanyController', new Set(['get'])],
  ['DashboardController', new Set(['getOverview', 'getMonthlyReport'])],
  ['CustomersController', new Set(['list', 'statement', 'listDocuments', 'documentContent'])],
  ['InvoicesController', new Set(['list', 'getOne'])],
  ['PaymentsController', new Set(['list'])],
  ['ExpensesController', new Set(['list'])],
  ['FiscalIntegrationController', new Set(['getStatusSummary'])],
  ['InventoryController', new Set(['products', 'suppliers', 'purchases', 'stock'])],
  ['FixedAssetsController', new Set(['list', 'report'])],
  ['PaymentOrdersController', new Set(['list', 'managerVisa', 'reject', 'attachment'])],
  ['CashVouchersController', new Set(['list', 'treasury', 'treasuryPeriod', 'approve', 'reject'])],
  ['ArchivesController', new Set(['listBinders', 'list', 'content'])],
  ['NotificationsController', new Set(['list', 'markRead', 'markAllRead'])],
]);

export function isGlobalManagingPartnerRouteAllowed(controller: string, handler: string) {
  return globalManagingPartnerRoutes.get(controller)?.has(handler) ?? false;
}

export function isGlobalManagingPartnerReadRoute(controller: string, handler: string) {
  const writes = new Map<string, Set<string>>([
    ['AuthController', new Set(['switchCompany'])],
    ['PaymentOrdersController', new Set(['managerVisa', 'reject'])],
    ['CashVouchersController', new Set(['approve', 'reject'])],
    ['NotificationsController', new Set(['markRead', 'markAllRead'])],
  ]);
  return isGlobalManagingPartnerRouteAllowed(controller, handler) &&
    !writes.get(controller)?.has(handler);
}
