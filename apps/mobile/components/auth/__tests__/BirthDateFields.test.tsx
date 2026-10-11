import { fireEvent, screen } from '@testing-library/react';
import { useState } from 'react';
import { expect, it } from 'vitest';
import { renderInApp } from '../../../testing/render.js';
import { BirthDateFields, type DateParts } from '../BirthDateFields.js';

it('filters date parts to digits and hands focus from completed day to month to year', () => {
  function Form() {
    const [value, setValue] = useState<DateParts>({ day: '', month: '', year: '' });
    return <BirthDateFields value={value} onChange={setValue} />;
  }
  renderInApp(<Form />);
  const day = screen.getByLabelText('Tag');
  const month = screen.getByLabelText('Monat');
  const year = screen.getByLabelText('Jahr');
  fireEvent.change(day, { target: { value: '1-' } });
  expect((day as HTMLInputElement).value).toBe('1');
  fireEvent.change(day, { target: { value: '14' } });
  expect(document.activeElement).toBe(month);
  fireEvent.change(month, { target: { value: '03' } });
  expect(document.activeElement).toBe(year);
});

it('keeps every date part locked when the existing caller disables editing', () => {
  renderInApp(
    <BirthDateFields
      value={{ day: '14', month: '03', year: '2013' }}
      onChange={() => {
        throw new Error('locked date must not change');
      }}
      editable={false}
    />,
  );
  for (const label of ['Tag', 'Monat', 'Jahr'])
    expect((screen.getByLabelText(label) as HTMLInputElement).readOnly).toBe(true);
});
