export interface EngineMeta {
  id: string;
  name: string;
  shortName: string;
  country: string;        // ISO 3166-1 alpha-2
  currency: string;       // ISO 4217
  currencySymbol: string;
  mileageUnit: 'miles' | 'km';
  domain?: string;
  features: {
    agreedRateInput: boolean;       // User enters a day rate (false = engine derives its own)
    bhrOtInfo: boolean;             // BHR / OT grade info shown under role picker
    breaksAndPenalties: boolean;    // Breaks & penalties section
    mileage: boolean;               // Mileage input (e.g. miles outside M25)
    equipmentTransport: boolean;    // Equipment transport km rate toggle
    favourites: boolean;            // Favourites section in role picker
    tocWarning: boolean;            // Time Off The Clock rest gap warning
    callTypeBadges: boolean;        // Early / Late / All Night Call badges on saved days
  };
}

export interface EngineRole {
  role: string;
  department: string;
  minRate: number | null;
  maxRate: number | null;
  engineData: Record<string, unknown>;
  specialRules?: string;
  isCustom?: boolean;
  customId?: string;
  isBuyout?: boolean;
}

export interface EngineDayType {
  value: string;
  label: string;
  defaultWrapHours?: number;
}

export interface EngineLineItem {
  description: string;
  hours: number;
  rate: number;
  total: number;
  timeFrom?: string;
  timeTo?: string;
  isDayRate?: boolean;
}

export interface EngineResult {
  lineItems: EngineLineItem[];
  subtotal: number;
  travelPay: number;
  mileage: number;
  mileageDistance: number;
  penalties: EngineLineItem[];
  equipmentValue: number;
  equipmentDiscount: number;
  equipmentTotal: number;
  grandTotal: number;
  dayDescription: string;
  extra?: Record<string, unknown>;
}

export interface EngineCalculationInput {
  role: EngineRole;
  agreedDailyRate: number;
  dayType: string;
  dayOfWeek: string;
  callTime: string;
  wrapTime: string;
  firstBreakGiven: boolean;
  firstBreakTime?: string;
  firstBreakDurationMins: number;
  secondBreakGiven: boolean;
  secondBreakTime?: string;
  secondBreakDurationMins: number;
  continuousFirstBreakGiven: boolean;
  continuousAdditionalBreakGiven: boolean;
  travelHours: number;
  mileageDistance: number;
  previousWrapTime?: string;
  equipmentValue?: number;
  equipmentDiscount?: number;
  extra?: Record<string, unknown>;
}

export interface CalculatorEngine {
  meta: EngineMeta;
  roles: EngineRole[];
  departments: string[];
  dayTypes: EngineDayType[];
  getRolesByDepartment(department: string): EngineRole[];
  getRole(roleName: string): EngineRole | undefined;
  calculate(input: EngineCalculationInput): EngineResult;
}
