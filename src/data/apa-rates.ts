export type OTGrade = 'I' | 'II' | 'III' | 'N/A';

export interface CrewRole {
  role: string;
  department: string;
  minRate: number | null;
  maxRate: number | null;
  otGrade: OTGrade;
  otCoefficient: number;
  specialRules?: string;
  /** Optional override for Basic Hourly Rate (default: agreedDailyRate / 10) */
  customBhr?: number;
  /** True for user-created roles stored in Supabase */
  isCustom?: boolean;
  /** Supabase row ID for custom roles */
  customId?: string;
}

// All rates from APA Appendix 1 (Effective 1 Sept 2025)
export const APA_CREW_ROLES: CrewRole[] = [
  // Direction
  { role: 'Director', department: 'Direction', minRate: null, maxRate: 933, otGrade: 'N/A', otCoefficient: 0 },
  { role: 'Casting Director', department: 'Direction', minRate: 655, maxRate: 852, otGrade: 'N/A', otCoefficient: 0, specialRules: 'session_fees' },
  { role: '1st Assistant Director', department: 'Direction', minRate: null, maxRate: 785, otGrade: 'III', otCoefficient: 1.0 },
  { role: '2nd Assistant Director', department: 'Direction', minRate: 345, maxRate: 435, otGrade: 'I', otCoefficient: 1.5 },
  { role: '3rd Assistant Director', department: 'Direction', minRate: 299, maxRate: 326, otGrade: 'I', otCoefficient: 1.5 },
  { role: 'Floor Runner / AD Trainee', department: 'Direction', minRate: null, maxRate: 238, otGrade: 'N/A', otCoefficient: 0, specialRules: 'pm_pa_runner' },

  // Production
  { role: 'Producer', department: 'Production', minRate: null, maxRate: 933, otGrade: 'N/A', otCoefficient: 0 },
  { role: 'Production Manager', department: 'Production', minRate: 489, maxRate: 609, otGrade: 'N/A', otCoefficient: 0, specialRules: 'pm_pa_runner' },
  { role: 'Production Runner', department: 'Production', minRate: null, maxRate: 238, otGrade: 'N/A', otCoefficient: 0, specialRules: 'pm_pa_runner' },
  { role: 'Location Manager', department: 'Production', minRate: 489, maxRate: 580, otGrade: 'II', otCoefficient: 1.25 },
  { role: 'Production Assistant', department: 'Production', minRate: 340, maxRate: 428, otGrade: 'N/A', otCoefficient: 0, specialRules: 'pm_pa_runner' },
  { role: 'Script Supervisor', department: 'Production', minRate: 449, maxRate: 558, otGrade: 'II', otCoefficient: 1.25 },

  // Camera
  { role: 'Director Of Photography', department: 'Camera', minRate: 908, maxRate: 1516, otGrade: 'III', otCoefficient: 1.0 },
  { role: 'Camera Operator', department: 'Camera', minRate: 514, maxRate: 637, otGrade: 'II', otCoefficient: 1.25 },
  { role: 'Focus Puller (1st AC)', department: 'Camera', minRate: 448, maxRate: 558, otGrade: 'II', otCoefficient: 1.25 },
  { role: 'Clapper Loader', department: 'Camera', minRate: 345, maxRate: 435, otGrade: 'I', otCoefficient: 1.5 },
  { role: 'DIT', department: 'Camera', minRate: null, maxRate: 512, otGrade: 'II', otCoefficient: 1.25 },

  // Grip
  { role: 'Key Grip or has NVQ3', department: 'Grip', minRate: null, maxRate: 558, otGrade: 'II', otCoefficient: 1.25 },
  { role: 'Non Key Grip', department: 'Grip', minRate: null, maxRate: 511, otGrade: 'II', otCoefficient: 1.25 },

  // Video
  { role: 'Senior Video Operator', department: 'Video', minRate: null, maxRate: 503, otGrade: 'II', otCoefficient: 1.25 },
  { role: 'Video Operator', department: 'Video', minRate: 324, maxRate: 391, otGrade: 'I', otCoefficient: 1.5 },

  // Lighting
  { role: 'Gaffer', department: 'Lighting', minRate: null, maxRate: 568, otGrade: 'II', otCoefficient: 1.25 },
  { role: 'Lighting Technician', department: 'Lighting', minRate: null, maxRate: 444, otGrade: 'I', otCoefficient: 1.5 },
  { role: 'Advanced Rigger', department: 'Lighting', minRate: 331, maxRate: 386, otGrade: 'I', otCoefficient: 1.5 },
  { role: 'Basic Rigger', department: 'Lighting', minRate: 326, maxRate: 345, otGrade: 'I', otCoefficient: 1.5 },
  { role: 'Programmable Lighting Desk Op.', department: 'Lighting', minRate: 378, maxRate: 512, otGrade: 'II', otCoefficient: 1.25 },

  // SFX
  { role: 'SFX Supervisor', department: 'SFX', minRate: 935, maxRate: 1516, otGrade: 'III', otCoefficient: 1.0 },
  { role: 'Sr. SFX Technician', department: 'SFX', minRate: 525, maxRate: 649, otGrade: 'II', otCoefficient: 1.25 },
  { role: 'SFX Technician', department: 'SFX', minRate: 418, maxRate: 519, otGrade: 'II', otCoefficient: 1.25 },
  { role: 'SFX Assistant', department: 'SFX', minRate: 346, maxRate: 435, otGrade: 'I', otCoefficient: 1.5 },

  // Animation
  { role: 'Model Animator', department: 'Animation', minRate: 611, maxRate: 796, otGrade: 'III', otCoefficient: 1.0 },
  { role: 'Model Animator Asst.', department: 'Animation', minRate: 449, maxRate: 558, otGrade: 'II', otCoefficient: 1.25 },

  // Art
  { role: 'Art Director', department: 'Art', minRate: 655, maxRate: 852, otGrade: 'III', otCoefficient: 1.0 },
  { role: 'Asst. Art Director', department: 'Art', minRate: 479, maxRate: 568, otGrade: 'II', otCoefficient: 1.25 },
  { role: 'Stylist', department: 'Art', minRate: 504, maxRate: 628, otGrade: 'II', otCoefficient: 1.25 },
  { role: 'Props Buyer', department: 'Art', minRate: 479, maxRate: 568, otGrade: 'II', otCoefficient: 1.25 },
  { role: 'Master Props', department: 'Art', minRate: 402, maxRate: 506, otGrade: 'II', otCoefficient: 1.25 },
  { role: 'Props', department: 'Art', minRate: 331, maxRate: 386, otGrade: 'I', otCoefficient: 1.5 },
  { role: 'Props Assistant', department: 'Art', minRate: 264, maxRate: 310, otGrade: 'I', otCoefficient: 1.5 },

  // Construction
  { role: 'Construction Manager', department: 'Construction', minRate: 427, maxRate: 532, otGrade: 'II', otCoefficient: 1.25 },
  { role: 'Master Painter', department: 'Construction', minRate: 395, maxRate: 497, otGrade: 'II', otCoefficient: 1.25 },
  { role: 'Painter', department: 'Construction', minRate: 331, maxRate: 386, otGrade: 'I', otCoefficient: 1.5 },
  { role: 'Master Carpenter', department: 'Construction', minRate: 395, maxRate: 497, otGrade: 'II', otCoefficient: 1.25 },
  { role: 'Carpenter', department: 'Construction', minRate: 331, maxRate: 386, otGrade: 'I', otCoefficient: 1.5 },
  { role: 'Master Plaster', department: 'Construction', minRate: 395, maxRate: 497, otGrade: 'II', otCoefficient: 1.25 },
  { role: 'Plasterer', department: 'Construction', minRate: 331, maxRate: 386, otGrade: 'I', otCoefficient: 1.5 },
  { role: 'Scenic Artist', department: 'Construction', minRate: 537, maxRate: 714, otGrade: 'III', otCoefficient: 1.0 },
  { role: 'Standby Construction', department: 'Construction', minRate: 331, maxRate: 386, otGrade: 'I', otCoefficient: 1.5 },

  // Catering
  { role: 'Home Economist', department: 'Catering', minRate: 525, maxRate: 649, otGrade: 'II', otCoefficient: 1.25 },

  // Stage
  { role: 'Stage Hand', department: 'Stage', minRate: 307, maxRate: 359, otGrade: 'I', otCoefficient: 1.5 },
  { role: 'Labourer', department: 'Stage', minRate: 249, maxRate: 299, otGrade: 'I', otCoefficient: 1.5 },
  { role: 'Driver', department: 'Stage', minRate: 249, maxRate: 299, otGrade: 'I', otCoefficient: 1.5 },

  // Sound
  { role: 'Sound Mixer', department: 'Sound', minRate: 525, maxRate: 649, otGrade: 'II', otCoefficient: 1.25 },
  { role: 'Boom Operator', department: 'Sound', minRate: 419, maxRate: 519, otGrade: 'II', otCoefficient: 1.25 },
  { role: 'Sound Maintenance', department: 'Sound', minRate: 346, maxRate: 423, otGrade: 'I', otCoefficient: 1.5 },
  { role: 'Sound Assistant', department: 'Sound', minRate: 324, maxRate: 391, otGrade: 'I', otCoefficient: 1.5 },

  // Costume
  { role: 'Costume Designer', department: 'Costume', minRate: 546, maxRate: 674, otGrade: 'II', otCoefficient: 1.25 },
  { role: 'Wardrobe Buyer', department: 'Costume', minRate: 546, maxRate: 674, otGrade: 'II', otCoefficient: 1.25 },
  { role: 'Wardrobe', department: 'Costume', minRate: 331, maxRate: 386, otGrade: 'I', otCoefficient: 1.5 },

  // Hair & Makeup
  { role: 'Chief Make Up Artist', department: 'Hair & Makeup', minRate: 525, maxRate: 649, otGrade: 'II', otCoefficient: 1.25 },
  { role: 'Make Up', department: 'Hair & Makeup', minRate: 331, maxRate: 386, otGrade: 'I', otCoefficient: 1.5 },
  { role: 'Chief Hair Designer', department: 'Hair & Makeup', minRate: 525, maxRate: 649, otGrade: 'II', otCoefficient: 1.25 },
  { role: 'Hairdresser', department: 'Hair & Makeup', minRate: 331, maxRate: 386, otGrade: 'I', otCoefficient: 1.5 },

  // Safety
  { role: 'Covid Supervisor', department: 'Safety', minRate: null, maxRate: 435, otGrade: 'I', otCoefficient: 1.5 },
];

export const DEPARTMENTS = [...new Set(APA_CREW_ROLES.map(r => r.department))];

export function getRolesByDepartment(department: string): CrewRole[] {
  return APA_CREW_ROLES.filter(r => r.department === department);
}

export function getRole(roleName: string): CrewRole | undefined {
  return APA_CREW_ROLES.find(r => r.role === roleName);
}
