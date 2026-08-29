export interface DistributionChannel {
  readonly name: string;
}

export function createDistributionChannel(name: string): DistributionChannel {
  if (!name || name.trim().length === 0) {
    throw new Error('DistributionChannel name must not be empty');
  }
  return { name: name.trim() };
}

export function distributionChannelEquals(a: DistributionChannel, b: DistributionChannel): boolean {
  return a.name === b.name;
}
