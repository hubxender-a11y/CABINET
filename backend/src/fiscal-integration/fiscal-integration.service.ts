import { Injectable } from '@nestjs/common';

@Injectable()
export class FiscalIntegrationService {
  getStatusSummary() {
    return {
      statuses: [
        { label: 'DRAFT', count: 8 },
        { label: 'PENDING_FISCALIZATION', count: 12 },
        { label: 'CERTIFIED', count: 184 },
        { label: 'REJECTED', count: 6 },
      ],
      lastTransmission: '2025-10-30T10:15:00Z',
      transmissionMode: 'e-DEF / homologated gateway',
    };
  }

  transmit(invoiceId: string) {
    return {
      invoiceId,
      fiscalStatus: 'PENDING_FISCALIZATION',
      message: 'Transmission en cours vers le dispositif fiscal homologué.',
      reference: null,
      certificationCode: null,
    };
  }
}
