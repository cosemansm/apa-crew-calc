// src/data/apa-tc-sections.ts

export interface TCSection {
  sectionId: string;
  title: string;
  text: string;
}

export const APA_TC_SECTIONS: TCSection[] = [
  {
    sectionId: '1',
    title: 'Your Services',
    text: `You will provide the services of your grade in consideration of which we agree to pay you such sum as we agree between us which shall be not less than the minimum and not more than the maximum for that grade set out in Appendix 1 (your "basic daily rate") on weekdays, together with such additional payments as this agreement entitles you to.

We will pay invoices from crew with whom we contract direct within seven days of receipt. You agree that such services will be of a good professional standard consistent with what we might reasonably expect to receive from a person employed on your grade.

You agree to treat all information you obtain as a result of your engagement as confidential and that the copyright in anything you create pursuant to your engagement is assigned to us by way of future assignment. You waive all moral rights in respect of such work.`,
  },
  {
    sectionId: '2',
    title: 'Day Types and Best Practice',
    text: `Our recommendation and best practice for APA members is not to schedule shoot days to go beyond 12 hours (10 hours plus one hour for lunch plus one hour overtime) from the main unit call time other than in exceptional circumstances and unscheduled overtime beyond that time for the main unit should be avoided except where it arises from unanticipated issues that arise during the shoot day.

N.B. Unit Call is a call time when the day officially starts however some departments may commence work prior to the unit call; a department call. A department call time is when the whole of the department starts, not an individual e.g. generator driver that may have to collect equipment earlier. Main unit call dictates what kind of day it will be (ie. continuous working, night shoot etc). The provisions of 2 do not apply to PM's, PA's and Runners, for their Day Type entitlements please see Appendix 1.

Crew rate definitions: Basic Daily Rate (BDR) is the 10+1 hours day rate as per Appendix 1. Basic Hourly Rate (BHR) equals 1/10 of the Basic Daily Rate. Double Hourly Rate (2xBHR) equals BHR x 2. Triple Hourly Rate (3xBHR) equals BHR x 3. Standard Hourly Overtime (OT) equals BHR x OT Coefficient (x1, x1.25, x1.5) as per OT Grades outlined in Section 4 and Appendix 1.`,
  },
  {
    sectionId: '2.1',
    title: 'The Basic Working Day',
    text: `The Basic Working Day includes 11 hours in total (10 working hours and 1 hour for lunch). You will be notified by the production company of the call time and where you should attend and you will attend at that time and place. For a Basic Working Day you will be paid your Basic Daily Rate as per Appendix 1. Your Basic Hourly Rate is one tenth of your Basic Daily Rate.`,
  },
  {
    sectionId: '2.1.1',
    title: 'Basic Working Day With Call Time Between 7am and 11am (Standard Call)',
    text: `The provisions of this clause apply to work on weekdays ie Monday to Friday. If your call time is between 7 a.m. and 11 a.m., this is considered as a standard call. The basic working day starts at the call time and includes 11 hours in total, 10 working hours and one hour for lunch. Overtime applies after 11 hours. We will notify you of the call time and where you should attend and you will attend at that time and place.`,
  },
  {
    sectionId: '2.1.2',
    title: 'Basic Working Day With Call Time Before 5am (Night Call)',
    text: `If the call time is before 5 a.m., this is considered as a night call and night shoot rule applies; you will be paid at double basic hourly rate for every hour worked; from call time to wrap, with a minimum call of ten hours. We will notify you of the call time and where you should attend and you will attend at that time and place.

If night shoot call time is on Saturday, Monday-Friday night shoot rule applies throughout the engagement even though the engagement goes into Sunday. If the night shoot call time is on Sunday, Monday-Friday night shoot rule applies throughout the engagement; you will be paid double your basic hourly rate for all hours worked with a minimum of ten hours throughout the engagement. There is no such thing as 'double-double' rate.`,
  },
  {
    sectionId: '2.1.3',
    title: 'Basic Working Day With Call Time Between 5am and 7am (Early Call)',
    text: `The provisions of this clause apply to work on weekdays ie Monday to Friday. If your call time is between 5 a.m. and 7 a.m., your basic work day starts at the call time and we will pay you at your overtime rate for hours worked between 5 a.m. and 7 a.m. The rest of the day will be charged as basic working day (calculated from a call time). Early call rule applies on all days throughout a week, Monday to Sunday. Overtime will start 11 hours after a call time.

Note: an individual who commences work earlier than 5am (e.g a genny driver), will be paid for the hours worked prior to their department call time and their basic working day starts at their department's call time. Such an individual who commences earlier than 5am is paid at their triple hourly rate for the time they work up until 5am and at their overtime rate from 5am until the department call.`,
  },
  {
    sectionId: '2.1.4',
    title: 'Basic Working Day With Call Time Between 11am and 5pm (Late Call)',
    text: `The provisions of this clause apply to work on weekdays ie Monday to Friday. If your call time is between 11 a.m. and 5 p.m., this is considered as a late call. No matter when the call time is being given, the basic working day starts at 11 a.m. and includes 11 hours in total - 10 working hours and one hour for lunch. Overtime applies after 11 hours from 11am. We will notify you of the call time and where you should attend and you will attend at that time and place.`,
  },
  {
    sectionId: '2.1.5',
    title: 'Basic Working Day With Call Time Between 5pm and 5am (Night Call)',
    text: `The provisions of this clause apply to work on week days ie Monday to Friday. All work commencing between 5 p.m. and 5 a.m. is considered as night work and you will be paid double your basic hourly rate for all hours worked with a minimum call of ten hours. Breaks apply the same way as on a standard day shoot (i.e. first and second break). No overtime or 'triple time after midnight' rate applies, the rate stays the same throughout the whole engagement; from call time to wrap.

N.B. Going past 5am (next day) is not considered as a new day engagement, you continue to be paid at double your basic hourly rate for all hours worked until the end of that day.

For night shoot with call time at or from 5 p.m. on Saturday we will pay you two times your basic hourly rate for all hours worked on that day with a minimum call of ten hours, the rate remains the same even though the engagement goes into Sunday. For night shoot with call time at or from 5 p.m. on Sunday we will pay you two times your basic hourly rate for all hours worked on that day with a minimum call of ten hours. There is no such thing as double-double rate for a night shoot on Sunday.`,
  },
  {
    sectionId: '2.2',
    title: 'Continuous Working Day',
    text: `Continuous Working Day is any day on which you work for a continuous period (no breaks) of 9 hours. The Continuous Working Day's standard call time is between 7 a.m. the earliest and 11 a.m. the latest. We will provide you with food and beverages at an appropriate time during the Continuous Working Day. Overtime will apply after 9 hours from the call time at the overtime rate as per Appendix 1. If the Continuous Working Day is a Saturday then overtime will apply at 1.5 the BDR and if the Continuous Working Day is a Sunday at 2 times the BDR.

After the nine hour continuous working day crew are entitled to a 30 minute break. If you are not given the 30 mins break, you will be paid 30 mins at your basic hourly rate as compensation. There will be a further 30 minutes break after 12 1/2 hours from the call time (and the same rule will apply if that break is not given). These breaks can't be delayed (i.e. if not given at appropriate time, then the missed break penalty is payable).`,
  },
  {
    sectionId: '2.2.1',
    title: 'Continuous Working Day With Call Time Between 7am and 11am (Standard Call)',
    text: `The provisions of this clause apply to work on weekdays ie Monday to Friday. The Continuous Working Day's standard call time is between 7 a.m. the earliest and 11 a.m. the latest. The basic continuous working day starts at the call time and includes 9 hours in total. Overtime will apply after 9 hours from the call time. We will notify you of the call time and where you should attend and you will attend at that time and place.

After the nine hour continuous working day crew are entitled to a 30 minute break. If you are not given the 30 mins break, you will be paid 30 mins at your basic hourly rate as compensation. There will be a further 30 minutes break after 12 1/2 hours from the call time (and the same rule will apply if that break is not given). These breaks can't be delayed.`,
  },
  {
    sectionId: '2.2.2',
    title: 'Continuous Working Day With Call Time Before 5am (Night Call)',
    text: `If the call time is before 5 a.m. and the day is a Continuous Working Day, we will pay you your double basic daily rate. We will provide you with food and beverages at an appropriate time during the Continuous Working Day. Overtime will apply after 9 hours from the call time and is charged at double basic hourly rate.

After the nine hour continuous working day crew are entitled to a 30 minute break. If you are not given the 30 mins break, you will be paid 30 mins at your basic hourly rate as compensation. There will be a further 30 minutes break after 12 1/2 hours from the call time (and the same rule will apply if that break is not given). These breaks can't be delayed.`,
  },
  {
    sectionId: '2.2.3',
    title: 'Continuous Working Day With Call Time Between 5am and 7am (Early Call)',
    text: `If your call time is between 5 a.m. and 7 a.m. and the day is a Continuous Working Day, your basic work days starts at the call time and we will pay you at your overtime rate for hours worked between 5 a.m. and 7 a.m. The rest of the day will be charged as basic continuous working day of 9 hours, calculated from the call time. Overtime will apply after 9 hours from the call time.

After the nine hour continuous working day crew are entitled to a 30 minute break. If you are not given the 30 mins break, you will be paid 30 mins at your basic hourly rate as compensation. There will be a further 30 minutes break after 12 1/2 hours from the call time (and the same rule will apply if that break is not given). These breaks can't be delayed.`,
  },
  {
    sectionId: '2.2.4',
    title: 'Continuous Working Day With Call Time Between 11am and 5pm (Late Call)',
    text: `The provisions of this clause apply to work on weekdays ie Monday to Friday. If your call time is between 11 a.m. and 5 p.m. and the day is a Continuous Working Day, this is considered as a late call. No matter when the call time is being given, the basic continuous working day starts at 11 a.m. and includes 9 hours in total. Overtime will apply after 9 hours from the call time.

After the nine hour continuous working day crew are entitled to a 30 minute break. If you are not given the 30 mins break, you will be paid 30 mins at your basic hourly rate as compensation. There will be a further 30 minutes break after 12 1/2 hours from the call time (and the same rule will apply if that break is not given). These breaks can't be delayed.`,
  },
  {
    sectionId: '2.2.5',
    title: 'Continuous Working Day With Call Time Between 5pm and 5am (Night Call)',
    text: `If your call time is between 5 p.m. and 5 a.m. and the day is a Continuous Working Day, we will pay you your double basic daily rate. The day includes 9 hours in total. Overtime will apply after 9 hours from the call time and is charged at double basic hourly rate.

After the nine hour continuous working day crew are entitled to a 30 minute break. If you are not given the 30 mins break, you will be paid 30 mins at your basic hourly rate as compensation. There will be a further 30 minutes break after 12 1/2 hours from the call time (and the same rule will apply if that break is not given). These breaks can't be delayed.`,
  },
  {
    sectionId: '2.3',
    title: 'Non-Shooting Day',
    text: `Non-Shooting Day is a working day on which shooting does not take place. The non-shooting working day shall be eight hours, charged at your basic hourly rate. Overtime will begin after 8 hours and will be charged at standard overtime rate.

Non-shooting day types: rest day, prep day, recce day, pre-light day, construction (build) day, strike day.

Rest Day is a non-shooting working day when you at production's request remain on location but filming is not taking place for some reason. You will be paid a flat fee which is your basic daily rate, no overtime, penalties or meal compensations apply. This applies on any day of the week.

Prep Day, Recce Day, Construction Day & Strike Day is a non-shooting working day which consists of 8 hours, charged at your basic hourly rate. Overtime will begin after 8 hours and will be charged at standard overtime rate.

Pre-light Day (crew working on a dedicated location/at studio as instructed by production) is a non-shooting working day which consists of 8 hours + 1 hours for lunch, charged at your basic hourly rate. Overtime will begin after 9 hours and will be charged at standard overtime rate.

The above does not apply to DOP, Art Directors and Location Managers, for those crew members each day of engagement is considered as Basic Working Day (see 2) and they work on the basic working day basis of 10 hours + 1 hour for lunch. Overtime applies after 11 hours.

We are not obliged to provide food or compensate for food expenses on non-shooting days apart from pre-light.`,
  },
  {
    sectionId: '2.4',
    title: 'Working on Saturdays, Sundays, Bank Holiday and Statutory Holiday',
    text: `(i) Basic Working Day if on Saturday means you will be paid at one and a half times your basic daily rate for all the hours worked on that day at a minimum call of ten hours.

(ii) Basic Working Day if on Sundays, Bank Holidays and Statutory Holidays means you will be paid at two times your basic hourly rate (2xBHR) for all hours worked on that day with a minimum call of ten hours.

(iii) Night Shoot if on Saturday means you will be paid at two times your basic hourly rate (2xBHR) for all hours worked that day with a minimum call of ten hours.

(iv) Night Shoot if on Sundays, Bank Holidays and Statutory Holidays means you will be paid two times of your basic hourly rate for all hours worked on that day with a minimum call of ten hours. There is no such thing as double-double rate.

(v) Continuous Working Day if on Saturday means you will be back at one and a half times your basic daily rate. Overtime commences after 9 hours from the call time. For each overtime hour, you will be paid one and a half times your basic hourly (1.5xBHR).

(vi) Continuous Working Day if on Sundays, Bank Holidays and Statutory Holidays means you will be paid at two times your basic daily rate. Overtime commences after 9 hours from the call time. For each overtime hour, you will get paid double your basic hourly (2xBHR).

(vii) Prep Day, Recce Day, Build Day & Strike Day if on Saturday means you will be paid one and a half times your hourly basic rate for 8 hours. Overtime will commence after 8 hours and will be charged at one and a half times your basic hourly (1.5xBHR) rate.

(viii) Prep Day, Recce Day, Build Day & Strike Day if on Sundays, Bank Holidays and Statutory Holidays means you will be paid double hourly basic rate for 8 hours. Overtime will commence after 8 hours and will be charged at double basic hourly (2xBHR) rate.

(ix) Pre-light Day if on Saturday means you will be paid one and a half your basic rate for 8 hours. Overtime will commence after 9 hours (lunch hour is included in the day) and will be charged at one and a half times your basic hourly (1.5xBHR) rate.

(x) Pre-light Day if on Sundays, Bank Holidays and Statutory Holidays means you will be paid double hourly basic rate for 8 hours. Overtime will commence after 9 hours and will be charged at double basic hourly (2xBHR) rate.

(xi) Rest Day if on Saturday means you will be paid at your basic daily rate for that day. This is a fixed fee and no overtime applies.

(xii) Rest Day if on Sundays, Bank Holidays and Statutory Holidays means you will be paid at your basic daily rate for that day. This is a fixed fee and no overtime applies.

(xiii) Travel Day if on Saturday means you will be paid at your basic hourly rate, regardless of time, or day of the week with minimum call of 5 hours.

(xiv) Travel Day if on Sundays, Bank Holidays and Statutory Holidays means you will be paid at your basic hourly rate, regardless of time, or day of the week with minimum call of 5 hours.

Reminder: none of the provisions of Clause 2 apply to PM's, PA's and Runners, whose entitlements are set out in Appendix 1.`,
  },
  {
    sectionId: '3.1',
    title: 'Travel Time',
    text: `Travel time is always paid at single time, regardless of time, or day of the week. If travel time & working time total less than 11 hours, then no travel time is payable.

Travel Time on Non-Shooting Day: If under the terms of this agreement you must travel on a day which is not a working day, we will pay you for the hours you travel of your basic hourly rate subject to a minimum of five hours. After a travel non-shooting day, your following working day start will be calculated on base to base basis (meaning e.g. from hotel to hotel). This applies to all location based shooting where the crew stays at a hotel.

Travel Time on Basic Working Day: For the purpose of calculating travel time, the starting point is W1F 9SE for London-based production companies. On working days we will pay you for time spent travelling less the first hour of the outward and homeward journey, at your basic hourly rate. Travel time is always paid at basic hourly rate, regardless of time, or day of the week.

If we ask you to collect equipment or personnel from other address than your home address, you will be paid for your time collecting and delivering as working time (base to base basis).`,
  },
  {
    sectionId: '3.2',
    title: 'Travel Expenses',
    text: `If you use your car to reach a location (in case of studio shoot - expenses don't apply) we will pay you 50p per mile except that you will not be entitled to be paid if the location is within the M25. If there are multiple locations within the M25, mileage at 50p per mile will be paid from the first location to second location and all subsequent location moves (mileage to the first location within M25 is not payable).

If location is outside M25 and you are using your car to reach the location, we will pay you 50p per mile mileage compensation which will be calculated from W1F 9SE to location and back as per the Movement Order issued by Location Manager or Production.

Note: For production companies based in cities other than London, please apply the same formula as above, using a 20 miles radius from the production company address.`,
  },
  {
    sectionId: '3.3',
    title: 'Travel by Air',
    text: `Where we require to travel by air, we will provide you with air travel on a scheduled passenger service. Further, on all flights and stopovers we will provide you with meals and refreshments.

If the flight time exceeds 4 hours there will be no shooting on the day of the flight except in exceptional circumstances.

When the scheduled flight time exceeds 8 hours there will be no shooting until 24 hours after arrival at the destination except in exceptional circumstances.

None of the provisions of clause 3 shall apply to PM's, PA's or Runners.`,
  },
  {
    sectionId: '4',
    title: 'Overtime Overview',
    text: `You agree to work such hours in addition to the basic working day as are necessary, for which we shall pay you at overtime rate. Overtime rate is based on the following formula: basic hourly rate x overtime crew grade. These provisions do not apply to PM's, PA's or Runners, whose overtime entitlement is as set out in Appendix 1.

Based on your basic working day rate, you belong in one of three overtime grades.`,
  },
  {
    sectionId: '4.1',
    title: 'Overtime Monday to Friday - Grade I (Basic Daily Rate £0 - £444)',
    text: `If your basic daily rate is £444 or less we will pay you one and a half times (1.5) your basic hourly rate for each hour of overtime you work. OT Coefficient: 1.5.`,
  },
  {
    sectionId: '4.2',
    title: 'Overtime Monday to Friday - Grade II (Basic Daily Rate £445 - £676)',
    text: `If your basic daily rate is between £445 and £676 inclusive we will pay one and a quarter times (1.25) your basic hourly rate for each hour of overtime you work. OT Coefficient: 1.25.`,
  },
  {
    sectionId: '4.3',
    title: 'Overtime Monday to Friday - Grade III (Basic Daily Rate £677 and more)',
    text: `If your basic daily rate is £677 or more you will be paid one times (1.0) your basic hourly rate for each hour of overtime you work. OT Coefficient: 1.0.`,
  },
  {
    sectionId: '4.4',
    title: 'Overtime After Midnight',
    text: `You will be paid at three times your basic hourly rate for all overtime worked between midnight and 5am and continuously thereafter until wrap is called. This does not apply to PM's, PA's or Runners. For their overtime entitlements please see Appendix 1.`,
  },
  {
    sectionId: '4.5',
    title: 'Overtime Charge Rounding',
    text: `The overtime is charged per minute and you are entitled to round up the overtime to 30mins only, e.g. if you work for 10 OT minutes, you are entitled to 30 minutes of OT.`,
  },
  {
    sectionId: '4.6',
    title: 'Overtime on Saturdays',
    text: `If you work on a Saturday we will pay you one and a half times your basic hourly rate for all hours worked on that day with a minimum call of ten hours. Overtime after midnight is still paid at triple time based on your basic hourly rate. In circumstances of going past 5am - this will not be considered as a new day engagement, you will be continuously paid at the 'overtime midnight rate' (triple time of your basic hourly rate) until the wrap. This does not apply to PM's, PA's and Runners, for their overtime on Saturdays please see Appendix 1.`,
  },
  {
    sectionId: '4.7',
    title: 'Overtime on Sundays, Bank Holiday and Statutory Holidays',
    text: `If you work on Sundays, Bank Holidays or Statutory Holidays we will pay you two times your basic hourly rate for all hours worked on that day with a minimum call of ten hours. Overtime after midnight is still paid at triple time based on your basic hourly rate. In circumstances of going past 5am - this will not be considered as a new day engagement, you will be continuously paid at the 'overtime midnight rate' (triple time of your basic hourly rate) until the wrap. This does not apply to PM's, PA's and Runners, for their overtime entitlements please see Appendix 1.`,
  },
  {
    sectionId: '5',
    title: 'Time Off The Clock',
    text: `If production lasts more than 1 day, the minimum break between wrap and following day call time shall be 11 hours ('time off the clock'). Crew shall not be engaged to work without at least a 10 hour break between call times i.e. they may only be engaged to work one hour of TOC in respect of any one break. If TOC is reduced to 10 hours, we will pay you for the one TOC hour worked at your basic overtime rate in addition to being paid for those hours worked as a part of the basic day rate. Time off the clock and any penalties arising from it does not apply to PM's, PA's and Runners.`,
  },
  {
    sectionId: '6.1',
    title: 'Breakfast',
    text: `Breakfast is provided as a courtesy of a production company however it is not compulsory to be provided. Nor are crew entitled to be compensated for not being provided breakfast.`,
  },
  {
    sectionId: '6.2',
    title: 'First Break',
    text: `Your first break of one hour will begin no more than 5 1/2 hours after work has commenced. If the break is missed, it isn't also delayed - you will be only paid 'missed break penalty'.

If Delayed: we will pay you a penalty of £10.

If the first meal break does not commence within 6 1/2 hours of main unit call the day becomes a continuous working day and the provisions of 2.2 apply. For the avoidance of doubt no late lunch penalties are then payable.

If Curtailed: overtime will commence eleven hours from the start time less the amount of time the first break was curtailed (e.g. if the first break was curtailed by 20 minutes overtime will commence 10 hours and 40 minutes from the start time). If no overtime is worked then the crew member will be paid for the time by which their break was curtailed at single time.

If Missed: When 6 1/2 hours have elapsed since the main unit call, that day will be treated as if it were a Continuous Working Day.

Compensation / Penalty: We will either provide you with a free meal or pay you £7.50 meal allowance.

If Missed on a night shoot: Missed break on a night shoot is charged at basic hourly rate.

Note: Lunch break is not a part of a working day and therefore crew are not being paid during the time of a break.`,
  },
  {
    sectionId: '6.3',
    title: 'Second Break',
    text: `Your second break of half an hour will begin no more than 5 1/2 hours after the end of the first break.

If Delayed: Second Break can't be delayed, the break either is given to the crew or is not.

If Curtailed: we will pay you for those minutes we have curtailed the break by.

If Missed: you will get paid at basic hourly rate to compensate for the 30 minutes of that missed break.

Compensation / Penalty: There is no financial compensation if food is not provided.

If Missed on a night shoot: Missed break on a night shoot is charged at basic hourly rate.

Note: Second break is a part of a working day and therefore crew are being paid during the time of a break.`,
  },
  {
    sectionId: '6.4',
    title: 'Additional Break on Continuous Working Day',
    text: `Your additional break of half an hour will begin no more than 12 1/2 hours from the call time and is preceded by a break of 30 minutes (based on provisions of "second break", please see 6.3 for details) after 9 hours from the call time, this break ONLY applies to Continuous Working Day.

If Delayed: Additional Break can't be delayed, the break either is given to the crew after 12 1/2 hours. If missed, break penalty is payable.

If Missed: When the additional break is missed, you will get paid at basic hourly rate to compensate for the 30 minutes of that missed break.

Compensation / Penalty: N/A.

Note: This additional break is a part of a working day and therefore crew are being paid during the time of a break. Breaks and penalties do not apply to PM's, PA's or Runners.`,
  },
  {
    sectionId: '7',
    title: 'Cancellation Fees',
    text: `If a production is cancelled for any reason except an event of Force Majeure the amount payable to you under this agreement shall be determined as follows: All seven days of the week count for the notice period. For the purpose of calculating the number of days notice given, the day on which notice is given is included but the shoot day is not.

If the period of engagement is three days or less, the cancellation fee applies to the whole engagement. If the period of engagement is more than three days, then each day is a separate engagement and the cancellation fee is calculated for each day. Build days, recce days, pre-light days, shoot days & strike days are all considered as an engagement.

Fee cancellation calculation:
- 7 and more days prior to the engagement - no calculation fee applies
- 6-4 days prior to the engagement - 50% of the agreed fee
- 3-2 days prior to the engagement - 75% of the agreed fee
- On the day prior to the engagement - 100% of the agreed fee

Fee cancellation calculation (crew confirmed for longer period e.g. art director, prod. manager etc.): Crew that have commenced work prior to cancellation are entitled to being paid for work they have already done and for a reasonable compensation having regard for their obligation to seek replacement work.`,
  },
  {
    sectionId: '8',
    title: 'Insurance',
    text: `We will arrange insurance for you when you work for us overseas or on a hazardous location in the UK. We will provide you with the terms of such insurance if you request them in writing.`,
  },
  {
    sectionId: '9',
    title: 'Assignment of Services',
    text: `We shall be entitled to assign the benefit of your services under this agreement but we shall remain obliged to pay you such sums as you are entitled to under this agreement.`,
  },
  {
    sectionId: '10',
    title: 'Holiday Pay',
    text: `A crew member is entitled to the equivalent of 5.6 weeks' paid holiday during each holiday year (including all bank holiday entitlements), calculated on a pro rata basis depending on the number of hours that the crew member actually works. The holiday entitlement for a crew member is therefore equivalent to 12.07% of the hours the crew member works, rounded up to the nearest hour. The crew member's payments include a payment in lieu of their 12.07% holiday entitlement.`,
  },
  {
    sectionId: '11',
    title: 'Force Majeure',
    text: `If your engagement is cancelled because of an event of Force Majeure (as defined in Appendix 2) we shall pay you for the work you have done up to the point where production has ceased but we will not be liable for any other payments.`,
  },
  {
    sectionId: 'appendix-1',
    title: 'Appendix 1 - Recommended Crew Rates',
    text: `Appendix 1 contains the recommended minimum and maximum basic daily rates for all crew grades, along with their overtime grade, OT coefficient, BHR, 2xBHR, 3xBHR, and standard hourly overtime rate.

Provisions for PM's, PA's and Runners:
(a) In all instances overtime will be paid to Production Managers, Production Assistants and Runners on SHOOT DAYS ONLY for hours worked beyond the Basic Working Day between the main unit call and tail lights.
(i) Monday to Friday shoot days: overtime at BHR for all overtime between main unit call and tail lights.
(ii) Saturday shoot days: paid 1.5x BDR; overtime at 1.5x BHR for hours beyond Basic Working Day between main unit call and tail lights.
(iii) Sundays, Bank Holidays, Night shoots (as defined above): paid 2x BDR; overtime at 2x BHR for hours beyond Basic Working Day between main unit call and tail lights.

(b) Casting Director Session Breakdown: For casting session up to 4 characters, casting director will receive the £852 session fee. Prep day fee (half of session fee, i.e. £426) will be payable in addition to the casting session fee. For casting 5-8 characters, a second prep would be charged along with a second casting session fee.

(c) Programmable Lighting Desk Operator Role Definition: An electrician who is operating and programming a lighting desk requiring lighting cues during a take, effects (i.e. flicker / fire effects), control of moving lights or multi-channel LEDs or time coded/midi/analogue synchronisation and triggering (motion control). Such rate and grade only applicable when the position is deemed necessary and agreed in advance between the Gaffer and Production Manager (it shall not apply to a basic fader lighting desk being operated by an electrician).`,
  },
  {
    sectionId: 'appendix-2',
    title: 'Appendix 2 - Force Majeure Definition',
    text: `An event of Force Majeure shall be defined as any event that is not reasonably insurable including but not limited to any act of terrorism, threat of terrorism, any hostile or war like action in time of peace or war, the use or threat of use of any weapon of war employing atomic fission or radioactive force, any instruction or rebellion or revolution or civil war or usurped power or any action taken by any governmental authority in hindering or combating or defending against such occurrence, seizure or destruction under quarantine or customs regulation or confiscation by order of any government or public authority or risks of contraband or illegal transportation of trade, any civil commotion assuming the proportions of or amounting to a popular rising or riot or martial law or the act of any lawfully constituted civil authority (except to the extent that certain acts of civil authority may reasonably be insurable from time to time).`,
  },
];
