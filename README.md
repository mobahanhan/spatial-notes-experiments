# Spatial Notes experiment archive

This repository publishes a frozen static snapshot of the research document and experiment viewer to GitHub Pages. It does not run a model or a simulator, and requires no Python service or API credentials.

## Pages

- `site/index.html`: 当前文档
- `site/experiments.html`: 实验记录, including the four saved experiment variants
- `site/reasons.html`: the separately generated Chinese step-record reader

The snapshot contains 69 runs, 928 trajectory frames, 128 robot replay frames, 259 Harness input steps, and 1041 original PNG images. Saved observations, geometry, model inputs, and model outputs are retained. The standalone Chinese reader covers its original 49 records; it is not a newly expanded 69-record reader.

The direct-observation column now covers all 20 tasks: the original nine sessions and eleven additional UI-only sessions, each assigned to an independent Agent with no parent conversation inherited. New sessions use at most 30 engine actions; scoring is performed after submission and is never supplied as feedback for a retry. The original 58 catalog entries and nine-task common comparison cohort are preserved. Answer accuracy and reviewed accuracy are both 13/20 (65%); no direct-observation result is currently labeled suspected-correct. Per the user's updated review, direct-observation Connectivity and Correspondence submissions are labeled correct or incorrect solely by answer correctness; the other columns' labels are unchanged. Incorrect submissions and renderer anomalies are not removed. The raw experimental data and benchmark scores are unchanged.

New run provenance identifies any batch-local dependency-loading override. The simulator, dependency wheels and private task manifests are not deployed or executed by this static website. No existing simulator environment package or system DLL was replaced for this continuation.

All website dependencies are under `site/`. Links and data/image paths are relative, allowing deployment under a GitHub project-site path. The export does not automatically synchronize with later local experiment changes.

## Verification and publishing

Run `node verify-site.cjs` to check the exported file hashes, recorded-data coverage, all recorded image routes, GitHub project-path resolution, file-size limits, and high-confidence credential patterns. This pattern scan is a precaution, not a guarantee that every type of sensitive content is absent.

In repository Settings → Pages, select **GitHub Actions**. Pushing `main`, or manually running the **Publish static experiment archive** workflow, verifies and publishes `site/`. The workflow uses the official GitHub Pages actions pinned to verified commit IDs.

The user authorized a public repository and public GitHub Pages website on 2026-10-11. Full saved experiment inputs/outputs and local source-path provenance included in the snapshot are archive content. Do not add API credentials, unrelated personal files, or simulator installations.

`.gitattributes` disables newline conversion to keep the original snapshot bytes and recorded file hashes identical on Windows and GitHub Actions Linux runners.

The original static export and its ZIP remain separately preserved on the local machine.
