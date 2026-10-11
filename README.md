# Spatial Notes experiment archive

This repository publishes a frozen static snapshot of the research document and experiment viewer to GitHub Pages. It does not run a model or a simulator, and requires no Python service or API credentials.

## Pages

- `site/index.html`: 当前文档
- `site/experiments.html`: 实验记录, including the four saved experiment variants
- `site/reasons.html`: the separately generated Chinese step-record reader

The snapshot contains 58 runs, 777 trajectory frames, 128 robot replay frames, 259 Harness input steps, and 890 deduplicated original images. Saved observations, geometry, model inputs, and model outputs are retained. The standalone Chinese reader covers its original 49 records; it is not a newly expanded 58-record reader.

All website dependencies are under `site/`. Links and data/image paths are relative, allowing deployment under a GitHub project-site path. The export does not automatically synchronize with later local experiment changes.

## Verification and publishing

Run `node verify-site.cjs` to check the exported file hashes, recorded-data coverage, all recorded image routes, GitHub project-path resolution, file-size limits, and high-confidence credential patterns. This pattern scan is a precaution, not a guarantee that every type of sensitive content is absent.

In repository Settings → Pages, select **GitHub Actions**. Pushing `main`, or manually running the **Publish static experiment archive** workflow, verifies and publishes `site/`. The workflow uses the official GitHub Pages actions pinned to verified commit IDs.

The proposed personal-account GitHub Pages website would be public, even when its source repository is private. Private repository publishing requires a supported paid GitHub plan; private website access requires an eligible Enterprise Cloud organization. Publication has not been authorized yet: keep this checkout local until the user chooses the website access scope and hosting destination. Full saved experiment inputs/outputs and local source-path provenance included in the snapshot are archive content. Do not add API credentials, unrelated personal files, or simulator installations.

`.gitattributes` disables newline conversion to keep the original snapshot bytes and recorded file hashes identical on Windows and GitHub Actions Linux runners.

The original static export and its ZIP remain separately preserved on the local machine.
