import {
  buildPortadaRebuildCandidateList,
  mergePortadaPriorityImageUrls,
  parsePortadaSupplementHeroUrl,
  parsePortadaSupplementHeroWorkspacePath,
} from '../marketplace-image-pipeline/candidate-scoring.service';

describe('P105 supplement hero precedence', () => {
  const suppliers = [
    'https://ae01.alicdn.com/kf/Saaaa1111.jpg',
    'https://ae01.alicdn.com/kf/Sbbbb2222.jpg',
  ];

  it('places portadaSupplementHeroUrl first', () => {
    const pd = JSON.stringify({
      mlImagePipeline: { portadaSupplementHeroUrl: 'https://cdn.example.com/clean.jpg' },
    });
    const list = buildPortadaRebuildCandidateList(suppliers, pd);
    expect(list[0]!.sourceKind).toBe('portada_supplement_hero');
    expect(list[0]!.url).toContain('cdn.example.com');
    expect(list.some((c) => c.sourceKind === 'supplier')).toBe(true);
  });

  it('uses workspace supplement when URL not set', () => {
    const pd = JSON.stringify({
      mlImagePipeline: {
        portadaSupplementHeroWorkspaceRelativePath: 'artifacts/ml-image-packs/product-32714/hero.png',
      },
    });
    const list = buildPortadaRebuildCandidateList(suppliers, pd, 'C:\\repo');
    expect(list[0]!.sourceKind).toBe('portada_supplement_hero');
    expect(list[0]!.workspaceAbsolutePath).toContain('hero.png');
  });

  it('prefers HTTP supplement over workspace when both in metadata (URL wins)', () => {
    const pd = JSON.stringify({
      mlImagePipeline: {
        portadaSupplementHeroUrl: 'https://cdn.example.com/a.jpg',
        portadaSupplementHeroWorkspaceRelativePath: 'artifacts/x.png',
      },
    });
    const list = buildPortadaRebuildCandidateList(suppliers, pd, 'C:\\repo');
    expect(list[0]!.url).toContain('cdn.example.com');
    expect(list[0]!.workspaceAbsolutePath).toBeUndefined();
  });

  it('mergePortadaPriorityImageUrls orders supplement before AliExpress', () => {
    const pd = JSON.stringify({
      mlImagePipeline: { portadaSupplementHeroUrl: 'https://cdn.example.com/z.png' },
    });
    const merged = mergePortadaPriorityImageUrls(suppliers, pd);
    expect(merged[0]).toContain('cdn.example.com');
  });

  it('parsePortadaSupplementHeroUrl rejects non-http', () => {
    expect(parsePortadaSupplementHeroUrl(JSON.stringify({ mlImagePipeline: { portadaSupplementHeroUrl: 'ftp://x' } }))).toBeNull();
  });

  it('parsePortadaSupplementHeroWorkspacePath rejects traversal', () => {
    expect(
      parsePortadaSupplementHeroWorkspacePath(
        JSON.stringify({
          mlImagePipeline: { portadaSupplementHeroWorkspaceRelativePath: '../../../etc/passwd' },
        }),
        'C:\\safe\\root'
      )
    ).toBeNull();
  });
});
