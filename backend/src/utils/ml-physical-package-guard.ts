/**
 * Minimum physical truth required before Mercado Libre Chile listing creation.
 */

export interface MlPhysicalPackageShape {
  packageWeightGrams?: number | null;
  packageLengthCm?: number | null;
  packageWidthCm?: number | null;
  packageHeightCm?: number | null;
  maxUnitsPerOrder?: number | null;
}

export function getMlPhysicalPackageBlockers(product: MlPhysicalPackageShape): string[] {
  const blockers: string[] = [];
  const w = product.packageWeightGrams;
  if (w == null || !Number.isFinite(Number(w)) || Number(w) <= 0) {
    blockers.push('packageWeightGrams must be a positive integer (grams)');
  }
  const l = product.packageLengthCm;
  if (l == null || !Number.isFinite(Number(l)) || Number(l) <= 0) {
    blockers.push('packageLengthCm must be a positive integer (cm)');
  }
  const wi = product.packageWidthCm;
  if (wi == null || !Number.isFinite(Number(wi)) || Number(wi) <= 0) {
    blockers.push('packageWidthCm must be a positive integer (cm)');
  }
  const h = product.packageHeightCm;
  if (h == null || !Number.isFinite(Number(h)) || Number(h) <= 0) {
    blockers.push('packageHeightCm must be a positive integer (cm)');
  }
  const maxU = product.maxUnitsPerOrder ?? 1;
  if (!Number.isFinite(Number(maxU)) || Number(maxU) < 1) {
    blockers.push('maxUnitsPerOrder must be >= 1');
  }
  return blockers;
}

export function hasCompleteMlPhysicalPackage(product: MlPhysicalPackageShape): boolean {
  return getMlPhysicalPackageBlockers(product).length === 0;
}
