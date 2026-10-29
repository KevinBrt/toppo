import { useState } from 'react';
import { logHours } from '../plugin.ts';

/** What only the screens' bundle holds. */
export function ReportPage() {
  const [hours] = useState(6);
  return (
    <p>
      Hours spent on the screen: {hours}, logged by {logHours.name}
    </p>
  );
}
