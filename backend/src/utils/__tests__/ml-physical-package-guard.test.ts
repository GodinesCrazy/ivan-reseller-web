import { getMlPhysicalPackageBlockers, hasCompleteMlPhysicalPackage } from '../ml-physical-package-guard';

describe('ml-physical-package-guard', () => {
  it('returns no blockers when all package fields are valid', () => {
    const p = {
      packageWeightGrams: 500,
      packageLengthCm: 20,
      packageWidthCm: 15,
      packageHeightCm: 10,
      maxUnitsPerOrder: 2,
    };
    expect(getMlPhysicalPackageBlockers(p)).toEqual([]);
    expect(hasCompleteMlPhysicalPackage(p)).toBe(true);
  });

  it('blocks when weight or dimensions missing', () => {
    const p = {
      packageWeightGrams: null,
      packageLengthCm: 20,
      packageWidthCm: 15,
      packageHeightCm: 10,
      maxUnitsPerOrder: 1,
    };
    expect(getMlPhysicalPackageBlockers(p).length).toBeGreaterThan(0);
    expect(hasCompleteMlPhysicalPackage(p)).toBe(false);
  });
});
