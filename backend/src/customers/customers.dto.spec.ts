import { validateSync } from 'class-validator';
import { CreateCustomerDto } from './customers.dto';

describe('CreateCustomerDto', () => {
  it('accepts customer type and dossier status', () => {
    const dto = Object.assign(new CreateCustomerDto(), {
      type: 'INDIVIDUAL',
      status: 'À relancer',
      name: 'Client de test',
    });

    expect(validateSync(dto)).toHaveLength(0);
  });

  it('rejects unsupported customer types and statuses', () => {
    const dto = Object.assign(new CreateCustomerDto(), {
      type: 'OTHER',
      status: 'Archived',
      name: 'Client de test',
    });

    expect(validateSync(dto).map(({ property }) => property)).toEqual(
      expect.arrayContaining(['type', 'status']),
    );
  });
});
