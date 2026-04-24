import { describe, it, expect } from 'vitest';
import { classifyInput } from '../classify-input';

describe('classifyInput', () => {
  // Timesheet entries
  it('classifies input with call/wrap times as timesheet', () => {
    expect(classifyInput('Call 0800 wrap 1700')).toBe('timesheet');
  });

  it('classifies input with role + rate as timesheet', () => {
    expect(classifyInput('Gaffer Monday £568')).toBe('timesheet');
  });

  it('classifies multi-day shoot as timesheet', () => {
    expect(classifyInput('3 day shoot as DoP at £1200')).toBe('timesheet');
  });

  it('classifies input with time patterns as timesheet', () => {
    expect(classifyInput('6am to 9pm as Focus Puller')).toBe('timesheet');
  });

  // T&C questions
  it('classifies question about overtime as question', () => {
    expect(classifyInput('What overtime grade is a Gaffer?')).toBe('question');
  });

  it('classifies question about cancellation as question', () => {
    expect(classifyInput('How do cancellation fees work?')).toBe('question');
  });

  it('classifies question about breaks as question', () => {
    expect(classifyInput('What happens if my first break is missed?')).toBe('question');
  });

  it('classifies question about mileage as question', () => {
    expect(classifyInput('How much mileage can I claim outside the M25?')).toBe('question');
  });

  it('classifies question about holiday pay as question', () => {
    expect(classifyInput('What is the holiday pay entitlement?')).toBe('question');
  });

  it('classifies input with question mark as question', () => {
    expect(classifyInput('Can I claim travel on a rest day?')).toBe('question');
  });

  // Ambiguous — defaults to question
  it('defaults ambiguous input to question', () => {
    expect(classifyInput('overtime rules')).toBe('question');
  });
});
