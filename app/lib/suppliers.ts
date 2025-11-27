// Supplier Directory - Pre-configured suppliers for Promos Ink

export interface Supplier {
  id: string;
  name: string;
  shortName: string;
  website: string;
  zipCodes: string[]; // Multiple ZIP codes for suppliers with multiple locations
  city: string;
  state: string;
  category: string;
  contact?: {
    phone?: string;
    email?: string;
  };
  notes?: string;
}

// Pre-configured suppliers based on user requirements
export const DEFAULT_SUPPLIERS: Supplier[] = [
  {
    id: 'image-tech',
    name: 'Image Technology',
    shortName: 'Image Tech',
    website: 'https://www.imagetechnology.com/',
    zipCodes: ['92801'], // Anaheim, CA
    city: 'Anaheim',
    state: 'CA',
    category: 'Screen Printing Inks & Chemicals',
    contact: {
      phone: '714-252-0160',
      email: 'sales@imagetechnology.com'
    },
    notes: 'Plastisol inks, water-based inks, reclaiming chemicals'
  },
  {
    id: 'grimco',
    name: 'Grimco',
    shortName: 'Grimco',
    website: 'https://www.grimco.com/',
    zipCodes: [
      '63146', // St. Louis, MO (HQ)
      '75234', // Dallas, TX
      '30340', // Atlanta, GA
      '85043', // Phoenix, AZ
      '90670', // Santa Fe Springs, CA
      '46268', // Indianapolis, IN
      '08817', // Edison, NJ
      '98032', // Kent, WA
      '80239', // Denver, CO
      '33166', // Miami, FL
    ],
    city: 'St. Louis (HQ)',
    state: 'MO',
    category: 'Sign & Graphics Supplies',
    notes: 'Wholesale sign supplies, vinyl, substrates - Multiple US locations'
  },
  {
    id: 'nazdar-sourceone',
    name: 'Nazdar SourceOne',
    shortName: 'Nazdar',
    website: 'https://sourceone.nazdar.com/',
    zipCodes: [
      '66062', // Shawnee, KS (HQ)
      '91761', // Ontario, CA
      '30336', // Atlanta, GA
      '07407', // Fairlawn, NJ
      '75062', // Irving, TX
    ],
    city: 'Shawnee (HQ)',
    state: 'KS',
    category: 'Ink & Printing Supplies',
    notes: 'Screen printing inks, digital inks, supplies'
  },
  {
    id: 'kornit',
    name: 'Kornit Digital',
    shortName: 'Kornit',
    website: 'https://www.kornit.com/',
    zipCodes: [
      '07652', // Paramus, NJ (US HQ)
      '91302', // Calabasas, CA
    ],
    city: 'Paramus (US HQ)',
    state: 'NJ',
    category: 'Digital Printing Equipment & Inks',
    notes: 'DTG printers, industrial printing systems, NeoPigment inks'
  }
];

// Get all ZIP codes from all suppliers
export function getAllSupplierZips(): string[] {
  const zips: string[] = [];
  DEFAULT_SUPPLIERS.forEach(supplier => {
    zips.push(...supplier.zipCodes);
  });
  return [...new Set(zips)]; // Remove duplicates
}

// Find supplier by ZIP code
export function findSupplierByZip(zip: string): Supplier | undefined {
  return DEFAULT_SUPPLIERS.find(s => s.zipCodes.includes(zip));
}

// Find supplier by ID
export function findSupplierById(id: string): Supplier | undefined {
  return DEFAULT_SUPPLIERS.find(s => s.id === id);
}

// Get supplier name from ZIP
export function getSupplierNameByZip(zip: string): string | null {
  const supplier = findSupplierByZip(zip);
  return supplier ? supplier.name : null;
}

