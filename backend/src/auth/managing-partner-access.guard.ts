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
