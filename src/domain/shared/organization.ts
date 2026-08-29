export interface Organization {
  readonly name: string;
}

export function createOrganization(name: string): Organization {
  if (!name || name.trim().length === 0) {
    throw new Error('Organization name must not be empty');
  }
  return { name: name.trim() };
}

export function organizationEquals(a: Organization, b: Organization): boolean {
  return a.name === b.name;
}

export type Developer = Organization;
export type Publisher = Organization;

export const createDeveloper = createOrganization;
export const createPublisher = createOrganization;
export const developerEquals = organizationEquals;
export const publisherEquals = organizationEquals;
