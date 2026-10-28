import Icon from './icons.jsx';
import ScheduleField from './ScheduleField.jsx';
import { scheduleProblems, scheduleSummary } from '../lib/schedule.js';

/**
 * Start and end fields with the rules between them (an end can't be before its start or already past) and a
 * sentence saying when it runs. value: { start, end } as UTC ISO strings or null. serverErrors: the API's field
 * errors for the same two fields, shown in place of the local ones.
 */
export default function ScheduleRange({ value, onChange, initial, serverErrors = {}, labels = ['Starts', 'Ends'] }) {
  const local = scheduleProblems(value, { initial });
  const errors = { start: serverErrors.start || local.start, end: serverErrors.end || local.end };
  const sum = scheduleSummary(value);
  return (
    <div className="stack" style={{ gap: 10 }}>
      <div className="grid-2">
        <ScheduleField kind="start" label={labels[0]} value={value.start} before={value.end} error={errors.start}
          onChange={(start) => onChange({ ...value, start })} hint="Leave as “Starts immediately” to start when you save." />
        <ScheduleField kind="end" label={labels[1]} value={value.end} after={value.start} error={errors.end}
          onChange={(end) => onChange({ ...value, end })} hint="Leave as “No expiration” to run until you switch it off." />
      </div>
      <div className={`sched-sum ${errors.start || errors.end ? 'bad' : sum.tone}`} role="status">
        <Icon name={errors.start || errors.end || sum.tone === 'bad' ? 'alert' : 'clock'} size={15} /><span>{errors.start || errors.end ? 'Fix the highlighted date before saving.' : sum.text}</span>
      </div>
    </div>
  );
}

/** True when the schedule can be saved. */
export const scheduleOk = (value, initial) => !Object.keys(scheduleProblems(value, { initial })).length;
