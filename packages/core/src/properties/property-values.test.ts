import { describe, expect, it } from 'vitest';
import { creationValuesProblem, withPropertyValue } from './property-values.ts';

const version = { id: 'version', askedAtCreation: true, required: true, optionIds: ['1.2', '1.3'] };
const team = { id: 'team', askedAtCreation: true, required: false, optionIds: ['web', 'api'] };
const customer = { id: 'customer', askedAtCreation: false, required: false, optionIds: ['acme'] };
const properties = [version, team, customer];

describe('the values an issue is created with', () => {
  it('may name an option of any property, those required at creation being given', () => {
    expect(creationValuesProblem(properties, { version: '1.3' })).toBeNull();
    expect(
      creationValuesProblem(properties, { version: '1.2', team: 'web', customer: 'acme' }),
    ).toBeNull();
  });

  it('must give the properties required at creation', () => {
    expect(creationValuesProblem(properties, { team: 'web' })).toStrictEqual({
      problem: 'missingRequired',
      propertyId: 'version',
    });
    expect(creationValuesProblem([team, customer], {})).toBeNull();
  });

  it('refuse a property or an option the instance does not have', () => {
    expect(creationValuesProblem(properties, { version: '1.3', size: 'xl' })).toStrictEqual({
      problem: 'unknownProperty',
      propertyId: 'size',
    });
    expect(creationValuesProblem(properties, { version: 'acme' })).toStrictEqual({
      problem: 'unknownOption',
      propertyId: 'version',
    });
  });
});

describe('an issue given a value', () => {
  it('keeps the others, and loses the property once given none', () => {
    const values = { version: '1.2', team: 'web' };

    expect(withPropertyValue(values, 'version', '1.3')).toStrictEqual({
      version: '1.3',
      team: 'web',
    });
    expect(withPropertyValue(values, 'version', null)).toStrictEqual({ team: 'web' });
    expect(withPropertyValue({}, 'team', 'api')).toStrictEqual({ team: 'api' });
    expect(values).toStrictEqual({ version: '1.2', team: 'web' });
  });
});
